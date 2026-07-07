// Vercel Serverless Function: /api/insurance-chat.js
// ตั้ง Environment Variable: OPENAI_API_KEY และ optional OPENAI_MODEL, ALLOWED_ORIGIN

function extractTextFromResponsesApi(result) {
  if (typeof result?.output_text === 'string' && result.output_text.trim()) {
    return result.output_text.trim();
  }

  const chunks = [];
  const output = Array.isArray(result?.output) ? result.output : [];

  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const c of content) {
      if (typeof c?.text === 'string' && c.text.trim()) chunks.push(c.text.trim());
      if (typeof c?.output_text === 'string' && c.output_text.trim()) chunks.push(c.output_text.trim());
      if (typeof c?.content === 'string' && c.content.trim()) chunks.push(c.content.trim());
    }

    // เผื่อ provider/response บางรุ่นวาง text ไว้ที่ item โดยตรง
    if (item?.type === 'message' && typeof item?.text === 'string' && item.text.trim()) {
      chunks.push(item.text.trim());
    }
  }

  return chunks.join('\n\n').trim();
}

function summarizeOutputTypes(result) {
  const output = Array.isArray(result?.output) ? result.output : [];
  return output.map(item => ({
    type: item?.type || null,
    status: item?.status || null,
    contentTypes: Array.isArray(item?.content) ? item.content.map(c => c?.type || null) : []
  }));
}

function routeModel(question) {
  const q = (question || "").toLowerCase();

  const hardKeywords = [
    "ข้อยกเว้น", "ถอดข้อยกเว้น", "cof", "underwrite", "underwriting",
    "birads", "mammogram", "ultrasound", "cyst", "ซีสต์", "ก้อน",
    "เบาหวาน", "ความดัน", "มะเร็ง", "ผ่าตัด", "admit", "ipd",
    "เคยเป็น", "ประวัติ", "โรคประจำตัว", "ใบรับรองแพทย์"
  ];

  const mediumKeywords = [
    "เลือก", "เทียบ", "คุ้ม", "แผนไหนดี", "งบ", "เบี้ย",
    "d health lite", "elite", "care plus", "extra care plus",
    "deductible", "copayment", "opd"
  ];

  const easyKeywords = [
    "คืออะไร", "หมายถึง", "ต่างกันยังไง", "ระยะรอคอย",
    "แฟกซ์เคลม", "สำรองจ่าย"
  ];

  if (hardKeywords.some(k => q.includes(k))) {
    return {
      model: process.env.OPENAI_MODEL_HARD || "gpt-5.5",
      maxOutputTokens: 700,
      useWebSearch: false
    };
  }

  if (mediumKeywords.some(k => q.includes(k))) {
    return {
      model: process.env.OPENAI_MODEL_MEDIUM || "gpt-5.4-mini",
      maxOutputTokens: 500,
      useWebSearch: false
    };
  }

  if (easyKeywords.some(k => q.includes(k))) {
    return {
      model: process.env.OPENAI_MODEL_EASY || "gpt-5.4-nano",
      maxOutputTokens: 350,
      useWebSearch: false
    };
  }

  return {
    model: process.env.OPENAI_MODEL_DEFAULT || "gpt-5.4-mini",
    maxOutputTokens: 450,
    useWebSearch: false
  };
}

async function callOpenAI(payload) {
  const upstream = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const result = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const message = result?.error?.message || `OpenAI API error: HTTP ${upstream.status}`;
    const err = new Error(message);
    err.status = upstream.status;
    err.detail = result;
    throw err;
  }
  return result;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not configured on server' });
  }

  try {
    const { question = '', resources = [], allowWebSearch = true } = req.body || {};
    const q = String(question).trim();
    if (!q) return res.status(400).json({ error: 'Missing question' });
    
    const route = routeModel(q);

    const resourceText = (Array.isArray(resources) ? resources : []).slice(0, 30).map((r, i) => {
      const title = String(r.title || '').replace(/\s+/g, ' ').trim();
      const content = String(r.body || '').replace(/\s+\n/g, '\n').trim();
      return `### RESOURCE ${i + 1}: ${title}\n${content}`;
    }).join('\n\n---\n\n').slice(0, 90000);

    const instructions = `คุณคือ AI ผู้ช่วยตอบคำถามประกันสุขภาพของ Doctor Insurance โดยหมอกึ๊ก

หลักการตอบ:
- ตอบภาษาไทย สุภาพ กระชับ อ่านง่าย แต่ต้องมีเหตุผล
- ยึด Resource/FAQ ที่ส่งมาเป็นหลักก่อนเสมอ
- จำกัดคำตอบไม่เกิน 6-8 บรรทัด
- ถ้าจำเป็นให้ใช้ bullet สั้น ๆ ไม่เกิน 5 bullet
- ห้ามตอบยาวเป็นบทความ
- ถ้าข้อมูลใน Resource ไม่พอ และมี web_search ให้ค้นข้อมูลเพิ่มเติมได้ โดยเน้น แหล่งทางการ เช่น muangthai.co.th หรือ muangthai-agent.com อย่าหาเว็บที่ไม่น่าเชื่อถือ
- ถ้าข้อมูลไม่พอ ให้บอกว่าข้อมูลไม่พอและแนะนำให้ปรึกษาตัวแทน/บริษัท
- ห้ามแต่งเงื่อนไขกรมธรรม์เอง ถ้าไม่แน่ใจให้บอกว่าไม่ทราบ/ต้องตรวจเงื่อนไขกรมธรรม์หรือถามบริษัท
- ห้ามให้คำมั่นว่าเคลมได้แน่นอนหรือรับประกันได้แน่นอน
- สำหรับคำถามด้าน underwriting/เคลม ให้แนะนำว่าต้องดูเอกสารกรมธรรม์ ประวัติสุขภาพ และดุลพินิจบริษัท อย่าตอบการันตีว่า ทำได้แน่นอน หรือไม่ผ่านแน่ๆ 
- หลีกเลี่ยงคำตอบยาวเป็นพรื้ด ให้จัดเป็นย่อหน้าและ bullet เท่าที่จำเป็น`;

    const basePayload = {
      model: route.model,
      reasoning: { effort: 'low' },
      max_output_tokens: route.maxOutputTokens,
      instructions,
      input: `คำถามลูกค้า:\n${q}\n\nRESOURCE/FAQ จากเว็บไซต์ Doctor Insurance:\n${resourceText}`,
    };

    let payload = { ...basePayload };
    if (allowWebSearch !== false && route.useWebSearch) {
  payload.tools = [{
    type: 'web_search',
    search_context_size: 'low',
    filters: { allowed_domains: ['muangthai-agent.com', 'muangthai.co.th'] }
  }];
}

    let result = await callOpenAI(payload);
    let answer = extractTextFromResponsesApi(result);
    let usedWebSearch = allowWebSearch !== false;
    let retriedWithoutWebSearch = false;

    // บางครั้ง Responses API อาจคืน tool/reasoning item มาแต่ยังไม่มีข้อความ output_text
    // ให้ retry อีกครั้งโดยปิด web_search เพื่อให้ได้คำตอบจาก resource ในเว็บก่อน แทนที่จะปล่อยหน้าเว็บ error
    if (!answer && payload.tools) {
      retriedWithoutWebSearch = true;
      usedWebSearch = false;
      result = await callOpenAI(basePayload);
      answer = extractTextFromResponsesApi(result);
    }

    if (!answer) {
      return res.status(502).json({
        error: 'OpenAI response completed but no text answer was found',
        status: result?.status || null,
        outputTypes: summarizeOutputTypes(result),
      });
    }

    return res.status(200).json({
      answer,
      usedWebSearch,
      retriedWithoutWebSearch,
      model: payload.model,
    });
  } catch (err) {
    const status = Number(err?.status) || 500;
    return res.status(status).json({
      error: err?.message || 'Server error',
      detail: err?.detail || null,
    });
  }
}

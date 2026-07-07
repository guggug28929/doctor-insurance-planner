// Vercel Serverless Function: /api/insurance-chat.js
// ตั้ง Environment Variable: OPENAI_API_KEY และ optional OPENAI_MODEL

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY is not configured on server' });

  const { question = '', resources = [], allowWebSearch = true } = req.body || {};
  const q = String(question).trim();
  if (!q) return res.status(400).json({ error: 'Missing question' });

  const resourceText = (Array.isArray(resources) ? resources : []).slice(0, 30).map((r, i) => {
    const title = String(r.title || '').replace(/\s+/g, ' ').trim();
    const content = String(r.body || '').replace(/\s+\n/g, '\n').trim();
    return `### RESOURCE ${i + 1}: ${title}\n${content}`;
  }).join('\n\n---\n\n').slice(0, 90000);

  const instructions = `คุณคือ AI ผู้ช่วยตอบคำถามประกันสุขภาพของ Doctor Insurance โดยหมอกึ๊ก\n\nหลักการตอบ:\n- ตอบภาษาไทย สุภาพ กระชับ อ่านง่าย แต่ต้องมีเหตุผล\n- ยึด Resource/FAQ ที่ส่งมาเป็นหลักก่อนเสมอ\n- ถ้าข้อมูลใน Resource ไม่พอ และมี web_search ให้ค้นข้อมูลเพิ่มเติมได้ โดยเน้น doctor-insurance.com และแหล่งทางการ เช่น muangthai.co.th\n- ห้ามแต่งเงื่อนไขกรมธรรม์เอง ถ้าไม่แน่ใจให้บอกว่าไม่ทราบ/ต้องตรวจเงื่อนไขกรมธรรม์หรือถามบริษัท\n- ห้ามให้คำมั่นว่าเคลมได้แน่นอนหรือรับประกันได้แน่นอน\n- สำหรับคำถามด้าน underwriting/เคลม ให้แนะนำว่าต้องดูเอกสารกรมธรรม์ ประวัติสุขภาพ และดุลพินิจบริษัท\n- หลีกเลี่ยงคำตอบยาวเป็นพรื้ด ให้จัดเป็นย่อหน้าและ bullet เท่าที่จำเป็น`;

  const payload = {
    model: process.env.OPENAI_MODEL || 'gpt-5.5',
    reasoning: { effort: 'low' },
    instructions,
    input: `คำถามลูกค้า:\n${q}\n\nRESOURCE/FAQ จากเว็บไซต์ Doctor Insurance:\n${resourceText}`,
  };
  if (allowWebSearch !== false) {
    payload.tools = [{
      type: 'web_search',
      search_context_size: 'low',
      filters: { allowed_domains: ['doctor-insurance.com', 'muangthai.co.th'] }
    }];
  }

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
    return res.status(upstream.status).json({ error: result.error?.message || 'OpenAI API error', detail: result });
  }

  return res.status(200).json({
    answer: result.output_text || '',
    usedWebSearch: allowWebSearch !== false,
    model: payload.model,
  });
}

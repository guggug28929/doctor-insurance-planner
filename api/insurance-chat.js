// Vercel Serverless Function: /api/insurance-chat.js
// Cost saver version v20: route model + relevant resource selection + cache + basic rate limit + Muang Thai domains
// Required env: OPENAI_API_KEY
// Optional env: ALLOWED_ORIGIN, OPENAI_MODEL_EASY, OPENAI_MODEL_MEDIUM, OPENAI_MODEL_HARD, OPENAI_MODEL_DEFAULT, RATE_LIMIT_PER_HOUR, RATE_LIMIT_PER_DAY

const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
const MAX_QUESTION_CHARS = 900;
const DEFAULT_RATE_LIMIT_HOUR = 10;
const DEFAULT_RATE_LIMIT_DAY = 40;

// OpenAI web_search allowed_domains expects domains, not full URLs.
// User-facing target: https://www.muangthai-agent.com/
const WEB_SEARCH_ALLOWED_DOMAINS = ['muangthai.co.th', 'www.muangthai-agent.com', 'muangthai-agent.com'];

// In-memory maps work on a warm Vercel instance. For strict production limits, use Redis/KV later.
globalThis.__insuranceChatCache = globalThis.__insuranceChatCache || new Map();
globalThis.__insuranceChatRateLimit = globalThis.__insuranceChatRateLimit || new Map();

const answerCache = globalThis.__insuranceChatCache;
const rateStore = globalThis.__insuranceChatRateLimit;

function json(res, status, data) {
  return res.status(status).json(data);
}

function normalizeThaiText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[“”"'`.,!?;:()\[\]{}<>/\\|*_~+=-]/g, ' ')
    .trim();
}

function makeCacheKey(question) {
  return normalizeThaiText(question)
    .replace(/ครับ|ค่ะ|คะ|จ้า|หน่อย|รบกวน/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280);
}

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) return xff.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

function checkRateLimit(req) {
  const ip = String(getClientIp(req));
  const now = Date.now();
  const hourMs = 1000 * 60 * 60;
  const dayMs = 1000 * 60 * 60 * 24;
  const perHour = Number(process.env.RATE_LIMIT_PER_HOUR || DEFAULT_RATE_LIMIT_HOUR);
  const perDay = Number(process.env.RATE_LIMIT_PER_DAY || DEFAULT_RATE_LIMIT_DAY);

  const item = rateStore.get(ip) || { hourStart: now, dayStart: now, hourCount: 0, dayCount: 0 };
  if (now - item.hourStart > hourMs) {
    item.hourStart = now;
    item.hourCount = 0;
  }
  if (now - item.dayStart > dayMs) {
    item.dayStart = now;
    item.dayCount = 0;
  }

  item.hourCount += 1;
  item.dayCount += 1;
  rateStore.set(ip, item);

  if (item.hourCount > perHour) {
    return { ok: false, message: `ถามครบ ${perHour} ครั้งต่อชั่วโมงแล้ว กรุณาลองใหม่ภายหลัง หรือติดต่อหมอกึ๊กโดยตรงครับ` };
  }
  if (item.dayCount > perDay) {
    return { ok: false, message: `ถามครบ ${perDay} ครั้งต่อวันแล้ว กรุณาลองใหม่พรุ่งนี้ หรือติดต่อหมอกึ๊กโดยตรงครับ` };
  }
  return { ok: true, ip, hourCount: item.hourCount, dayCount: item.dayCount };
}

function routeModel(question) {
  const q = normalizeThaiText(question);

  const hardKeywords = [
    'ข้อยกเว้น', 'ถอดข้อยกเว้น', 'cof', 'counter offer', 'underwrite', 'underwriting',
    'birads', 'mammogram', 'แมมโมแกรม', 'ultrasound', 'อัลตราซาวด์', 'ซีสต์', 'cyst', 'ก้อน',
    'มะเร็ง', 'เบาหวาน', 'ความดัน', 'หัวใจ', 'ตับ', 'ไต', 'ไทรอยด์', 'thyroid', 'breast', 'เต้านม',
    'ผ่าตัด', 'admit', 'ipd', 'ประวัติสุขภาพ', 'โรคประจำตัว', 'ใบรับรองแพทย์',
    'เคลม', 'ปฏิเสธเคลม', 'เคลมไม่ได้', 'ภาวะแทรกซ้อน'
  ];

  const mediumKeywords = [
    'เลือก', 'เทียบ', 'เปรียบเทียบ', 'คุ้ม', 'แผนไหนดี', 'งบ', 'เบี้ย',
    'd health lite', 'dhealth lite', 'd health', 'elite', 'care plus', 'extra care plus',
    'deductible', 'ดีดัก', 'copayment', 'โคเพย์', 'opd', 'ipd', 'โรคร้ายแรง',
    '99/20', '99/99', 'ทุนชีวิต', 'สวัสดิการ', 'ห้องเดี่ยว'
  ];

  const easyKeywords = [
    'คืออะไร', 'หมายถึง', 'ต่างกันยังไง', 'ต่างกันอย่างไร', 'ระยะรอคอย',
    'แฟกซ์เคลม', 'fax claim', 'direct claim', 'สำรองจ่าย', 'waiting period',
    'copay คือ', 'deductible คือ', 'opd คือ', 'ipd คือ'
  ];

  const needsWeb = shouldUseWebSearch(q);

  if (hardKeywords.some(k => q.includes(k))) {
    return {
      tier: 'hard',
      model: process.env.OPENAI_MODEL_HARD || process.env.OPENAI_MODEL_DEFAULT || process.env.OPENAI_MODEL || 'gpt-5.5',
      maxOutputTokens: 650,
      maxResources: 7,
      maxCharsPerResource: 1800,
      totalResourceChars: 12000,
      useWebSearch: needsWeb
    };
  }

  if (mediumKeywords.some(k => q.includes(k))) {
    return {
      tier: 'medium',
      model: process.env.OPENAI_MODEL_MEDIUM || process.env.OPENAI_MODEL_DEFAULT || process.env.OPENAI_MODEL || 'gpt-5.4-mini',
      maxOutputTokens: 450,
      maxResources: 5,
      maxCharsPerResource: 1500,
      totalResourceChars: 8000,
      useWebSearch: needsWeb
    };
  }

  if (easyKeywords.some(k => q.includes(k))) {
    return {
      tier: 'easy',
      model: process.env.OPENAI_MODEL_EASY || process.env.OPENAI_MODEL_DEFAULT || process.env.OPENAI_MODEL || 'gpt-5.4-mini',
      maxOutputTokens: 280,
      maxResources: 3,
      maxCharsPerResource: 1200,
      totalResourceChars: 4500,
      useWebSearch: false
    };
  }

  return {
    tier: 'default',
    model: process.env.OPENAI_MODEL_DEFAULT || process.env.OPENAI_MODEL || 'gpt-5.4-mini',
    maxOutputTokens: 380,
    maxResources: 4,
    maxCharsPerResource: 1400,
    totalResourceChars: 6500,
    useWebSearch: needsWeb
  };
}

function shouldUseWebSearch(question) {
  const q = normalizeThaiText(question);
  const webKeywords = [
    'ล่าสุด', 'อัปเดต', 'update', 'ปี 2569', 'ปี 2570', '2026', '2027',
    'เบี้ยล่าสุด', 'ตารางเบี้ยล่าสุด', 'ประกาศใหม่', 'เงื่อนไขใหม่', 'กฎหมายใหม่',
    'ตอนนี้', 'ปัจจุบัน', 'วันนี้', 'เดือนนี้'
  ];
  return webKeywords.some(k => q.includes(k));
}

function keywordSet(question) {
  const q = normalizeThaiText(question);
  const tokens = q.split(' ').filter(w => w.length >= 2);
  const fixed = [
    'copayment', 'deductible', 'opd', 'ipd', 'ระยะรอคอย', 'แฟกซ์เคลม', 'สำรองจ่าย',
    'ข้อยกเว้น', 'care plus', 'extra care plus', 'd health lite', 'elite', 'โรคร้ายแรง',
    'ทุนชีวิต', '99/20', '99/99', 'สวัสดิการ', 'เคลม', 'cof'
  ].filter(k => q.includes(k));
  return Array.from(new Set([...tokens, ...fixed]));
}

function scoreResource(resource, keys) {
  const title = normalizeThaiText(resource?.title || '');
  const body = normalizeThaiText(resource?.body || resource?.content || '');
  const hay = `${title} ${body}`;
  let score = 0;
  for (const k of keys) {
    if (!k) continue;
    if (title.includes(k)) score += 6;
    if (hay.includes(k)) score += 2;
  }
  // Boost important FAQ-like sections that often answer common questions.
  if (/faq|คำถาม|ความรู้|ประกันสุขภาพ/.test(title)) score += 1;
  return score;
}

function selectRelevantResources(resources, question, route) {
  const list = Array.isArray(resources) ? resources : [];
  if (!list.length) return '';

  const keys = keywordSet(question);
  const ranked = list
    .map((r, idx) => ({ r, idx, score: scoreResource(r, keys) }))
    .sort((a, b) => (b.score - a.score) || (a.idx - b.idx));

  // ถ้า score ต่ำหมด ให้เอา resource แรก ๆ แทน เพื่อไม่ให้ prompt ว่าง
  const selected = ranked
    .filter(x => x.score > 0)
    .slice(0, route.maxResources);

  const finalSelected = selected.length ? selected : ranked.slice(0, Math.min(3, route.maxResources));

  let usedChars = 0;
  const blocks = [];
  for (const [i, item] of finalSelected.entries()) {
    const r = item.r || {};
    const title = String(r.title || `Resource ${i + 1}`).replace(/\s+/g, ' ').trim();
    const rawContent = String(r.body || r.content || '').replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    const room = route.totalResourceChars - usedChars;
    if (room <= 0) break;
    const clipped = rawContent.slice(0, Math.min(route.maxCharsPerResource, room));
    usedChars += clipped.length;
    blocks.push(`### RESOURCE ${i + 1}: ${title}\n${clipped}`);
  }
  return blocks.join('\n\n---\n\n');
}

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

function buildInstructions(route) {
  return `คุณคือ AI ผู้ช่วยตอบคำถามประกันสุขภาพของ Doctor Insurance โดยหมอกึ๊ก

หลักการตอบ:
- ตอบภาษาไทย สุภาพ กระชับ อ่านง่าย แต่ต้องมีเหตุผล
- ยึด Resource/FAQ ที่ส่งมาเป็นหลักก่อนเสมอ
- ถ้าข้อมูลใน Resource ไม่พอ และมี web_search ให้ค้นข้อมูลเพิ่มเติมได้ โดยเน้น muangthai.co.th และ www.muangthai-agent.com
- ห้ามแต่งเงื่อนไขกรมธรรม์เอง ถ้าไม่แน่ใจให้บอกว่าไม่ทราบ/ต้องตรวจเงื่อนไขกรมธรรม์หรือถามบริษัท
- ห้ามให้คำมั่นว่าเคลมได้แน่นอนหรือรับประกันได้แน่นอน
- สำหรับคำถามด้าน underwriting/เคลม ให้แนะนำว่าต้องดูเอกสารกรมธรรม์ ประวัติสุขภาพ และดุลพินิจบริษัท
- ตอบไม่เกิน 6-8 บรรทัด ถ้าต้องอธิบายให้ใช้ bullet สั้น ๆ ไม่เกิน 5 bullet
- ถ้าเป็นคำถามง่าย ให้ตอบสั้นมาก ไม่ต้องเกริ่นยาว
- ถ้าข้อมูลไม่พอ ให้ถามข้อมูลเพิ่ม 1-3 ข้อ ไม่ต้องเดา
- ระดับคำถามที่ระบบประเมิน: ${route.tier}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  if (!process.env.OPENAI_API_KEY) {
    return json(res, 500, { error: 'OPENAI_API_KEY is not configured on server' });
  }

  try {
    const rate = checkRateLimit(req);
    if (!rate.ok) return json(res, 429, { error: rate.message });

    const { question = '', resources = [], allowWebSearch = true } = req.body || {};
    let q = String(question).trim();
    if (!q) return json(res, 400, { error: 'Missing question' });
    if (q.length > MAX_QUESTION_CHARS) q = q.slice(0, MAX_QUESTION_CHARS);

    const route = routeModel(q);
    const cacheKey = `${route.tier}:${route.model}:${makeCacheKey(q)}`;
    const cached = answerCache.get(cacheKey);
    if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
      return json(res, 200, {
        answer: cached.answer,
        cached: true,
        usedWebSearch: cached.usedWebSearch || false,
        model: cached.model,
        routeTier: cached.routeTier,
      });
    }

    const resourceText = selectRelevantResources(resources, q, route);
    const instructions = buildInstructions(route);

    const basePayload = {
      model: route.model,
      reasoning: { effort: 'low' },
      max_output_tokens: route.maxOutputTokens,
      text: { verbosity: 'low' },
      instructions,
      input: `คำถามลูกค้า:\n${q}\n\nRESOURCE/FAQ จากเว็บไซต์ Doctor Insurance:\n${resourceText || '(ไม่มี resource ที่เกี่ยวข้องถูกส่งมา)'}`,
    };

    let payload = { ...basePayload };
    if (allowWebSearch !== false && route.useWebSearch) {
      payload.tools = [{
        type: 'web_search',
        search_context_size: 'low',
        filters: { allowed_domains: WEB_SEARCH_ALLOWED_DOMAINS }
      }];
      payload.tool_choice = 'auto';
    }

    let result = await callOpenAI(payload);
    let answer = extractTextFromResponsesApi(result);
    let usedWebSearch = Boolean(payload.tools);
    let retriedWithoutWebSearch = false;

    if (!answer && payload.tools) {
      retriedWithoutWebSearch = true;
      usedWebSearch = false;
      result = await callOpenAI(basePayload);
      answer = extractTextFromResponsesApi(result);
    }

    if (!answer) {
      return json(res, 502, {
        error: 'OpenAI response completed but no text answer was found',
        status: result?.status || null,
        outputTypes: summarizeOutputTypes(result),
      });
    }

    answerCache.set(cacheKey, {
      answer,
      createdAt: Date.now(),
      model: route.model,
      routeTier: route.tier,
      usedWebSearch,
    });

    // Prevent cache from growing forever on warm instances.
    if (answerCache.size > 300) {
      const oldestKey = answerCache.keys().next().value;
      if (oldestKey) answerCache.delete(oldestKey);
    }

    return json(res, 200, {
      answer,
      cached: false,
      usedWebSearch,
      retriedWithoutWebSearch,
      model: route.model,
      routeTier: route.tier,
      usage: result?.usage || null,
    });
  } catch (err) {
    const status = Number(err?.status) || 500;
    return json(res, status, {
      error: err?.message || 'Server error',
      detail: err?.detail || null,
    });
  }
}

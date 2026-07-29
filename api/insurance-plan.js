// Vercel Serverless Function: /api/insurance-plan.js
// v22: switched from OpenAI to Claude (Anthropic) — AI advisor for the Health Plan Designer page
// Purpose: ให้ AI วิเคราะห์แพ็กเกจที่ frontend คำนวณไว้แล้ว โดยไม่ invent เบี้ย/รายการใหม่เอง
// Required env: ANTHROPIC_API_KEY
// Optional env: ALLOWED_ORIGIN, ANTHROPIC_MODEL_PLAN, ANTHROPIC_MODEL_MEDIUM, ANTHROPIC_MODEL_DEFAULT, RATE_LIMIT_PER_HOUR, RATE_LIMIT_PER_DAY

const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
const DEFAULT_RATE_LIMIT_HOUR = 8;
const DEFAULT_RATE_LIMIT_DAY = 25;
const MAX_PACKAGES = 6;
const ANTHROPIC_API_VERSION = '2023-06-01';

globalThis.__insurancePlanCache = globalThis.__insurancePlanCache || new Map();
globalThis.__insurancePlanRateLimit = globalThis.__insurancePlanRateLimit || new Map();

const answerCache = globalThis.__insurancePlanCache;
const rateStore = globalThis.__insurancePlanRateLimit;

function json(res, status, data) {
  return res.status(status).json(data);
}

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[“”"'`.,!?;:()\[\]{}<>/\\|*_~+=-]/g, ' ')
    .trim();
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
    return { ok: false, message: `วิเคราะห์แผนครบ ${perHour} ครั้งต่อชั่วโมงแล้ว กรุณาลองใหม่ภายหลัง หรือติดต่อหมอกึ๊กโดยตรงครับ` };
  }
  if (item.dayCount > perDay) {
    return { ok: false, message: `วิเคราะห์แผนครบ ${perDay} ครั้งต่อวันแล้ว กรุณาลองใหม่พรุ่งนี้ หรือติดต่อหมอกึ๊กโดยตรงครับ` };
  }
  return { ok: true, ip };
}

function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeProfile(profile = {}) {
  return {
    gender: String(profile.gender || '').slice(0, 20),
    age: safeNumber(profile.age),
    birthYear: safeNumber(profile.birthYear),
    budget: safeNumber(profile.budget),
    hasGroup: Boolean(profile.hasGroup),
    groupCoverage: safeNumber(profile.groupCoverage),
    ipdNeed: String(profile.ipdNeed || '').slice(0, 80),
    opdNeed: String(profile.opdNeed || '').slice(0, 80),
    riskChoice: String(profile.riskChoice || '').slice(0, 80),
    ciCapital: safeNumber(profile.ciCapital),
    ciStyle: String(profile.ciStyle || '').slice(0, 80),
  };
}

function sanitizePackages(packages = []) {
  const list = Array.isArray(packages) ? packages.slice(0, MAX_PACKAGES) : [];
  return list.map((p, idx) => ({
    index: safeNumber(p.index, idx),
    name: String(p.name || `Package ${idx + 1}`).slice(0, 120),
    premium: safeNumber(p.premium),
    overBudget: Boolean(p.overBudget),
    forceShownOverBudget: Boolean(p.forceShownOverBudget),
    budgetStatus: String(p.budgetStatus || '').slice(0, 40),
    recommendedBeforeAI: Boolean(p.recommendedBeforeAI),
    missing: Array.isArray(p.missing) ? p.missing.map(x => String(x).slice(0, 80)).slice(0, 10) : [],
    items: Array.isArray(p.items) ? p.items.map(it => ({
      kind: String(it.kind || '').slice(0, 40),
      label: String(it.label || '').slice(0, 220),
      premium: safeNumber(it.premium),
    })).slice(0, 20) : [],
    why: Array.isArray(p.why) ? p.why.map(x => String(x).slice(0, 280)).slice(0, 12) : [],
  }));
}

function makeCacheKey(profile, packages) {
  const brief = {
    profile,
    packages: packages.map(p => ({ index: p.index, name: p.name, premium: p.premium, items: p.items.map(i => i.label).slice(0, 8) }))
  };
  return normalizeText(JSON.stringify(brief)).slice(0, 1800);
}

function modelForPlan(profile, packages) {
  const budget = safeNumber(profile.budget);
  const highNeed = ['high', 'elite20', 'elite75'].includes(profile.ipdNeed);
  const tightBudget = budget > 0 && packages.some(p => p.premium > budget * 1.5);

  if (highNeed && tightBudget) {
    return {
      tier: 'plan-hard',
      model: process.env.ANTHROPIC_MODEL_PLAN || process.env.ANTHROPIC_MODEL_DEFAULT || process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
      maxOutputTokens: 780,
    };
  }
  return {
    tier: 'plan-medium',
    model: process.env.ANTHROPIC_MODEL_PLAN || process.env.ANTHROPIC_MODEL_MEDIUM || process.env.ANTHROPIC_MODEL_DEFAULT || process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
    maxOutputTokens: 620,
  };
}

// Claude's Messages API returns content as an array of blocks; we only want the
// text blocks, concatenated in order.
function extractTextFromClaude(result) {
  const content = Array.isArray(result?.content) ? result.content : [];
  return content
    .filter(c => c?.type === 'text' && typeof c.text === 'string')
    .map(c => c.text.trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function extractJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('Empty AI response');
  try { return JSON.parse(raw); } catch (_) {}
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) return JSON.parse(match[0]);
  throw new Error('AI response is not valid JSON');
}

async function callClaude(payload) {
  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_API_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const result = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const message = result?.error?.message || `Anthropic API error: HTTP ${upstream.status}`;
    const err = new Error(message);
    err.status = upstream.status;
    err.detail = result;
    throw err;
  }
  return result;
}

function buildInstructions(route) {
  return `คุณคือ AI ผู้ช่วยออกแบบแผนประกันสุขภาพของ Doctor Insurance โดยหมอกึ๊ก

ข้อบังคับสำคัญ:
- ให้เลือกและอธิบายจากแพ็กเกจที่ frontend ส่งมาเท่านั้น ห้ามสร้างชื่อแผน/เบี้ย/สัญญาเพิ่มเติมใหม่เอง
- เบี้ยและรายการ rider จาก frontend ถือเป็น source of truth ห้ามแก้ตัวเลขเอง
- ตอบกลับเป็น JSON object เท่านั้น ห้ามมี markdown หรือข้อความอื่นนอก JSON ห้ามใส่ code fence
- หลักการจัดแผน: IPD/สุขภาพหลักก่อน → Care plus → โรคร้ายแรง → OPD ถ้างบพอ → ทุนชีวิตท้ายสุด
- ถ้างบจำกัดแต่ต้องการความคุ้มครองสูง ให้ให้เหตุผลว่าควรพยายามคง D Health Lite 5 ล้านแบบ Deductible ก่อน ถ้ายังพอจ่ายไหว
- ถ้างบน้อยมาก ให้ยอม step down เป็น Extra Care Plus แผน 3 + Care Plus + 99/99 ทุน 50,000 และอาจคง PA แผน 1 หากช่วยให้เลือก 99/99 ได้
- อย่าเสนอแพ็กเกจที่เบี้ยเกินงบมากเกินจริง ถ้าเกินงบมากให้เตือนตรง ๆ
- ห้ามรับรองว่าอนุมัติ/เคลมได้แน่นอน ต้องบอกว่าเงื่อนไขจริงขึ้นกับใบเสนอ กรมธรรม์ สุขภาพ และดุลพินิจบริษัท
- ใช้ภาษาไทย กระชับ อ่านง่าย เหมือนตัวแทนมืออาชีพคุยกับลูกค้า

JSON schema ที่ต้องตอบ:
{
"recommendationIndex": number หรือ null,
"summary": "สรุปสั้น 1-2 ประโยค",
"reasons": ["เหตุผล 1", "เหตุผล 2", "เหตุผล 3"],
"budgetWarning": "คำเตือนเรื่องงบ ถ้าไม่มีให้เป็นค่าว่าง",
"clientMessage": "ข้อความที่ใช้พูดกับลูกค้าแบบสั้น กระชับ",
"followUpQuestions": ["คำถามต่อยอดที่ควรถามลูกค้า"],
"riskFlags": ["จุดที่ต้องระวัง เช่น ประวัติสุขภาพ/ข้อยกเว้น/งบตึง"]
}

ระดับงาน: ${route.tier}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  if (!process.env.ANTHROPIC_API_KEY) return json(res, 500, { error: 'ANTHROPIC_API_KEY is not configured on server' });

  try {
    const rate = checkRateLimit(req);
    if (!rate.ok) return json(res, 429, { error: rate.message });

    const profile = sanitizeProfile(req.body?.profile || {});
    const packages = sanitizePackages(req.body?.packages || []);
    if (!packages.length) return json(res, 400, { error: 'Missing packages' });

    const route = modelForPlan(profile, packages);
    const cacheKey = `${route.model}:${makeCacheKey(profile, packages)}`;
    const cached = answerCache.get(cacheKey);
    if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
      return json(res, 200, { ...cached.data, cached: true });
    }

    const payloadForAi = {
      profile,
      packages,
      businessRules: {
        budgetTolerance: 'เสนอเป็นตัวเลือกหลักเฉพาะแพ็กเกจที่ไม่หลุดงบเกินประมาณ 30-50% ถ้าเกินมากให้เตือน/ไม่เชียร์',
        healthFirst: 'IPD ก่อน โรคร้ายแรง ต่อด้วย OPD และทุนชีวิตท้ายสุด',
        lowBudgetHighProtection: 'พยายามเสนอ D Health Lite 5M แบบ deductible ก่อน ถ้าต่ำมากจริงค่อย step down Extra Care Plus 3 + Care Plus + 99/99 50,000 + อาจคง PA 1',
        lifeCapital: 'ทุนชีวิตสูงควรแยกเล่ม ไม่ดันทุนสูงในเล่มสุขภาพ'
      }
    };

    const payload = {
      model: route.model,
      max_tokens: route.maxOutputTokens,
      system: buildInstructions(route),
      messages: [{ role: 'user', content: JSON.stringify(payloadForAi) }],
    };

    const result = await callClaude(payload);
    const answerText = extractTextFromClaude(result);
    const parsed = extractJsonObject(answerText);

    const data = {
      recommendationIndex: Number.isInteger(parsed.recommendationIndex) ? parsed.recommendationIndex : null,
      summary: String(parsed.summary || '').slice(0, 600),
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons.map(x => String(x).slice(0, 240)).slice(0, 5) : [],
      budgetWarning: String(parsed.budgetWarning || '').slice(0, 400),
      clientMessage: String(parsed.clientMessage || '').slice(0, 900),
      followUpQuestions: Array.isArray(parsed.followUpQuestions) ? parsed.followUpQuestions.map(x => String(x).slice(0, 220)).slice(0, 4) : [],
      riskFlags: Array.isArray(parsed.riskFlags) ? parsed.riskFlags.map(x => String(x).slice(0, 220)).slice(0, 5) : [],
      model: route.model,
      routeTier: route.tier,
      usedWebSearch: false,
      usage: result?.usage || null,
    };

    answerCache.set(cacheKey, { data, createdAt: Date.now() });
    if (answerCache.size > 200) {
      const oldestKey = answerCache.keys().next().value;
      if (oldestKey) answerCache.delete(oldestKey);
    }

    return json(res, 200, { ...data, cached: false });
  } catch (err) {
    const status = Number(err?.status) || 500;
    return json(res, status, {
      error: err?.message || 'Server error',
      detail: err?.detail || null,
    });
  }
}

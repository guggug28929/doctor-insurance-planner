// Shared helpers for the agent-only reply-template app (/agent.html)
// Required env: GOOGLE_CLIENT_ID, AGENT_ALLOWED_EMAILS, AGENT_SESSION_SECRET
// Optional env: KV_REST_API_URL, KV_REST_API_TOKEN (reuses the same Upstash instance as the LINE webhook)

import crypto from 'node:crypto';

export const SESSION_COOKIE = 'dg_agent';
export const PREFS_COOKIE = 'dg_agent_prefs';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

export const SETTINGS_FIELDS = ['name', 'line', 'fb', 'tel', 'mail', 'site'];

export function emptySettings() {
  return SETTINGS_FIELDS.reduce((acc, k) => ({ ...acc, [k]: '' }), {});
}

export function sanitizeSettings(input) {
  const out = emptySettings();
  if (!input || typeof input !== 'object') return out;
  for (const k of SETTINGS_FIELDS) {
    const raw = typeof input[k] === 'string' ? input[k] : '';
    out[k] = raw.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 160);
  }
  return out;
}

/* ---------------- signing ---------------- */

function sessionSecret() {
  return process.env.AGENT_SESSION_SECRET || '';
}

function b64url(str) {
  return Buffer.from(str, 'utf8').toString('base64url');
}
function unb64url(str) {
  return Buffer.from(str, 'base64url').toString('utf8');
}

export function signPayload(payload) {
  const secret = sessionSecret();
  if (!secret) throw new Error('AGENT_SESSION_SECRET is missing');
  const body = b64url(JSON.stringify(payload));
  const mac = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifyPayload(token) {
  const secret = sessionSecret();
  if (!secret || typeof token !== 'string' || !token) return null;
  const idx = token.lastIndexOf('.');
  if (idx <= 0) return null;
  const body = token.slice(0, idx);
  const mac = token.slice(idx + 1);
  let expected;
  try {
    expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  } catch {
    return null;
  }
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(unb64url(body));
    if (!data || typeof data.exp !== 'number' || Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

/* ---------------- cookies ---------------- */

export function parseCookies(req) {
  const header = req.headers?.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

export function buildCookie(name, value, maxAgeSeconds) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Secure',
    `Max-Age=${maxAgeSeconds}`,
  ];
  return parts.join('; ');
}

export function appendCookie(res, cookieStr) {
  const prev = res.getHeader('Set-Cookie');
  if (!prev) res.setHeader('Set-Cookie', cookieStr);
  else if (Array.isArray(prev)) res.setHeader('Set-Cookie', [...prev, cookieStr]);
  else res.setHeader('Set-Cookie', [prev, cookieStr]);
}

export function readSession(req) {
  const cookies = parseCookies(req);
  const data = verifyPayload(cookies[SESSION_COOKIE]);
  if (!data || !data.email) return null;
  return data;
}

export function readPrefsCookie(req) {
  const cookies = parseCookies(req);
  const data = verifyPayload(cookies[PREFS_COOKIE]);
  if (!data || !data.settings) return null;
  return sanitizeSettings(data.settings);
}

/* ---------------- admins ----------------
   เปิดให้ตัวแทนคนไหนก็ล็อกอินเองได้ ไม่ต้องเติมอีเมลล่วงหน้า
   ผู้ดูแล (admin) คือคนที่เห็นรายชื่อผู้ใช้และกดปิดสิทธิ์ได้
   ใช้ AGENT_ADMIN_EMAILS ถ้ามี ไม่งั้นถอยไปใช้ AGENT_ALLOWED_EMAILS ของเดิม  */

function adminList() {
  const raw = process.env.AGENT_ADMIN_EMAILS || process.env.AGENT_ALLOWED_EMAILS || '';
  return String(raw)
    .split(/[,;\s]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

export function adminConfigured() {
  return adminList().length > 0;
}

export function isAdminEmail(email) {
  const list = adminList();
  if (!list.length) return false;
  return list.includes(String(email || '').trim().toLowerCase());
}

/* ---------------- storage (Upstash Redis, shared with LINE webhook) ---------------- */

function redisConfig() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ''), token };
}

export function storageAvailable() {
  return !!redisConfig();
}

async function redis(command) {
  const config = redisConfig();
  if (!config) throw new Error('KV_REST_API_URL or KV_REST_API_TOKEN is missing');
  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    throw new Error(data?.error || `Redis HTTP ${response.status}`);
  }
  return data?.result;
}

function settingsKey(email) {
  return `agent:settings:${String(email || '').trim().toLowerCase()}`;
}

export async function loadSettings(email) {
  if (!storageAvailable()) return null;
  try {
    const stored = await redis(['GET', settingsKey(email)]);
    if (!stored) return null;
    return sanitizeSettings(JSON.parse(stored));
  } catch (error) {
    console.error('agent loadSettings failed', error);
    return null;
  }
}

export async function persistSettings(email, settings) {
  const clean = sanitizeSettings(settings);
  if (!storageAvailable()) return { stored: false, settings: clean };
  await redis([
    'SET',
    settingsKey(email),
    JSON.stringify({ ...clean, updatedAt: new Date().toISOString() }),
  ]);
  return { stored: true, settings: clean };
}

/* ---------------- user registry (who has signed in) ---------------- */

const USERS_KEY = 'agent:users';

function normEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export async function getUser(email) {
  if (!storageAvailable()) return null;
  try {
    const raw = await redis(['HGET', USERS_KEY, normEmail(email)]);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error('agent getUser failed', error);
    return null;
  }
}

export async function listUsers() {
  if (!storageAvailable()) return [];
  try {
    const flat = await redis(['HGETALL', USERS_KEY]);
    const out = [];
    if (Array.isArray(flat)) {
      for (let i = 0; i < flat.length; i += 2) {
        try {
          out.push({ email: flat[i], ...JSON.parse(flat[i + 1]) });
        } catch {
          /* skip malformed row */
        }
      }
    } else if (flat && typeof flat === 'object') {
      for (const [email, value] of Object.entries(flat)) {
        try {
          out.push({ email, ...JSON.parse(value) });
        } catch {
          /* skip malformed row */
        }
      }
    }
    out.sort((a, b) => String(b.firstSeen || '').localeCompare(String(a.firstSeen || '')));
    return out;
  } catch (error) {
    console.error('agent listUsers failed', error);
    return [];
  }
}

async function writeUser(email, record) {
  await redis(['HSET', USERS_KEY, normEmail(email), JSON.stringify(record)]);
}

/**
 * Record a sign-in. Returns { record, isNew }.
 * New emails are allowed in by default; the admin can block them afterwards.
 */
export async function touchUser(email, name) {
  const key = normEmail(email);
  const now = new Date().toISOString();
  if (!storageAvailable()) {
    return { record: { email: key, name: name || '', blocked: false, firstSeen: now, lastSeen: now }, isNew: false };
  }
  const existing = await getUser(key);
  if (existing) {
    const record = {
      ...existing,
      name: name || existing.name || '',
      lastSeen: now,
      signIns: (Number(existing.signIns) || 0) + 1,
    };
    await writeUser(key, record);
    return { record, isNew: false };
  }
  const record = {
    name: name || '',
    blocked: false,
    firstSeen: now,
    lastSeen: now,
    signIns: 1,
  };
  await writeUser(key, record);
  return { record: { email: key, ...record }, isNew: true };
}

export async function setUserBlocked(email, blocked) {
  const key = normEmail(email);
  if (!storageAvailable()) throw new Error('ยังไม่ได้ตั้งค่าที่เก็บข้อมูล');
  const existing = (await getUser(key)) || { firstSeen: new Date().toISOString(), signIns: 0 };
  const record = { ...existing, blocked: !!blocked, blockedAt: blocked ? new Date().toISOString() : null };
  await writeUser(key, record);
  return { email: key, ...record };
}

/* ---------------- new-user notification (optional) ---------------- */

export function notifyConfigured() {
  return !!process.env.RESEND_API_KEY;
}

export async function notifyNewUser(user, adminEmails) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = (adminEmails || []).filter(Boolean);
  if (!apiKey || !to.length) return { sent: false, reason: 'not-configured' };

  const from = process.env.RESEND_FROM || 'onboarding@resend.dev';
  const body = [
    'มีคนเข้าใช้งานหน้าชุดข้อความตัวแทนเป็นครั้งแรก',
    '',
    `อีเมล: ${user.email}`,
    `ชื่อใน Google: ${user.name || '(ไม่ระบุ)'}`,
    `เวลา: ${new Date(user.firstSeen).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`,
    '',
    'ถ้าไม่รู้จักคนนี้ ให้เข้าไปปิดสิทธิ์ได้ที่',
    'https://www.doctor-insurance.com/agent.html → ปุ่มตั้งค่า → รายชื่อผู้ใช้งาน',
  ].join('\n');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to,
        subject: `ผู้ใช้ใหม่ในหน้าชุดข้อความตัวแทน: ${user.email}`,
        text: body,
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('notifyNewUser failed', response.status, detail);
      return { sent: false, reason: `http-${response.status}` };
    }
    return { sent: true };
  } catch (error) {
    console.error('notifyNewUser error', error);
    return { sent: false, reason: 'error' };
  }
}

export function adminEmails() {
  return adminList();
}

/* ---------------- saved calculator plans (per agent) ----------------
   หน้าคำนวณเบี้ยให้ตัวแทนที่ล็อกอินบันทึกชุดที่กดไว้ได้ แล้วเปิดจากเครื่อง/เบราว์เซอร์อื่นได้
   เก็บเป็น hash ต่ออีเมล: field = id ของแผน, value = JSON
   เก็บเฉพาะค่าที่กรอกในหน้าคำนวณ + ชื่อที่ตัวแทนตั้ง ไม่รับเลขบัตร/เบอร์โทร/ประวัติสุขภาพ */

export const PLAN_LIMIT = 200;
export const PLAN_NAME_MAX = 80;
export const PLAN_STATE_MAX_BYTES = 20000;

function plansKey(email) {
  return `agent:plans:${normEmail(email)}`;
}

export function sanitizePlanName(name) {
  return String(name ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, PLAN_NAME_MAX);
}

export function validPlanId(id) {
  return typeof id === 'string' && /^[a-z0-9]{8,32}$/.test(id);
}

export function newPlanId() {
  return crypto.randomBytes(9).toString('hex');
}

/* state ต้องเป็นออบเจกต์ที่มีแค่ radios / checks / values / dcare ตามรูปแบบที่หน้าเว็บส่งมา
   คีย์ต้องเป็นชื่อ id ของช่องในฟอร์ม และค่าเป็นข้อความสั้น ๆ เท่านั้น กันการยัดข้อมูลอื่นเข้ามา */
export function sanitizePlanState(state) {
  if (!state || typeof state !== 'object') return null;
  const keyOk = (k) => typeof k === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(k);
  const strVal = (v) => (typeof v === 'string' || typeof v === 'number') ? String(v).slice(0, 64) : null;
  const out = { radios: {}, checks: {}, values: {}, dcare: [] };
  for (const [k, v] of Object.entries(state.radios || {})) { const s = strVal(v); if (keyOk(k) && s !== null) out.radios[k] = s; }
  for (const [k, v] of Object.entries(state.checks || {})) { if (keyOk(k)) out.checks[k] = !!v; }
  for (const [k, v] of Object.entries(state.values || {})) { const s = strVal(v); if (keyOk(k) && s !== null) out.values[k] = s; }
  if (Array.isArray(state.dcare)) {
    out.dcare = state.dcare.slice(0, 20).map((d) => ({
      cat: strVal(d?.cat) || '',
      stage: strVal(d?.stage) || '',
      capital: Number(d?.capital) || 0,
    }));
  }
  if (Buffer.byteLength(JSON.stringify(out)) > PLAN_STATE_MAX_BYTES) return null;
  return out;
}

export function sanitizePlanSummary(summary) {
  const s = summary && typeof summary === 'object' ? summary : {};
  const txt = (v, n = 80) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, n);
  return {
    gender: txt(s.gender, 8),
    entryAge: Number.isFinite(Number(s.entryAge)) ? Number(s.entryAge) : null,
    mainLabel: txt(s.mainLabel, 120),
    frequency: txt(s.frequency, 30),
    totalY1: Number.isFinite(Number(s.totalY1)) ? Number(s.totalY1) : null,
    riders: Array.isArray(s.riders) ? s.riders.slice(0, 30).map((r) => txt(r, 80)) : [],
  };
}

export async function listPlans(email) {
  if (!storageAvailable()) return [];
  const flat = await redis(['HGETALL', plansKey(email)]);
  const out = [];
  const push = (raw) => { try { out.push(JSON.parse(raw)); } catch { /* skip malformed */ } };
  if (Array.isArray(flat)) for (let i = 0; i < flat.length; i += 2) push(flat[i + 1]);
  else if (flat && typeof flat === 'object') Object.values(flat).forEach(push);
  out.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  return out;
}

export async function getPlan(email, id) {
  if (!storageAvailable() || !validPlanId(id)) return null;
  const raw = await redis(['HGET', plansKey(email), id]);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function countPlans(email) {
  if (!storageAvailable()) return 0;
  return Number(await redis(['HLEN', plansKey(email)])) || 0;
}

export async function savePlan(email, plan) {
  await redis(['HSET', plansKey(email), plan.id, JSON.stringify(plan)]);
  return plan;
}

export async function deletePlan(email, id) {
  if (!validPlanId(id)) return 0;
  return Number(await redis(['HDEL', plansKey(email), id])) || 0;
}

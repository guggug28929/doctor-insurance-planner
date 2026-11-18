// สถิติผู้เข้าชมเว็บ แบบนับยอดรวมเท่านั้น
// ไม่เก็บ IP อีเมล ชื่อ หรือข้อมูลที่ระบุตัวคนได้
// "คนไม่ซ้ำ" ใช้ HyperLogLog ของ Redis (PFADD) ซึ่งเก็บแค่ค่าประมาณจำนวน ดึงรหัสคืนไม่ได้
// เวลาทั้งหมดคิดเป็นเวลาไทย (UTC+7)

import crypto from 'node:crypto';

const P = 'st:';
const DAY_TTL = 60 * 60 * 24 * 400; // เก็บรายวันไว้ ~13 เดือน

export const SOURCES = ['line', 'facebook', 'instagram', 'tiktok', 'google', 'youtube', 'other-search', 'other-site', 'direct'];
export const KINDS = ['guest', 'agent', 'admin'];

function redisConfig() {
  const url = process.env.UPSTASH_KV_REST_API_URL || process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_KV_REST_API_TOKEN || process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ''), token };
}

export function statsStorageAvailable() {
  return !!redisConfig();
}

export async function pipeline(commands) {
  const c = redisConfig();
  if (!c) throw new Error('storage not configured');
  const r = await fetch(c.url + '/pipeline', {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok || !Array.isArray(data)) throw new Error(`Redis HTTP ${r.status}`);
  return data.map((x) => (x && x.error ? null : x?.result));
}

/* ---------- helpers ---------- */

export function thaiParts(date = new Date()) {
  const t = new Date(date.getTime() + 7 * 3600 * 1000);
  const y = t.getUTCFullYear();
  const m = String(t.getUTCMonth() + 1).padStart(2, '0');
  const d = String(t.getUTCDate()).padStart(2, '0');
  return { day: `${y}${m}${d}`, hour: t.getUTCHours() };
}

export function dayKeys(n, now = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(thaiParts(new Date(now.getTime() - i * 86400000)).day);
  return out;
}

export function isBot(ua) {
  return !ua || /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|pingdom|uptime|curl|wget|python|node-fetch|vercel/i.test(ua);
}

/* path ที่รับเท่านั้น: ตัวพิมพ์เล็ก ตัวเลข ขีด และ / ไม่เกิน 3 ชั้น กันคนยิงขยะมาเต็มตาราง */
export function cleanPath(p) {
  let s = String(p || '/').split(/[?#]/)[0].toLowerCase();
  try { s = decodeURIComponent(s); } catch (e) { /* ใช้ค่าเดิม */ }
  s = s.replace(/\/+$/, '') || '/';
  if (!/^\/[a-z0-9\-/]{0,80}$/.test(s)) return null;
  if (s.split('/').length > 4) return null;
  return s;
}

export function deviceOf(ua) {
  return /mobile|iphone|android|ipod/i.test(ua || '') && !/ipad|tablet/i.test(ua || '') ? 'mobile'
    : /ipad|tablet/i.test(ua || '') ? 'tablet' : 'desktop';
}

/* ช่องทางที่มา ดูจาก utm_source ก่อน แล้วจึงดูเบราว์เซอร์ในแอป และ referrer */
export function sourceOf({ utm, referrer, ua, host }) {
  const u = String(utm || '').toLowerCase();
  if (u) {
    if (/line/.test(u)) return 'line';
    if (/^(fb|facebook|meta)/.test(u)) return 'facebook';
    if (/^(ig|instagram)/.test(u)) return 'instagram';
    if (/tiktok/.test(u)) return 'tiktok';
    if (/google/.test(u)) return 'google';
    if (/youtube|yt/.test(u)) return 'youtube';
  }
  const a = String(ua || '');
  if (/\bLine\//i.test(a)) return 'line';
  if (/Instagram/i.test(a)) return 'instagram';
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(a)) return 'facebook';
  if (/musical_ly|BytedanceWebview|TikTok/i.test(a)) return 'tiktok';
  let rh = '';
  try { rh = new URL(referrer).hostname.toLowerCase(); } catch (e) { rh = ''; }
  if (!rh || (host && rh.endsWith(String(host).toLowerCase().replace(/^www\./, '')))) return 'direct';
  if (/(^|\.)line\.(me|naver)|linecorp/.test(rh)) return 'line';
  if (/facebook\.com|fb\.com|fb\.me|messenger\.com/.test(rh)) return 'facebook';
  if (/instagram\.com/.test(rh)) return 'instagram';
  if (/tiktok\.com/.test(rh)) return 'tiktok';
  if (/youtube\.com|youtu\.be/.test(rh)) return 'youtube';
  if (/google\./.test(rh)) return 'google';
  if (/bing\.|yahoo\.|duckduckgo\.|baidu\.|yandex\./.test(rh)) return 'other-search';
  return 'other-site';
}

/* รหัสผู้เข้าชมที่ไม่ระบุตัว: ถ้าเบราว์เซอร์ส่งรหัสสุ่มมา ใช้อันนั้น ไม่งั้นแฮช IP+UA กับเกลือรายวัน
   ส่งเข้า PFADD เท่านั้น ไม่เคยถูกเก็บเป็นข้อความ */
export function visitorToken({ vid, ip, ua, day }) {
  const v = String(vid || '');
  if (/^[a-z0-9]{12,40}$/i.test(v)) return 'v:' + v;
  const salt = (process.env.AGENT_SESSION_SECRET || process.env.SESSION_SECRET || 'dg') + day;
  return 'h:' + crypto.createHash('sha256').update(`${salt}|${ip || ''}|${ua || ''}`).digest('hex').slice(0, 24);
}

/* ---------- write ---------- */

export function buildHitCommands({ path, kind, source, device, token, entry, now = new Date() }) {
  const { day, hour } = thaiParts(now);
  const cmds = [
    ['SETNX', P + 'start', day],
    ['HINCRBY', P + 'kind', kind, 1],
    ['HINCRBY', P + 'kind:' + day, kind, 1],
    ['EXPIRE', P + 'kind:' + day, DAY_TTL],
  ];
  // เวลาแอดมินเข้าดูเว็บตัวเอง นับแยกไว้เฉย ๆ ไม่ปนยอดผู้เข้าชม
  if (kind === 'admin') return cmds;
  cmds.push(
    ['INCR', P + 'pv'],
    ['INCR', P + 'pv:' + day], ['EXPIRE', P + 'pv:' + day, DAY_TTL],
    ['PFADD', P + 'uv', token],
    ['PFADD', P + 'uv:' + day, token], ['EXPIRE', P + 'uv:' + day, DAY_TTL],
    ['HINCRBY', P + 'hour:' + day, String(hour), 1], ['EXPIRE', P + 'hour:' + day, DAY_TTL],
    ['HINCRBY', P + 'page', path, 1],
    ['HINCRBY', P + 'page:' + day, path, 1], ['EXPIRE', P + 'page:' + day, DAY_TTL],
    ['HINCRBY', P + 'dev', device, 1],
  );
  if (kind === 'agent') cmds.push(['PFADD', P + 'uv:agent', token]);
  if (entry) {
    cmds.push(
      ['INCR', P + 'visits'],
      ['INCR', P + 'visits:' + day], ['EXPIRE', P + 'visits:' + day, DAY_TTL],
      ['HINCRBY', P + 'src', source, 1],
      ['HINCRBY', P + 'src:' + day, source, 1], ['EXPIRE', P + 'src:' + day, DAY_TTL],
    );
  }
  return cmds;
}

/* ---------- read ---------- */

function hashToObj(arr) {
  const o = {};
  if (Array.isArray(arr)) for (let i = 0; i + 1 < arr.length; i += 2) o[arr[i]] = Number(arr[i + 1]) || 0;
  return o;
}
function addInto(target, src) {
  for (const [k, v] of Object.entries(src)) target[k] = (target[k] || 0) + v;
  return target;
}
function top(obj, n) {
  return Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([key, count]) => ({ key, count }));
}

export async function readStats({ days = 30, now = new Date() } = {}) {
  const n = Math.min(Math.max(Number(days) || 30, 1), 90);
  const keys = dayKeys(n, now);
  const today = keys[keys.length - 1];
  const head = [
    ['GET', P + 'start'], ['GET', P + 'pv'], ['PFCOUNT', P + 'uv'], ['GET', P + 'visits'],
    ['HGETALL', P + 'page'], ['HGETALL', P + 'src'], ['HGETALL', P + 'kind'], ['HGETALL', P + 'dev'],
    ['PFCOUNT', P + 'uv:agent'],
  ];
  const per = keys.flatMap((d) => [
    ['GET', P + 'pv:' + d], ['PFCOUNT', P + 'uv:' + d], ['GET', P + 'visits:' + d],
    ['HGETALL', P + 'hour:' + d], ['HGETALL', P + 'page:' + d], ['HGETALL', P + 'src:' + d], ['HGETALL', P + 'kind:' + d],
  ]);
  const res = await pipeline([...head, ...per]);
  const [start, pv, uv, visits, page, src, kind, dev, uvAgent] = res;
  const daily = [];
  const hoursRange = {}; const pagesRange = {}; const srcRange = {}; const kindRange = {};
  let hoursToday = {};
  keys.forEach((d, i) => {
    const b = head.length + i * 7;
    const hours = hashToObj(res[b + 3]);
    daily.push({ day: d, pv: Number(res[b]) || 0, uv: Number(res[b + 1]) || 0, visits: Number(res[b + 2]) || 0 });
    addInto(hoursRange, hours);
    addInto(pagesRange, hashToObj(res[b + 4]));
    addInto(srcRange, hashToObj(res[b + 5]));
    addInto(kindRange, hashToObj(res[b + 6]));
    if (d === today) hoursToday = hours;
  });
  const hourArr = (o) => Array.from({ length: 24 }, (_, h) => o[String(h)] || 0);
  return {
    since: start || null,
    days: n,
    total: { pageviews: Number(pv) || 0, visitors: Number(uv) || 0, visits: Number(visits) || 0, agents: Number(uvAgent) || 0 },
    today: daily[daily.length - 1],
    daily,
    hoursToday: hourArr(hoursToday),
    hoursRange: hourArr(hoursRange),
    pagesAll: top(hashToObj(page), 15),
    pagesRange: top(pagesRange, 15),
    sourcesAll: hashToObj(src),
    sourcesRange: srcRange,
    kindsAll: hashToObj(kind),
    kindsRange: kindRange,
    devices: hashToObj(dev),
  };
}

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

/* ---------------- allowlist ---------------- */

export function allowlistConfigured() {
  return String(process.env.AGENT_ALLOWED_EMAILS || '').trim().length > 0;
}

export function isAllowedEmail(email) {
  const list = String(process.env.AGENT_ALLOWED_EMAILS || '')
    .split(/[,;\s]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
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

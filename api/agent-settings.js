// Vercel Serverless Function: /api/agent-settings
// Per-agent settings (display name, LINE ID, Facebook, phone, CC email, site link)
//   GET -> read settings for the signed-in agent
//   PUT -> save settings for the signed-in agent
// Storage: Upstash Redis when KV_REST_API_* is set; otherwise a signed HttpOnly cookie fallback.

import {
  PREFS_COOKIE,
  SESSION_MAX_AGE,
  emptySettings,
  sanitizeSettings,
  signPayload,
  buildCookie,
  appendCookie,
  readSession,
  readPrefsCookie,
  storageAvailable,
  loadSettings,
  persistSettings,
} from '../lib/agent-store.js';

function json(res, status, data) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(data);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();

  const session = readSession(req);
  if (!session) {
    return json(res, 401, { error: 'ยังไม่ได้เข้าสู่ระบบ' });
  }

  if (req.method === 'GET') {
    const stored = await loadSettings(session.email);
    const settings = stored || readPrefsCookie(req) || emptySettings();
    return json(res, 200, { settings, serverStorage: storageAvailable() });
  }

  if (req.method !== 'PUT' && req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const incoming = sanitizeSettings(req.body?.settings);

  try {
    const { stored } = await persistSettings(session.email, incoming);
    if (!stored) {
      // No Redis configured — keep the values in a signed cookie so they still survive app restarts.
      appendCookie(
        res,
        buildCookie(
          PREFS_COOKIE,
          signPayload({ settings: incoming, exp: Date.now() + SESSION_MAX_AGE * 1000 }),
          SESSION_MAX_AGE
        )
      );
    }
    return json(res, 200, { ok: true, settings: incoming, serverStorage: stored });
  } catch (error) {
    console.error('agent-settings save failed', error);
    return json(res, 500, { error: 'บันทึกไม่สำเร็จ กรุณาลองใหม่' });
  }
}

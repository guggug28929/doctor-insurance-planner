// Vercel Serverless Function: /api/agent-auth
// Google Sign-In for the agent-only reply-template app (/agent.html)
//   GET    -> public config + current session (if any) + saved settings
//   POST   -> verify Google ID token, register/refresh the user, issue session cookie
//   DELETE -> sign out
// Access model: anyone with a Google account may sign in. The first sign-in is recorded
// and (optionally) emailed to the admin, who can block the account afterwards.
// Required env: GOOGLE_CLIENT_ID, AGENT_SESSION_SECRET
// Optional env: AGENT_ADMIN_EMAILS (falls back to AGENT_ALLOWED_EMAILS), RESEND_API_KEY, RESEND_FROM

import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  emptySettings,
  signPayload,
  buildCookie,
  appendCookie,
  readSession,
  readPrefsCookie,
  adminConfigured,
  isAdminEmail,
  adminEmails,
  storageAvailable,
  loadSettings,
  getUser,
  touchUser,
  notifyConfigured,
  notifyNewUser,
} from '../lib/agent-store.js';

const TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const VALID_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

function json(res, status, data) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(data);
}

function configState() {
  return {
    clientId: !!process.env.GOOGLE_CLIENT_ID,
    sessionSecret: !!process.env.AGENT_SESSION_SECRET,
    admin: adminConfigured(),
    serverStorage: storageAvailable(),
    emailNotify: notifyConfigured(),
  };
}

async function settingsFor(req, email) {
  const stored = await loadSettings(email);
  if (stored) return stored;
  const fromCookie = readPrefsCookie(req);
  if (fromCookie) return fromCookie;
  return emptySettings();
}

async function verifyGoogleCredential(credential) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return { ok: false, status: 500, message: 'ยังไม่ได้ตั้งค่า GOOGLE_CLIENT_ID บนเซิร์ฟเวอร์' };

  let info;
  try {
    const response = await fetch(`${TOKENINFO_URL}?id_token=${encodeURIComponent(credential)}`);
    info = await response.json().catch(() => null);
    if (!response.ok || !info || info.error) {
      return { ok: false, status: 401, message: 'ยืนยันบัญชี Google ไม่สำเร็จ กรุณาลองใหม่' };
    }
  } catch {
    return { ok: false, status: 502, message: 'ติดต่อ Google เพื่อยืนยันบัญชีไม่สำเร็จ' };
  }

  if (info.aud !== clientId) {
    return { ok: false, status: 401, message: 'Client ID ไม่ตรงกับที่ตั้งค่าไว้' };
  }
  if (info.iss && !VALID_ISSUERS.includes(info.iss)) {
    return { ok: false, status: 401, message: 'ผู้ออกโทเคนไม่ถูกต้อง' };
  }
  const verified = info.email_verified === true || info.email_verified === 'true';
  if (!info.email || !verified) {
    return { ok: false, status: 401, message: 'บัญชี Google นี้ยังไม่ได้ยืนยันอีเมล' };
  }
  const exp = Number(info.exp) * 1000;
  if (Number.isFinite(exp) && Date.now() > exp) {
    return { ok: false, status: 401, message: 'โทเคนหมดอายุ กรุณาเข้าสู่ระบบใหม่' };
  }

  return {
    ok: true,
    email: String(info.email).trim().toLowerCase(),
    name: typeof info.name === 'string' ? info.name.slice(0, 80) : '',
    picture: typeof info.picture === 'string' ? info.picture.slice(0, 400) : '',
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();

  /* ---------- current session ---------- */
  if (req.method === 'GET') {
    const config = configState();
    const session = readSession(req);
    if (!session) {
      return json(res, 200, {
        signedIn: false,
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        config,
      });
    }
    // Blocking takes effect on the next page load, not only at sign-in.
    const record = await getUser(session.email);
    if (record && record.blocked) {
      appendCookie(res, buildCookie(SESSION_COOKIE, '', 0));
      return json(res, 200, {
        signedIn: false,
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        blocked: true,
        config,
      });
    }
    const settings = await settingsFor(req, session.email);
    return json(res, 200, {
      signedIn: true,
      email: session.email,
      name: session.name || '',
      picture: session.picture || '',
      isAdmin: isAdminEmail(session.email),
      settings,
      config,
    });
  }

  /* ---------- sign out ---------- */
  if (req.method === 'DELETE') {
    appendCookie(res, buildCookie(SESSION_COOKIE, '', 0));
    return json(res, 200, { signedIn: false });
  }

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  /* ---------- sign in ---------- */
  const config = configState();
  if (!config.clientId || !config.sessionSecret) {
    return json(res, 500, {
      error: 'ยังตั้งค่าเซิร์ฟเวอร์ไม่ครบ',
      detail: 'ต้องตั้ง GOOGLE_CLIENT_ID และ AGENT_SESSION_SECRET ใน Vercel ก่อน',
      config,
    });
  }

  const credential = req.body?.credential;
  if (typeof credential !== 'string' || credential.length < 20 || credential.length > 4000) {
    return json(res, 400, { error: 'ไม่พบข้อมูลยืนยันตัวตนจาก Google' });
  }

  const result = await verifyGoogleCredential(credential);
  if (!result.ok) {
    return json(res, result.status, { error: result.message });
  }

  const { record, isNew } = await touchUser(result.email, result.name);

  if (record.blocked) {
    return json(res, 403, {
      error: 'บัญชีนี้ถูกปิดสิทธิ์การใช้งาน',
      detail: 'หากคิดว่าเป็นความผิดพลาด กรุณาติดต่อผู้ดูแล',
    });
  }

  if (isNew) {
    // Fire-and-forget: a failed notification must not block the sign-in.
    notifyNewUser({ email: result.email, name: result.name, firstSeen: record.firstSeen }, adminEmails())
      .catch((error) => console.error('notifyNewUser rejected', error));
  }

  const session = {
    email: result.email,
    name: result.name,
    picture: result.picture,
    exp: Date.now() + SESSION_MAX_AGE * 1000,
  };

  appendCookie(res, buildCookie(SESSION_COOKIE, signPayload(session), SESSION_MAX_AGE));

  const settings = await settingsFor(req, result.email);
  return json(res, 200, {
    signedIn: true,
    email: result.email,
    name: result.name,
    picture: result.picture,
    isAdmin: isAdminEmail(result.email),
    isNew,
    settings,
    config,
  });
}

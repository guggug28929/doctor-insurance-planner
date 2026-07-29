// Vercel Serverless Function: /api/agent-users
// Admin-only user management for the agent reply-template app.
//   GET          -> list everyone who has signed in
//   POST {email, blocked} -> block or unblock an account
// Admins come from AGENT_ADMIN_EMAILS (falls back to AGENT_ALLOWED_EMAILS).

import { readSession, isAdminEmail, storageAvailable, listUsers, setUserBlocked } from '../lib/agent-store.js';

function json(res, status, data) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(data);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();

  const session = readSession(req);
  if (!session) return json(res, 401, { error: 'ยังไม่ได้เข้าสู่ระบบ' });
  if (!isAdminEmail(session.email)) return json(res, 403, { error: 'เฉพาะผู้ดูแลเท่านั้น' });
  if (!storageAvailable()) return json(res, 503, { error: 'ยังไม่ได้ตั้งค่าที่เก็บข้อมูลบนเซิร์ฟเวอร์' });

  if (req.method === 'GET') {
    const users = await listUsers();
    return json(res, 200, { users, me: session.email });
  }

  if (req.method !== 'POST' && req.method !== 'PUT') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const email = String(req.body?.email || '').trim().toLowerCase();
  const blocked = !!req.body?.blocked;

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json(res, 400, { error: 'อีเมลไม่ถูกต้อง' });
  }
  if (email === String(session.email).toLowerCase() && blocked) {
    return json(res, 400, { error: 'ปิดสิทธิ์บัญชีตัวเองไม่ได้' });
  }
  if (isAdminEmail(email) && blocked) {
    return json(res, 400, { error: 'ปิดสิทธิ์บัญชีผู้ดูแลไม่ได้' });
  }

  try {
    const record = await setUserBlocked(email, blocked);
    return json(res, 200, { ok: true, user: record });
  } catch (error) {
    console.error('agent-users update failed', error);
    return json(res, 500, { error: 'บันทึกไม่สำเร็จ กรุณาลองใหม่' });
  }
}

// Vercel Serverless Function: /api/stats
//   POST {path, entry, ref, utm, vid}  -> นับการเข้าชม 1 ครั้ง (ทุกคนเรียกได้ ไม่คืนข้อมูลใด ๆ)
//   GET  ?days=30                      -> สรุปสถิติ (เฉพาะแอดมิน AGENT_ADMIN_EMAILS)
// นับยอดรวมเท่านั้น ไม่เก็บ IP อีเมล หรือข้อมูลระบุตัวบุคคล

import { readSession, isAdminEmail, getUser } from '../lib/agent-store.js';
import {
  statsStorageAvailable, pipeline, buildHitCommands, readStats,
  isBot, cleanPath, deviceOf, sourceOf, visitorToken, thaiParts,
} from '../lib/site-stats.js';

function json(res, status, data) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(data);
}

function bodyOf(req) {
  const b = req.body;
  if (b && typeof b === 'object') return b;
  try { return JSON.parse(String(b || '{}')); } catch (e) { return {}; }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'POST') {
    // ตอบเร็วเสมอ การนับพลาดต้องไม่ทำให้หน้าเว็บมีปัญหา
    if (!statsStorageAvailable()) return res.status(204).end();
    const ua = String(req.headers['user-agent'] || '');
    if (isBot(ua)) return res.status(204).end();
    const b = bodyOf(req);
    const path = cleanPath(b.path);
    if (!path) return res.status(204).end();
    const session = readSession(req);
    let kind = 'guest';
    if (session && session.email) kind = isAdminEmail(session.email) ? 'admin' : 'agent';
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const host = String(req.headers.host || '');
    const cmds = buildHitCommands({
      path,
      kind,
      source: sourceOf({ utm: b.utm, referrer: b.ref, ua, host }),
      device: deviceOf(ua),
      token: visitorToken({ vid: b.vid, ip, ua, day: thaiParts().day }),
      entry: !!b.entry,
    });
    try { await pipeline(cmds); } catch (e) { console.error('stats hit failed', e.message); }
    return res.status(204).end();
  }

  if (req.method === 'GET') {
    const session = readSession(req);
    if (!session) return json(res, 401, { error: 'ยังไม่ได้เข้าสู่ระบบ' });
    if (!isAdminEmail(session.email)) return json(res, 403, { error: 'เฉพาะผู้ดูแลเท่านั้น' });
    const user = await getUser(session.email).catch(() => null);
    if (user && user.blocked) return json(res, 403, { error: 'บัญชีนี้ถูกปิดสิทธิ์การใช้งาน' });
    if (!statsStorageAvailable()) return json(res, 503, { error: 'ยังไม่ได้ตั้งค่าที่เก็บข้อมูลบนเซิร์ฟเวอร์' });
    try {
      const data = await readStats({ days: req.query && req.query.days });
      return json(res, 200, data);
    } catch (e) {
      console.error('stats read failed', e);
      return json(res, 500, { error: 'อ่านสถิติไม่สำเร็จ กรุณาลองใหม่' });
    }
  }

  return json(res, 405, { error: 'Method not allowed' });
}

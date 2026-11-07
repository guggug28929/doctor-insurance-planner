// Vercel Serverless Function: /api/agent-plans
// แผนที่ตัวแทนบันทึกไว้จากหน้าคำนวณเบี้ย (เปิดจากเครื่อง/เบราว์เซอร์ไหนก็ได้ที่ล็อกอินอีเมลเดียวกัน)
//   GET              -> รายการแผนของตัวแทนที่ล็อกอิน
//   POST {name, state, summary, id?} -> บันทึกใหม่ หรือบันทึกทับเมื่อส่ง id ของแผนเดิม
//   PATCH {id, name} -> เปลี่ยนชื่อ
//   DELETE ?id=...   -> ลบ
// ต้องล็อกอินผ่าน /api/agent-auth ก่อน และต้องมี Upstash (KV_REST_API_*)

import {
  readSession,
  getUser,
  storageAvailable,
  PLAN_LIMIT,
  sanitizePlanName,
  sanitizePlanState,
  sanitizePlanSummary,
  validPlanId,
  newPlanId,
  listPlans,
  getPlan,
  countPlans,
  savePlan,
  deletePlan,
} from '../lib/agent-store.js';

function json(res, status, data) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(data);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();

  const session = readSession(req);
  if (!session) return json(res, 401, { error: 'ยังไม่ได้เข้าสู่ระบบ' });
  if (!storageAvailable()) return json(res, 503, { error: 'ยังไม่ได้ตั้งค่าที่เก็บข้อมูลบนเซิร์ฟเวอร์' });

  const user = await getUser(session.email);
  if (user && user.blocked) return json(res, 403, { error: 'บัญชีนี้ถูกปิดสิทธิ์การใช้งาน' });

  const email = session.email;
  try {
    if (req.method === 'GET') {
      const plans = await listPlans(email);
      return json(res, 200, { plans, limit: PLAN_LIMIT });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const name = sanitizePlanName(body.name);
      if (!name) return json(res, 400, { error: 'กรุณาตั้งชื่อแผน' });
      const state = sanitizePlanState(body.state);
      if (!state) return json(res, 400, { error: 'ข้อมูลแผนไม่ถูกต้องหรือใหญ่เกินไป' });
      const summary = sanitizePlanSummary(body.summary);
      const now = new Date().toISOString();

      if (body.id !== undefined && body.id !== null && body.id !== '') {
        if (!validPlanId(body.id)) return json(res, 400, { error: 'รหัสแผนไม่ถูกต้อง' });
        const existing = await getPlan(email, body.id);
        if (!existing) return json(res, 404, { error: 'ไม่พบแผนเดิม อาจถูกลบไปแล้ว' });
        const plan = { ...existing, name, state, summary, updatedAt: now };
        await savePlan(email, plan);
        return json(res, 200, { ok: true, plan });
      }

      if ((await countPlans(email)) >= PLAN_LIMIT) {
        return json(res, 409, { error: `บันทึกได้สูงสุด ${PLAN_LIMIT} แผน กรุณาลบแผนเก่าก่อน` });
      }
      const plan = { id: newPlanId(), name, state, summary, createdAt: now, updatedAt: now };
      await savePlan(email, plan);
      return json(res, 200, { ok: true, plan });
    }

    if (req.method === 'PATCH') {
      const body = req.body || {};
      if (!validPlanId(body.id)) return json(res, 400, { error: 'รหัสแผนไม่ถูกต้อง' });
      const name = sanitizePlanName(body.name);
      if (!name) return json(res, 400, { error: 'กรุณาตั้งชื่อแผน' });
      const existing = await getPlan(email, body.id);
      if (!existing) return json(res, 404, { error: 'ไม่พบแผนนี้' });
      const plan = { ...existing, name, updatedAt: new Date().toISOString() };
      await savePlan(email, plan);
      return json(res, 200, { ok: true, plan });
    }

    if (req.method === 'DELETE') {
      const id = (req.query && req.query.id) || (req.body && req.body.id);
      if (!validPlanId(id)) return json(res, 400, { error: 'รหัสแผนไม่ถูกต้อง' });
      const removed = await deletePlan(email, id);
      return json(res, removed ? 200 : 404, removed ? { ok: true } : { error: 'ไม่พบแผนนี้' });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    console.error('agent-plans failed', error);
    return json(res, 500, { error: 'ติดต่อที่เก็บข้อมูลไม่สำเร็จ กรุณาลองใหม่' });
  }
}

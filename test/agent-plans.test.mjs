import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* บันทึกแผนในหน้าคำนวณ: API เก็บแยกตามอีเมลที่ล็อกอิน ต้องล็อกอินก่อน และกรองข้อมูลที่รับเข้า */

process.env.AGENT_SESSION_SECRET = 'test-secret-for-plans';
process.env.KV_REST_API_URL = 'https://kv.example.test';
process.env.KV_REST_API_TOKEN = 'token';

const store = new Map();   // key -> Map(field -> value)
globalThis.fetch = async (url, opts) => {
  const [cmd, key, field, value] = JSON.parse(opts.body);
  const h = store.get(key) || new Map();
  let result = null;
  if(cmd === 'HGETALL') result = [...h.entries()].flat();
  else if(cmd === 'HGET') result = h.get(field) ?? null;
  else if(cmd === 'HLEN') result = h.size;
  else if(cmd === 'HSET'){ h.set(field, value); store.set(key, h); result = 1; }
  else if(cmd === 'HDEL'){ result = h.delete(field) ? 1 : 0; }
  return { ok: true, status: 200, json: async () => ({ result }) };
};

const { signPayload, SESSION_COOKIE, PLAN_LIMIT } = await import('../lib/agent-store.js');
const handler = (await import('../api/agent-plans.js')).default;

function cookieFor(email){
  return `${SESSION_COOKIE}=${encodeURIComponent(signPayload({ email, exp: Date.now() + 60000 }))}`;
}
async function call(method, { email, body, query } = {}){
  const req = { method, headers: email ? { cookie: cookieFor(email) } : {}, body, query: query || {} };
  const res = { statusCode: 200, headers: {}, body: null,
    setHeader(k, v){ this.headers[k] = v; }, getHeader(k){ return this.headers[k]; },
    status(c){ this.statusCode = c; return this; }, json(d){ this.body = d; return this; }, end(){ return this; } };
  await handler(req, res);
  return res;
}
const state = { radios: { gender: 'm', mainPlan: '99_20' }, checks: { use_dhl: true }, values: { birthYear: '2530', mainCapital: '200000' }, dcare: [] };

test('ต้องล็อกอินก่อน', async () => {
  const r = await call('GET');
  assert.equal(r.statusCode, 401);
});

test('บันทึก เปิดรายการ บันทึกทับ เปลี่ยนชื่อ และลบ', async () => {
  const a = 'agent.a@example.com';
  let r = await call('POST', { email: a, body: { name: '  คุณเอ   35 ปี ', state, summary: { gender: 'm', entryAge: 35, totalY1: 41180 } } });
  assert.equal(r.statusCode, 200);
  const id = r.body.plan.id;
  assert.equal(r.body.plan.name, 'คุณเอ 35 ปี');
  r = await call('GET', { email: a });
  assert.equal(r.body.plans.length, 1);
  assert.deepEqual(r.body.plans[0].state.values, state.values);

  r = await call('POST', { email: a, body: { id, name: 'คุณเอ 35 ปี', state: { ...state, values: { ...state.values, mainCapital: '500000' } } } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.plan.id, id);
  assert.equal(r.body.plan.state.values.mainCapital, '500000');

  r = await call('PATCH', { email: a, body: { id, name: 'คุณเอ (ปรับทุน)' } });
  assert.equal(r.body.plan.name, 'คุณเอ (ปรับทุน)');

  r = await call('DELETE', { email: a, query: { id } });
  assert.equal(r.statusCode, 200);
  r = await call('GET', { email: a });
  assert.equal(r.body.plans.length, 0);
});

test('แผนของตัวแทนแต่ละคนแยกกัน คนอื่นแก้หรือลบแผนเราไม่ได้', async () => {
  const a = 'owner@example.com', b = 'other@example.com';
  const r = await call('POST', { email: a, body: { name: 'ของ A', state } });
  const id = r.body.plan.id;
  assert.equal((await call('GET', { email: b })).body.plans.length, 0);
  assert.equal((await call('POST', { email: b, body: { id, name: 'ขโมย', state } })).statusCode, 404);
  assert.equal((await call('DELETE', { email: b, query: { id } })).statusCode, 404);
  assert.equal((await call('GET', { email: a })).body.plans[0].name, 'ของ A');
});

test('กรองข้อมูลที่รับเข้า: ต้องมีชื่อ คีย์แปลกถูกทิ้ง และจำกัดจำนวนแผน', async () => {
  const a = 'filter@example.com';
  assert.equal((await call('POST', { email: a, body: { name: '   ', state } })).statusCode, 400);
  assert.equal((await call('POST', { email: a, body: { name: 'x', state: 'not-an-object' } })).statusCode, 400);
  const r = await call('POST', { email: a, body: { name: 'x', state: { values: { 'bad key!': 'x', ok: 'y'.repeat(500) }, extra: { phone: '0812345678' } } } });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(Object.keys(r.body.plan.state.values), ['ok']);
  assert.equal(r.body.plan.state.values.ok.length, 64);
  assert.equal(r.body.plan.state.extra, undefined);
  for(let i = 1; i < PLAN_LIMIT; i++) await call('POST', { email: a, body: { name: 'p' + i, state } });
  assert.equal((await call('POST', { email: a, body: { name: 'เกิน', state } })).statusCode, 409);
});

test('หน้าคำนวณมีแถบแผนที่บันทึกไว้ และเก็บ/คืนค่าครบทุกช่อง', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<div class="card saved-plans-card" id="savedPlansCard" hidden>/);
  assert.match(html, /function calcSnapshotState\(\)\{/);
  assert.match(html, /function calcRestoreState\(state\)\{/);
  assert.match(html, /const SP_PLANS_URL = '\/api\/agent-plans';/);
  // แผนหลักต้องใส่ก่อน และทุนหลักต้องใส่หลังสุด ไม่งั้นการตั้งทุนขั้นต่ำอัตโนมัติจะทับทุนที่บันทึกไว้
  const fn = html.slice(html.indexOf('function calcRestoreState(state){'), html.indexOf('async function spFetch('));
  assert.ok(fn.indexOf('Object.entries(R)') < fn.indexOf("spSetVal(document.getElementById('mainCapital')"));
  assert.match(fn, /dcareAddRow\(/);
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(pkg.scripts.check, /api\/agent-plans\.js/);
});

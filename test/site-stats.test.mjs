import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cleanPath, sourceOf, isBot, deviceOf, thaiParts, visitorToken, buildHitCommands, readStats } from '../lib/site-stats.js';

test('path: รับเฉพาะ path ปกติ ตัด query/hash และกันขยะ', () => {
  assert.equal(cleanPath('/plans/smart-index-10-1?utm_source=line#x'), '/plans/smart-index-10-1');
  assert.equal(cleanPath('/Hospitals/'), '/hospitals');
  assert.equal(cleanPath(''), '/');
  assert.equal(cleanPath('/<script>'), null);
  assert.equal(cleanPath('/a/b/c/d/e'), null);
  assert.equal(cleanPath('/' + 'x'.repeat(200)), null);
});

test('ช่องทางที่มา: utm > เบราว์เซอร์ในแอป > referrer', () => {
  assert.equal(sourceOf({ utm: 'line_oa', referrer: 'https://www.google.com/' }), 'line');
  assert.equal(sourceOf({ ua: 'Mozilla/5.0 (iPhone) Line/13.1.0', referrer: '' }), 'line');
  assert.equal(sourceOf({ ua: 'Mozilla/5.0 [FBAN/FBIOS;FBAV/400]', referrer: '' }), 'facebook');
  assert.equal(sourceOf({ ua: 'Mozilla/5.0 musical_ly_2023', referrer: '' }), 'tiktok');
  assert.equal(sourceOf({ referrer: 'https://www.google.co.th/' }), 'google');
  assert.equal(sourceOf({ referrer: 'https://l.facebook.com/l.php' }), 'facebook');
  assert.equal(sourceOf({ referrer: 'https://www.doctor-insurance.com/plans', host: 'www.doctor-insurance.com' }), 'direct');
  assert.equal(sourceOf({ referrer: '' }), 'direct');
  assert.equal(sourceOf({ referrer: 'https://example.org/' }), 'other-site');
});

test('บอทไม่ถูกนับ และแยกอุปกรณ์ได้', () => {
  assert.ok(isBot('Googlebot/2.1'));
  assert.ok(isBot('facebookexternalhit/1.1'));
  assert.ok(isBot(''));
  assert.ok(!isBot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari'));
  assert.equal(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile'), 'mobile');
  assert.equal(deviceOf('Mozilla/5.0 (iPad; CPU OS 17_0)'), 'tablet');
  assert.equal(deviceOf('Mozilla/5.0 (Macintosh; Intel Mac OS X)'), 'desktop');
});

test('วัน/ชั่วโมงเป็นเวลาไทย', () => {
  assert.deepEqual(thaiParts(new Date('2026-11-16T18:30:00Z')), { day: '20261117', hour: 1 });
});

test('รหัสผู้เข้าชมไม่เก็บ IP ตรง ๆ', () => {
  const t = visitorToken({ vid: '', ip: '203.0.113.9', ua: 'x', day: '20261117' });
  assert.ok(!t.includes('203.0.113.9'));
  assert.equal(visitorToken({ vid: 'abc123def456ghi', ip: '1.1.1.1' }), 'v:abc123def456ghi');
});

test('ผู้ดูแลเข้าดูเว็บตัวเองไม่ปนยอดผู้เข้าชม', () => {
  const now = new Date('2026-11-17T03:00:00Z');
  const admin = buildHitCommands({ path: '/', kind: 'admin', source: 'direct', device: 'desktop', token: 'v:x', entry: true, now });
  assert.ok(!admin.some(c => c[0] === 'INCR' || c[0] === 'PFADD'));
  const guest = buildHitCommands({ path: '/plans', kind: 'guest', source: 'line', device: 'mobile', token: 'v:x', entry: true, now });
  assert.ok(guest.some(c => c[0] === 'INCR' && c[1] === 'st:pv:20261117'));
  assert.ok(guest.some(c => c[0] === 'HINCRBY' && c[1] === 'st:hour:20261117' && c[2] === '10'));
  assert.ok(guest.some(c => c[0] === 'HINCRBY' && c[1] === 'st:src' && c[2] === 'line'));
  const next = buildHitCommands({ path: '/plans', kind: 'guest', source: 'line', device: 'mobile', token: 'v:x', entry: false, now });
  assert.ok(!next.some(c => c[1] === 'st:src'), 'ช่องทางนับเฉพาะหน้าแรกของการเข้าเว็บ');
  // ไม่มีคำสั่งไหนเก็บข้อมูลระบุตัวบุคคล
  assert.ok(!JSON.stringify(guest).includes('@'));
});

test('อ่านสรุปสถิติจาก Redis pipeline', async () => {
  process.env.UPSTASH_KV_REST_API_URL = 'https://kv.example';
  process.env.UPSTASH_KV_REST_API_TOKEN = 't';
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const cmds = JSON.parse(opts.body);
    assert.ok(url.endsWith('/pipeline'));
    return { ok: true, json: async () => cmds.map(([op, key]) => {
      if (key === 'st:start') return { result: '20261110' };
      if (key === 'st:pv') return { result: '120' };
      if (op === 'PFCOUNT' && key === 'st:uv') return { result: 40 };
      if (key === 'st:page') return { result: ['/', '70', '/plans', '50'] };
      if (key === 'st:kind:20261117') return { result: ['guest', '9', 'agent', '3'] };
      if (key === 'st:hour:20261117') return { result: ['20', '5'] };
      if (key === 'st:pv:20261117') return { result: '12' };
      if (op === 'PFCOUNT' && key === 'st:uv:20261117') return { result: 4 };
      return { result: null };
    }) };
  };
  try {
    const d = await readStats({ days: 7, now: new Date('2026-11-17T05:00:00Z') });
    assert.equal(d.since, '20261110');
    assert.equal(d.total.pageviews, 120);
    assert.equal(d.total.visitors, 40);
    assert.equal(d.daily.length, 7);
    assert.deepEqual(d.today, { day: '20261117', pv: 12, uv: 4, visits: 0 });
    assert.equal(d.hoursToday[20], 5);
    assert.equal(d.pagesAll[0].key, '/');
    assert.deepEqual(d.kindsRange, { guest: 9, agent: 3 });
  } finally { globalThis.fetch = orig; }
});

test('หน้าเว็บ: ส่งตัวนับทุกครั้งที่เปลี่ยนหน้า และ dashboard เห็นเฉพาะผู้ดูแล', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /stats: '\/stats'/);
  assert.match(html, /id="page-stats"/);
  assert.match(html, /id="stHomeCard"[^>]*hidden/);
  assert.match(html, /if\(!a \|\| !a\.isAdmin\) return;/);
  assert.match(html, /routeFromLocation\(\);\nstQueue\(\);\nstHomeInit\(\);/);
  const api = fs.readFileSync(new URL('../api/stats.js', import.meta.url), 'utf8');
  assert.match(api, /isAdminEmail\(session\.email\)\) return json\(res, 403/);
  assert.equal(fs.readdirSync(new URL('../api/', import.meta.url)).filter(f => f.endsWith('.js')).length <= 12, true, 'Vercel Hobby จำกัด 12 functions');
});

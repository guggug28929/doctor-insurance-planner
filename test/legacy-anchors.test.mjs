import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

/* ลิงก์ 4 อันนี้ส่งให้ลูกค้าไปแล้วจริง ถ้าพังลูกค้าเปิดไม่ออกเลย
   เทสต์นี้จึงล็อกไว้ถาวร ห้ามลบ anchor ออกจากตารางแมป */
const SHIPPED_ANCHORS = ['waiting-period', 'health-exclusions', 'fax-claim', 'copayment'];

const legacyBlock = html.match(/const LEGACY_ANCHORS = \{([\s\S]*?)\};/);

test('ตารางแมป anchor เก่ายังอยู่ครบทั้ง 4 อัน', () => {
  assert.ok(legacyBlock, 'ไม่พบ LEGACY_ANCHORS');
  for (const a of SHIPPED_ANCHORS) {
    assert.ok(legacyBlock[1].includes(`'${a}'`), `หาย anchor "${a}" — ลิงก์ที่ส่งลูกค้าไปแล้วจะพัง`);
  }
});

test('ทุก anchor ชี้ไปยังคำถามที่มีอยู่จริงใน FAQ_ITEMS', () => {
  const keys = [...legacyBlock[1].matchAll(/key:\s*'([^']+)'/g)].map(m => m[1]);
  assert.equal(keys.length, SHIPPED_ANCHORS.length);
  for (const k of keys) {
    assert.ok(new RegExp(`k:\\s*'${k}'`).test(html),
      `anchor ชี้ไป key "${k}" แต่ไม่มีคำถามไหนใน FAQ_ITEMS ติดคีย์นี้`);
  }
});

test('ทุก anchor ชี้ไปยังหมวดที่มีอยู่จริงใน FAQ_GROUPS', () => {
  const groupBlock = html.match(/const FAQ_GROUPS = \[([\s\S]*?)\];/);
  const groups = [...groupBlock[1].matchAll(/id:\s*'([a-z]+)'/g)].map(m => m[1]);
  const wanted = [...legacyBlock[1].matchAll(/group:\s*'([^']+)'/g)].map(m => m[1]);
  for (const g of wanted) {
    assert.ok(groups.includes(g), `anchor ชี้ไปหมวด "${g}" ที่ไม่มีใน FAQ_GROUPS`);
  }
});

test('คำถามที่ติดคีย์ ต้องเรนเดอร์ id ออกมาให้เลื่อนไปหาได้', () => {
  assert.ok(html.includes('id="faq-${it.k}"'),
    'renderFaq ไม่ได้ใส่ id ให้ details ทำให้ scrollIntoView หาไม่เจอ');
});

/* เคยพลาดมาแล้ว: hashchange ถูกผูกไว้เป็นฟังก์ชันว่าง เลยไม่มีอะไรเกิดขึ้น */
test('hashchange ต้องเรียก openLegacyAnchor ไม่ใช่ฟังก์ชันว่าง', () => {
  const m = html.match(/addEventListener\('hashchange',([\s\S]{0,120}?)\);/);
  assert.ok(m, 'ไม่พบ hashchange listener');
  assert.ok(m[1].includes('openLegacyAnchor'),
    'hashchange ไม่ได้เรียก openLegacyAnchor — เปิดลิงก์ค้างหน้าเดิมจะไม่เด้ง');
});

test('เข้าเว็บครั้งแรกพร้อม hash ต้องเช็ค anchor ก่อนเลือกหน้า', () => {
  const m = html.match(/function routeFromLocation\(\)\{([\s\S]{0,160})/);
  assert.ok(m[1].includes('openLegacyAnchor(location.hash)'),
    'routeFromLocation ไม่ได้เช็ค hash ก่อน — เปิดลิงก์ตรงจากแชทจะไม่เด้งไปหัวข้อ');
});

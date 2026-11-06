import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* Care Plus ครบ 3 แบบ (มะเร็ง / ไตวายเรื้อรัง / มะเร็ง+ไต) × วงเงิน 1 ล้าน / 5 ล้าน × 4 งวดชำระ × กลุ่มอาชีพ 1-2 / 3
   ถอดจาก careplus_premium_all.pdf ทั้ง 24 หน้า (2026-11-06) */

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const CP = JSON.parse(readFileSync(new URL('../data/premium-rates.json', import.meta.url), 'utf8')).care_plus;
const V = CP.payment_schedules.variants;
const FREQS = ['annual', 'semiannual', 'quarterly', 'monthly'];
const KEYS = ['m_1m', 'f_1m', 'm_5m', 'f_5m'];
const FACTOR = {semiannual: 0.52, quarterly: 0.27, monthly: 0.09};

test('มีครบ 3 แบบ 2 กลุ่มอาชีพ 4 งวด 4 คอลัมน์ อายุ 0-98', () => {
  for(const v of ['ca', 'ckd', 'cackd']) for(const occ of ['1_2', '3']) for(const f of FREQS) for(const k of KEYS){
    const arr = V[v].occupations[occ][f][k];
    assert.equal(arr.length, 99, `${v}/${occ}/${f}/${k}`);
    for(let a = 0; a <= 98; a++){
      const shouldBeNull = occ === '3' && a <= 10;   // กลุ่มอาชีพ 3 ตารางเริ่มอายุ 11
      assert.equal(arr[a] === null, shouldBeNull, `${v}/${occ}/${f}/${k}/อายุ ${a}`);
    }
  }
});

test('เบี้ยงวดย่อยทุกช่อง = ปัดเศษ (เบี้ยรายปี × 0.52 / 0.27 / 0.09) ตามที่ตารางบริษัทใช้', () => {
  for(const v of ['ca', 'ckd', 'cackd']) for(const occ of ['1_2', '3']) for(const k of KEYS) for(let a = 0; a <= 98; a++){
    const A = V[v].occupations[occ].annual[k][a];
    if(A === null) continue;
    for(const [f, x] of Object.entries(FACTOR))
      assert.equal(V[v].occupations[occ][f][k][a], Math.floor(A * x + 0.5 + 1e-9), `${v}/${occ}/${f}/${k}/อายุ ${a}`);
  }
});

test('ซื้อคู่มะเร็ง+ไต เบี้ย = 90% ของซื้อแยก (ตรวจไขว้ค่าที่ถอดจาก PDF ทั้งสามแบบ)', () => {
  for(const occ of ['1_2', '3']) for(const k of KEYS) for(let a = 0; a <= 98; a++){
    const g = v => V[v].occupations[occ].annual[k][a];
    if(g('ca') === null) continue;
    assert.ok(Math.abs(g('cackd') - 0.9 * (g('ca') + g('ckd'))) <= 2, `${occ}/${k}/อายุ ${a}`);
  }
});

test('ค่าตัวอย่างตรงกับภาพในตาราง PDF', () => {
  assert.equal(V.ca.occupations['1_2'].annual.m_1m[0], 1254);
  assert.equal(V.ca.occupations['1_2'].semiannual.f_1m[11], 469);   // เดิมบันทึกผิดเป็น 470
  assert.equal(V.ckd.occupations['1_2'].annual.f_5m[23], 796);
  assert.equal(V.ckd.occupations['1_2'].annual.m_5m[52], 2506);
  assert.equal(V.ckd.occupations['1_2'].quarterly.m_1m[92], 2791);
  assert.equal(V.ckd.occupations['3'].annual.f_1m[64], 2783);
  assert.equal(V.cackd.occupations['3'].annual.m_5m[23], 2521);
  // ตารางแบน (กลุ่มอาชีพ 1-2 รายปี) ต้องเท่ากับตารางหลัก
  for(const v of ['ca', 'ckd', 'cackd']) for(const g of ['m', 'f']) for(const s of ['1m', '5m'])
    assert.deepEqual(CP[`${g}_${s}_${v}`], V[v].occupations['1_2'].annual[`${g}_${s}`]);
});

test('หน้าคำนวณเลือกได้ทั้ง 3 แบบ และวงเงิน 1 ล้าน / 5 ล้าน', () => {
  assert.match(html, /<option value="ca">มะเร็ง<\/option>\s*<option value="ckd">ไตวายเรื้อรัง<\/option>\s*<option value="cackd" selected>/);
  assert.match(html, /<select id="careplus_sum">\s*<option value="1m">1,000,000 บาท\/ปี<\/option>\s*<option value="5m" selected>/);
  assert.match(html, /const careplusSum = \(document\.getElementById\('careplus_sum'\) \|\| \{\}\)\.value === '1m' \? '1m' : '5m';/);
  assert.doesNotMatch(html, /const careplusSum = '5m';/);
  assert.match(html, /const CAREPLUS_PLAN_NAMES = \{ca:'มะเร็ง', ckd:'ไตวายเรื้อรัง', cackd:'มะเร็งและไตวายเรื้อรัง'\};/);
});

test('หน้าแบบประกันแสดงตารางครบ 3 แบบ และสลับวงเงินได้', () => {
  assert.match(html, /rateTable: \(freq='annual'\) => careplusRateTableBlock\(freq\),/);
  assert.match(html, /\[\['ca','มะเร็ง'\],\['ckd','ไต'\],\['cackd','มะเร็ง\+ไต'\]\]/);
  assert.match(html, /<select id="careplusTableSum"/);
});

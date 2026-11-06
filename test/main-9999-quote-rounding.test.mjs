import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* คุ้มครองตลอดชีพ 99/99 ทุน 50,000 · ระบบใบเสนอของบริษัทปัดอัตรารายปีต่อทุน 1,000 เป็นทศนิยม 1 ตำแหน่ง (ปัดครึ่งขึ้น) ก่อนคูณ 50
   ยืนยันจากใบเสนอจริง 2 ใบ (2026-11-06): ชาย 64 ปี อัตรา 61.45 -> 3,075 บาท · ชาย 39 ปี อัตรา 16.33 -> 815 บาท */
const M = JSON.parse(readFileSync(new URL('../data/premium-rates.json', import.meta.url), 'utf8')).main_99_99;

test('ตรงกับใบเสนอของบริษัท', () => {
  assert.equal(M.m[64], 3075);
  assert.equal(M.m[39], 815);
  assert.equal(M.payment_schedules.annual.m[64], 3075);
  assert.equal(M.payment_schedules.annual.m[39], 815);
});

test('เบี้ยรายปีทุกช่องลงท้ายด้วย 0 หรือ 5 เหมือนงวดอื่น (อัตราทศนิยม 1 ตำแหน่ง × 50)', () => {
  for(const g of ['m', 'f']) for(let a = 0; a <= 90; a++){
    assert.equal(M[g][a] % 5, 0, `${g} อายุ ${a}: ${M[g][a]}`);
    assert.equal(M[g][a], M.payment_schedules.annual[g][a]);
  }
});

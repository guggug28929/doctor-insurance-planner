import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* เบี้ยเริ่มต้นบนการ์ดหน้ารายการแผน

   บั๊กที่เจอเมื่อ 10 ส.ค. 2569 คือคำว่า "เริ่มต้น" ไม่ได้แปลว่าถูกที่สุดที่ซื้อได้จริง
   แต่แปลว่าถูกที่สุดในทะเบียนของหน้าเปรียบเทียบ ซึ่งเริ่มที่ทุน 500,000 ทุกแบบ
     สมาร์ท 99/20 ขึ้น 12,990 (ทุน 500,000) ทั้งที่ทุนขั้นต่ำคือ 200,000
     สมาร์ท 80/10 ขึ้น 42,300 (ทุน 500,000) ทั้งที่ทุนขั้นต่ำคือ 100,000
   ลูกค้างบจำกัดเห็นตัวเลขสูงกว่าความจริงหลายเท่าแล้วปิดหน้าไป ทั้งที่ซื้อได้

   อีกข้อคือหน่วยของแบบชำระครั้งเดียว ถ้าเขียนว่า "ต่อปี" แบบ 99/1 จะดูเหมือน
   ต้องจ่ายเงินก้อนนั้นทุกปี ซึ่งผิดคนละเรื่องกับความจริง */

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function slice(from, to){
  const i = html.indexOf(from);
  assert.notEqual(i, -1, `ไม่พบจุดเริ่ม ${from}`);
  const j = html.indexOf(to, i);
  assert.notEqual(j, -1, `ไม่พบจุดจบ ${to}`);
  return html.slice(i, j);
}

const ctx = vm.createContext({});
vm.runInContext(
  slice('const LIFE_COMPARE_PRODUCTS = {', '\nconst LIFE_COMPARE_ROW_DEFS')
  + '\n' + slice('function planCardMinSum(', '/* สัญญาหลัก · เริ่มที่ทุนขั้นต่ำ')
  + '\nglobalThis.PRODUCTS = LIFE_COMPARE_PRODUCTS;', ctx);

const PRODUCTS = ctx.PRODUCTS;
const ids = Object.keys(PRODUCTS);

test('ทุกแบบต้องบอกทุนขั้นต่ำเป็นตัวเลขที่อ่านได้', () => {
  assert.ok(ids.length >= 15, 'ทะเบียนแบบประกันชีวิตหายไปเยอะผิดปกติ');
  for(const id of ids){
    const v = ctx.planCardMinSum(PRODUCTS[id]);
    assert.ok(v != null && v > 0,
      `${id} · แถวทุนขั้นต่ำอ่านเป็นตัวเลขไม่ได้ (ค่าปัจจุบัน "${PRODUCTS[id].rows.minSum}") การ์ดจะถอยไปใช้ทุนของตารางเปรียบเทียบซึ่งสูงกว่าความจริง`);
  }
});

test('ทุนขั้นต่ำต้องไม่สูงกว่าทุนต่ำสุดในตารางเปรียบเทียบ', () => {
  // ถ้าสูงกว่า แปลว่าข้อมูลสองที่ขัดกันเอง ต้องรู้ตัวตั้งแต่ตอนรันเทสต์ ไม่ใช่ตอนลูกค้าทัก
  for(const id of ids){
    const min = ctx.planCardMinSum(PRODUCTS[id]);
    const tierMin = Math.min(...PRODUCTS[id].tiers.map(t => Number(t.value)));
    assert.ok(min <= tierMin,
      `${id} · ทุนขั้นต่ำ ${min} สูงกว่าทุนต่ำสุดในตารางเปรียบเทียบ ${tierMin}`);
  }
});

test('แบบชำระครั้งเดียวต้องไม่ขึ้นหน่วยว่าต่อปี', () => {
  const single = ids.filter(id => /ครั้งเดียว/.test(String(PRODUCTS[id].rows.pay || '')));
  assert.ok(single.length >= 3, 'ควรมีแบบชำระครั้งเดียวอยู่ในระบบ (กลุ่ม 99/1)');
  for(const id of single){
    assert.equal(ctx.planCardLifeUnit(PRODUCTS[id]), 'จ่ายครั้งเดียว', `${id} ยังขึ้นหน่วยผิด`);
  }
  const yearly = ids.filter(id => !/ครั้งเดียว/.test(String(PRODUCTS[id].rows.pay || '')));
  for(const id of yearly){
    assert.equal(ctx.planCardLifeUnit(PRODUCTS[id]), 'ต่อปี', `${id} ควรเป็นเบี้ยรายปี`);
  }
});

test('ตัวคิดเบี้ยเริ่มต้นต้องลองทุนขั้นต่ำก่อนทุนในตารางเปรียบเทียบ', () => {
  const fn = slice('function planCardLifePremium(', '\n/* สัญญาเพิ่มเติมสุขภาพ');
  assert.match(fn, /const min = planCardMinSum\(p\);/, 'ไม่ได้อ่านทุนขั้นต่ำจริง');
  assert.match(fn, /\[\.\.\.new Set\(min != null \? \[min, \.\.\.tiers\] : tiers\)\]/,
    'ทุนขั้นต่ำต้องอยู่หน้าสุดของลำดับที่ไล่ลอง');
  assert.match(fn, /const unit = planCardLifeUnit\(p\);/, 'หน่วยต้องอ่านจากงวดชำระจริง');
  assert.ok(!/unit:'ต่อปี'/.test(fn), 'ยังมีการฝังคำว่าต่อปีไว้ตายตัว');
  // ยังต้องไล่ทุนต่อ เพราะบางแบบตารางเป็นเบี้ยรายระดับทุน ทุนนอกตารางคำนวณไม่ได้
  assert.match(fn, /for\(const cap of caps\)\{/, 'ต้องไล่ทุนต่อเมื่อทุนขั้นต่ำคำนวณไม่ได้');
});

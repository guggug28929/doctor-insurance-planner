import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* กฎรับประกันที่ผู้ช่วยจัดแผนต้องไม่ละเมิด

   บั๊กสามตัวที่เจอจากการกวาดเมื่อ 9 ส.ค. 2569 มีต้นเหตุเดียวกันคือ
   กฎถูกเขียนไว้ที่หน้าแผนให้ลูกค้าอ่าน แต่ตัวจัดแผนไม่รู้จักกฎนั้น
   ผลคือระบบเสนอชุดที่ยื่นใบคำขอจริงไม่ผ่าน ซึ่งเสียเวลาทั้งตัวแทนและลูกค้า
     1) มัลติเพิล ซีไอ ถูกเสนอให้เด็กอายุ 0-6 ปี ทั้งที่ตารางเบี้ยเริ่มที่ 7 ปี
     2) (เลิกแล้ว) กฎ 10 เท่าของทุนสัญญาหลัก ปัจจุบัน CI Perfect Care สูงสุด 10 ล้าน, Multiple CI สูงสุด 20 ล้าน
     3) D Care ถูกเสนอกลุ่มละ 200,000 ทั้งที่ขั้นต่ำคือ 250,000 ต่อกลุ่ม */

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const RATES = JSON.parse(readFileSync(new URL('../data/premium-rates.json', import.meta.url), 'utf8'));

function fn(name){
  const i = html.indexOf(`function ${name}(`);
  assert.notEqual(i, -1, `ไม่พบฟังก์ชัน ${name}`);
  const rest = html.slice(i);
  return rest.slice(0, rest.indexOf('\n}\n') + 3);
}

test('เลิกกฎ 10 เท่าแล้ว ลิสต์สัญญาที่ผูกทุนหลักต้องว่าง', () => {
  assert.match(html, /const ADV_MAIN_RATIO_KINDS = \[\];/,
    'ลิสต์สัญญาที่ติดกฎผูกทุนหลักต้องว่าง เพราะ CI Perfect Care สูงสุด 10 ล้าน และ Multiple CI สูงสุด 20 ล้าน ไม่ผูกทุนหลัก');
});

test('มัลติเพิล ซีไอ ต้องไม่ถูกเสนอในอายุที่ตารางเบี้ยยังไม่รับ', () => {
  const push = fn('advPushMci');
  assert.match(push, /advCanPrice\(item, input\)/, 'ต้องเช็คว่าตีราคาได้ก่อนใส่ลงข้อเสนอ');
  assert.match(html, /advPushMci\(eliteOut, target, input\)/);
  assert.match(html, /advPushMci\(out, target, input\)/);
  // ยืนยันกับไฟล์เรตว่าอายุเริ่มต้นยังเป็น 7 ปีจริง ถ้าบริษัทเปลี่ยน เทสต์นี้จะเตือนให้มาทบทวน
  assert.equal(RATES.multiple_ci.age_start, 7);
});

test('D Care ทุนขั้นต่ำ 250,000 เป็นเกณฑ์ต่อกลุ่มโรค ไม่ใช่ยอดรวม', () => {
  const items = fn('advDcareItems');
  assert.match(items, /if\(perCat < st\.minSum \|\| perCat <= 0\)\{/,
    'ต้องเทียบทุนต่อกลุ่มกับขั้นต่ำ ไม่ใช่เอายอดรวมมาเทียบ');
  assert.ok(!/perCat \* cats\.length < st\.minSum/.test(items),
    'ยังเทียบยอดรวมกับขั้นต่ำอยู่ ซึ่งทำให้เสนอกลุ่มละต่ำกว่า 250,000 ได้');
  // เพดานยังเป็นยอดรวมทุกกลุ่มตามเดิม สองเกณฑ์นี้คนละแบบ ห้ามสลับ
  assert.match(items, /Math\.min\(target, st\.maxSum\)/);
});

test('หน้าแผนบำนาญต้องไม่ขึ้นกล่องว่าไม่มีตารางเบี้ย ทั้งที่มีเครื่องคำนวณอยู่ด้านบน', () => {
  assert.match(html, /\$\{p\.rateTable \|\| !p\.pension \? `/,
    'กล่องตารางเบี้ยต้องข้ามไปเมื่อเป็นแบบบำนาญที่ใช้เครื่องคำนวณแทน');
  // ห้ามส่งลูกค้าไปถามระบบตัวแทน
  assert.ok(!/สอบถามอัตราที่แท้จริงจาก SmartWeb/.test(html),
    'ยังมีข้อความให้ลูกค้าไปถาม SmartWeb ซึ่งเป็นระบบภายในของตัวแทน');
});

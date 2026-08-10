import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* เกณฑ์วงเงินสูงสุดของ HB บนหน้าแผน

   เดิมหน้าแผนบอกแค่ประโยคว่า "ต้องมีทุนสัญญาหลักขั้นต่ำตามวงเงินที่เลือก"
   ลูกค้าอ่านแล้วยังตอบไม่ได้ว่าตัวเองทำได้เท่าไร ต้องทักมาถามทุกราย
   ตอนนี้มีตารางเต็มบนหน้าแผน โดยอ่านจาก HB_TIERS ชุดเดียวกับที่เครื่องคำนวณใช้ตรวจ
   ถ้าวันหนึ่งมีคนไปพิมพ์ตัวเลขซ้ำไว้ในหน้าแผน เทสต์ชุดนี้จะจับได้ */

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function slice(from, to){
  const i = html.indexOf(from);
  assert.notEqual(i, -1, `ไม่พบจุดเริ่ม ${from}`);
  const j = html.indexOf(to, i);
  assert.notEqual(j, -1, `ไม่พบจุดจบ ${to}`);
  return html.slice(i, j);
}

const ctx = vm.createContext({});
// ตัดแค่ตัวตาราง อย่าเผลอลากโค้ดส่วนอื่นเข้ามารันใน vm ด้วย
vm.runInContext(slice('const HB_TIERS = [', '\n];') + '\n];\nglobalThis.T = HB_TIERS;', ctx);
const TIERS = ctx.T;

test('ตารางเกณฑ์ต้องอยู่บนหน้าแผน HB จริง', () => {
  assert.match(html, /function hbLimitSection\(\)\{/);
  assert.match(html, /detailSections: \(\) => hbLimitSection\(\)/);
  const sec = slice('function hbLimitSection()', 'function careplusPathoSection()');
  // สามด่านต้องอยู่ครบ ถ้าขาดด่านใดด่านหนึ่ง ลูกค้าจะคำนวณเองแล้วได้คำตอบสูงเกินจริง
  for(const s of ['รายได้ต่อปี ÷ 360', 'มีประกันสุขภาพเหมาจ่ายคู่กันไหม', 'ทุนประกันชีวิตของสัญญาหลัก'])
    assert.ok(sec.includes(s), `ขาดด่าน ${s}`);
  assert.ok(sec.includes('ต้องผ่าน<b>ครบทุกข้อ</b>'), 'ต้องบอกว่าใช้ตัวที่ต่ำที่สุด ไม่ใช่ตัวที่สูงที่สุด');
});

test('ตัวเลขในตารางต้องอ่านจาก HB_TIERS ไม่ใช่พิมพ์ค้างไว้', () => {
  const sec = slice('function hbLimitSection()', 'function careplusPathoSection()');
  assert.match(sec, /HB_TIERS\.map\(t =>/);
  assert.match(sec, /fmt\(t\.ipdMin\)/);
  assert.match(sec, /t\.noIpdMin === null \?/);
  /* ห้ามมีตัวเลขเพดานพิมพ์ค้าง ยกเว้นตัวอย่างที่อ้างอิงค่าจากตารางอยู่แล้ว
     ตรวจเฉพาะรูปแบบตัวเลขที่มีคอมมา ซึ่งเป็นรูปแบบที่คนมักพิมพ์มือ */
  assert.ok(!/[0-9]{1,3},[0-9]{3}/.test(sec.replace(/1,440,000|720,000|1,800,000/g, '')),
    'มีตัวเลขเพดานพิมพ์ค้างในหัวข้อนี้ ต้องอ่านจาก HB_TIERS ที่เดียว');
});

test('เกณฑ์ในตารางต้องตรงกับที่เครื่องคำนวณใช้ตรวจ', () => {
  // ค่าที่หน้าแผนแสดงกับค่าที่ใช้เตือนตอนคิดเบี้ย ต้องมาจากตัวเดียวกันเสมอ
  assert.ok(TIERS.length >= 8, 'ระดับวงเงินหายไปผิดปกติ');
  assert.equal(TIERS[0].amt, 1000);
  assert.equal(TIERS[TIERS.length-1].amt, 8000);
  const noIpdMax = TIERS.filter(t => t.noIpdMin !== null).slice(-1)[0];
  assert.equal(noIpdMax.amt, 5000, 'เพดานกรณีไม่มีสุขภาพเหมาจ่ายต้องเป็น 5,000 บาทต่อวัน');
  // ทุนขั้นต่ำต้องไม่ลดลงเมื่อวงเงินสูงขึ้น ทั้งสองกรณี
  let prevIpd = 0, prevNo = 0;
  for(const t of TIERS){
    assert.ok(t.ipdMin >= prevIpd, `ทุนขั้นต่ำกรณีมีสุขภาพลดลงที่วงเงิน ${t.amt}`);
    prevIpd = t.ipdMin;
    if(t.noIpdMin !== null){
      assert.ok(t.noIpdMin >= prevNo, `ทุนขั้นต่ำกรณีไม่มีสุขภาพลดลงที่วงเงิน ${t.amt}`);
      prevNo = t.noIpdMin;
    }
  }
  // กรณีมีสุขภาพเหมาจ่ายต้องผ่อนกว่าหรือเท่ากับกรณีไม่มีเสมอ ไม่งั้นข้อความบนหน้าแผนจะกลับด้าน
  for(const t of TIERS)
    if(t.noIpdMin !== null) assert.ok(t.ipdMin <= t.noIpdMin, `วงเงิน ${t.amt} เกณฑ์กลับด้าน`);
});

test('เครื่องคำนวณต้องยังเตือนครบทั้งสามด่าน', () => {
  assert.match(html, /const maxByIncome = Math\.floor\(inp\.hbIncome\/360\);/);
  assert.match(html, /ต้องแนบประกันสุขภาพเหมาจ่าย \(IPD\) ด้วย/);
  assert.match(html, /ต้องมีทุนประกันชีวิตสัญญาหลักอย่างน้อย/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* คอลัมน์เงินบำนาญและคุ้มครองชีวิตในตารางเบี้ยของแบบบำนาญ
   จุดที่พลาดง่ายที่สุดคือคิดว่าทุกแบบใช้กติกา "เบี้ยลบบำนาญ" เหมือนกัน
   ความจริงมีถึงสี่กติกา และสองแบบ (จี15 จี20) ยังยืนยันตัวเลขไม่ได้
   ตัวเลขทั้งหมดตรวจย้อนกับใบเสนอขายจริง SI_26081812919 */

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const PENSION = JSON.parse(readFileSync(new URL('../data/pension-plans.json', import.meta.url), 'utf8'));

function grab(sig){
  const i = html.indexOf(sig);
  let d = 0, started = false;
  for(let j = i; j < html.length; j++){
    if(html[j] === '{'){ d++; started = true; }
    else if(html[j] === '}'){ d--; if(started && d === 0) return html.slice(i, j + 1); }
  }
}
const sb = vm.createContext({PENSION, Math, Object, String, Number});
vm.runInContext([grab('function pensionPlan('), grab('function pensionDeathBenefit(')].join('\n'), sb);
const death = vm.runInContext('pensionDeathBenefit', sb);

test('ทุกแบบต้องบันทึกกติกาคุ้มครองชีวิตไว้ ไม่ปล่อยว่าง', () => {
  for(const [id, p] of Object.entries(PENSION.plans)){
    assert.ok(p.deathBenefitRule, `${id} ไม่มี deathBenefitRule`);
    assert.equal(typeof p.deathBenefitRule.computable, 'boolean', `${id} ไม่ได้ระบุว่าคำนวณได้หรือไม่`);
  }
});

/* จี15 กับ จี20 ห้ามแสดงตัวเลขเด็ดขาดจนกว่าจะได้เอกสารทางการ
   เพราะขั้นบันไดร้อยละในเอกสารขัดกันเองหนึ่งขั้น
   จี15 ไล่ได้ 240% แต่ระบุ 250% · จี20 ไล่ได้ 620% แต่ระบุ 600%
   และช่วงรับบำนาญจ่ายเป็นมูลค่าปัจจุบันซึ่งต้องใช้อัตราคิดลดที่ยังไม่มี */
test('แบบที่ยังยืนยันไม่ได้ ต้องไม่คืนตัวเลขออกมา', () => {
  for(const id of ['mt_8560_g15', 'mt_8555_g20']){
    const rule = PENSION.plans[id].deathBenefitRule;
    assert.equal(rule.computable, false, `${id} ต้องยังไม่แสดงตัวเลข`);
    assert.ok(rule.blockedReason && rule.blockedReason.length > 20, `${id} ต้องบอกเหตุผลที่ยังไม่แสดง`);
    assert.ok(Array.isArray(rule.needed) && rule.needed.length, `${id} ต้องระบุว่าขาดเอกสารอะไร`);
    for(const age of [30, 45, 59, 60, 70, 85]){
      const r = death(id, 1000000, age, 60, 500000, 100000);
      assert.equal(r.value, null, `${id} อายุ ${age} ต้องไม่คืนตัวเลข`);
      assert.equal(r.blocked, true);
    }
  }
});

/* หมุดตรวจจากใบเสนอขายจริง ชาย 37 · เฟล็กซี่ รีไทร์ 9065 · ทุน 700,000
   เบี้ยรายปี 52,717 · ชำระ 28 ปี · เบี้ยรวม 1,476,076 */
test('เฟล็กซี่ รีไทร์ ต้องตรงกับใบเสนอขายทุกบรรทัด', () => {
  const P = 52717, sum = 700000, start = 65;
  const cases = [
    [37, P * 1, 55353],            // ปีที่ 1
    [38, P * 2, 110706],
    [39, P * 3, 166059],
    [64, P * 28, 1549880],         // ปีสุดท้ายที่ชำระเบี้ย
  ];
  for(const [age, cumPrem, want] of cases){
    const r = death('flexi_retire_90xx', sum, age, start, cumPrem, 0);
    assert.equal(r.value, want, `อายุ ${age} คุ้มครองชีวิตไม่ตรงใบเสนอขาย`);
  }
  // เข้าช่วงรับบำนาญแล้ว เปลี่ยนเป็นเบี้ยสะสมลบบำนาญสะสม
  assert.equal(death('flexi_retire_90xx', sum, 65, start, 1476076, 84000).value, 1392076);
  assert.equal(death('flexi_retire_90xx', sum, 70, start, 1476076, 504000).value, 972076);
});

test('รับบำนาญเกินเบี้ยที่จ่ายแล้ว ต้องเป็นศูนย์ ไม่ใช่ติดลบ', () => {
  const r = death('flexi_retire_90xx', 700000, 85, 65, 1476076, 3000000);
  assert.equal(r.value, 0, 'ห้ามคืนค่าติดลบ');
});

test('แต่ละแบบใช้กติกาของตัวเอง ไม่ใช่สูตรเดียวกันหมด', () => {
  const cum = 1000000;
  // เฟล็กซี่ 105% ของเบี้ยสะสม
  assert.equal(death('flexi_retire_90xx', 1000000, 50, 65, cum, 0).value, 1050000);
  // 9901 ดี65 ใช้ 110%
  assert.equal(death('mt_9901_d65', 1000000, 50, 65, cum, 0).value, 1100000);
  // 8501 ใช้เบี้ยลบบำนาญตั้งแต่ต้น ไม่มีช่วงก่อนรับบำนาญ
  assert.equal(death('mt_8501', 1000000, 60, null, cum, 200000).value, 800000);
});

test('แฮปปี้ รีไทร์ 60 ใช้ขั้นบันไดร้อยละของทุน และมีพื้น 101%', () => {
  const sum = 1000000;
  const at = age => death('mt_happy_retire_60', sum, age, 60, 0, 0).value;
  // ตารางระบุ 100% ที่อายุ 20-34 แต่เงื่อนไขบอกว่าอย่างน้อย 101% ของทุน จึงต้องได้ 101%
  assert.equal(at(25), 1010000, 'ต้องยกขึ้นเป็นพื้น 101%');
  assert.equal(at(34), 1010000);
  assert.equal(at(35), 1500000);
  assert.equal(at(44), 2000000);
  assert.equal(at(45), 2500000);
  assert.equal(at(54), 3000000);
  assert.equal(at(55), 4000000);
  assert.equal(at(89), 4000000);
  // นอกช่วงตาราง ต้องไม่เดา
  assert.equal(death('mt_happy_retire_60', sum, 95, 60, 0, 0).value, null);
});

test('หน้าเว็บต้องใส่คอลัมน์เฉพาะแบบบำนาญ และไม่ปนกับคอลัมน์เบี้ย', () => {
  assert.match(html, /const pen = isPensionMainPlan\(inp\.mainPlan\) \? pensionBenefitColumns\(/);
  assert.match(html, /<th class="benefit-col">เงินบำนาญ\/ปี<\/th>/);
  assert.match(html, /<th class="benefit-col">คุ้มครองชีวิต<\/th>/);
  // แบบที่ยังยืนยันไม่ได้ ต้องขึ้นข้อความ ไม่ใช่ตัวเลขหรือช่องว่างเปล่า
  assert.match(html, /db\.blocked \? 'ตามกรมธรรม์' : '-'/);
  // ต้องมีคำอธิบายใต้ตารางเสมอว่าตัวเลขมาจากกติกาข้อไหน
  assert.match(html, /const benefitNote = pen \?/);
  assert.match(html, /ตัวเลขที่แสดงจะต้องตรงกับใบเสนอขายของบริษัทเท่านั้น/);
});

/* ไฟล์ข้อมูลถูกโหลดแยกจาก index.html ถ้าเบราว์เซอร์แคชไฟล์เก่าไว้
   ลูกค้าจะเห็นเบี้ยเก่าปนกับโค้ดใหม่ ซึ่งเป็นความผิดพลาดที่มองไม่เห็น */
test('ไฟล์ข้อมูลต้องมีตัวกันแคช ไม่งั้นลูกค้าอาจได้ตารางเบี้ยเก่า', () => {
  assert.match(html, /const DATA_VERSION = '\d{4}-\d{2}-\d{2}';/);
  for(const f of ['premium-rates.json', 'tax-rules.json', 'pension-plans.json'])
    assert.ok(html.includes(f + '?v=" + DATA_VERSION') || html.includes(f + "?v=' + DATA_VERSION"),
      `${f} ยังโหลดโดยไม่มีตัวกันแคช`);
});

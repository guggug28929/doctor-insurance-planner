import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* สัญญาเพิ่มเติม ภายในระยะเวลา (ประกันชีวิตแบบชั่วระยะเวลา)

   เป็นหมวดของตัวเองบนหน้าแผน ไม่ใช่สุขภาพ ไม่ใช่โรคร้ายแรง ไม่ใช่ทุพพลภาพ ไม่ใช่อุบัติเหตุ
   จ่ายเมื่อเสียชีวิตอย่างเดียว ครบสัญญาไม่มีเงินคืนและไม่มีมูลค่าเวนคืน

   จุดที่พลาดง่ายและต้องมีเทสต์กั้นไว้สามข้อ
   หนึ่ง เบี้ยล็อกที่อายุแรกเข้า ไม่ขยับตามอายุเหมือนสัญญาสุขภาพ ถ้าไปเปิดตารางที่อายุของปีนั้น
   ตัวเลขจะพุ่งขึ้นทุกปีทั้งที่แผนกำหนดจำนวนปีชำระไว้แน่นอนตั้งแต่วันทำสัญญา
   สอง ตารางหยุดตามจำนวนปีชำระและระยะคุ้มครองของแผน ไม่ใช่ลากยาวจนจบสัญญาหลัก
   สาม เบี้ยรายงวดต้องไม่ต่ำกว่า 200 บาท เป็นเงื่อนไขการรับประกัน ไม่ใช่คำแนะนำ */

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const RATES = JSON.parse(readFileSync(new URL('data/premium-rates.json', root), 'utf8'));
const G = RATES.term_rider;

function slice(from, to){
  const i = html.indexOf(from);
  assert.notEqual(i, -1, `ไม่พบจุดเริ่ม ${from}`);
  const j = html.indexOf(to, i);
  assert.notEqual(j, -1, `ไม่พบจุดจบ ${to}`);
  return html.slice(i, j);
}

// ดึงฟังก์ชันคิดเบี้ยจริงออกมารัน ไม่ใช่เขียนสูตรซ้ำในเทสต์
const ctx = vm.createContext({ RATES, Math, Number, document: undefined });
vm.runInContext(
  slice('function rateAtStart(arr, age, start){', 'function rateAt(arr, age){')
  + slice('function termRiderPremium(planKey, capital, gender, entryAge, freq){', 'function updateTermHint()')
  + '\nglobalThis.R = {termRiderPremium, termPlanMeta, termPremiumForYear};', ctx);
const { termRiderPremium, termPlanMeta, termPremiumForYear } = ctx.R;

const PLANS = ['10/5','10/10','15/5','15/15','19/5','19/14','19/15','19/16','19/19'];

test('ตารางอัตราต้องครบ 9 แผน อายุ 15 ถึง 59 ทั้งสองเพศ', () => {
  assert.deepEqual(Object.keys(G.plans).sort(), [...PLANS].sort(), 'รายการแผนเปลี่ยนไปจากหน้าข้อมูลผลิตภัณฑ์');
  assert.equal(G.age_start, 15);
  assert.equal(G.age_end, 59);
  for(const p of PLANS){
    for(const g of ['m','f']){
      const arr = G.plans[p].annual[g];
      assert.equal(arr.length, 45, `แผน ${p} เพศ ${g} จำนวนอายุไม่ครบ 15-59`);
      assert.ok(arr.every(v => typeof v === 'number' && v > 0), `แผน ${p} เพศ ${g} มีช่องว่างหรือค่าที่ไม่ใช่ตัวเลข`);
    }
  }
});

test('อัตราต้องเพิ่มตามอายุ และชายต้องไม่ถูกกว่าหญิง', () => {
  // ทั้งสองข้อเป็นลักษณะของตารางมรณวิสัย ถ้าค่าใดสวนทาง แปลว่าคัดลอกเลื่อนช่อง
  for(const p of PLANS){
    const m = G.plans[p].annual.m, f = G.plans[p].annual.f;
    for(let i = 1; i < m.length; i++){
      assert.ok(m[i] >= m[i-1], `แผน ${p} อัตราชายลดลงที่อายุ ${G.age_start + i}`);
      assert.ok(f[i] >= f[i-1], `แผน ${p} อัตราหญิงลดลงที่อายุ ${G.age_start + i}`);
    }
    for(let i = 0; i < m.length; i++){
      assert.ok(m[i] >= f[i], `แผน ${p} อายุ ${G.age_start + i} อัตราชายต่ำกว่าหญิง ผิดจากตาราง`);
    }
  }
});

test('อัตราต้องตรงกับหน้าข้อมูลผลิตภัณฑ์ทุกจุดที่ตรวจแล้ว', () => {
  // คัดลอกจากตารางอัตราเบี้ยรายปีต่อจำนวนเงินเอาประกันภัย 1,000 บาท บนหน้าผลิตภัณฑ์
  const want = {
    '10/5':   {15:[7.13,4.81],  27:[8.60,5.31],  45:[17.73,9.60],  59:[48.55,28.63]},
    '10/10':  {15:[3.58,2.42],  27:[4.33,2.67],  45:[8.99,4.84],   59:[25.29,14.65]},
    '15/5':   {15:[10.92,7.13], 27:[13.70,8.16], 45:[31.10,16.95], 59:[91.21,59.01]},
    '15/15':  {15:[3.63,2.36],  27:[4.57,2.71],  45:[10.56,5.66],  59:[33.00,20.54]},
    '19/5':   {15:[13.98,8.96], 27:[18.31,10.70],45:[44.93,24.97], 59:[133.70,94.22]},
    '19/14':  {15:[4.83,3.09],  27:[6.35,3.69],  45:[15.82,8.67],  59:[49.77,33.88]},
    '19/15':  {15:[4.54,2.90],  27:[5.96,3.46],  45:[14.89,8.15],  59:[47.25,32.02]},
    '19/16':  {15:[4.28,2.73],  27:[5.62,3.27],  45:[14.09,7.69],  59:[45.11,30.44]},
    '19/19':  {15:[3.68,2.35],  27:[4.84,2.81],  45:[12.23,6.64],  59:[40.40,26.89]},
  };
  for(const [plan, byAge] of Object.entries(want)){
    for(const [age, [rm, rf]] of Object.entries(byAge)){
      const a = Number(age);
      assert.equal(G.plans[plan].annual.m[a - G.age_start], rm, `แผน ${plan} ชายอายุ ${a}`);
      assert.equal(G.plans[plan].annual.f[a - G.age_start], rf, `แผน ${plan} หญิงอายุ ${a}`);
    }
  }
});

test('ระยะคุ้มครองและระยะชำระเบี้ยต้องตรงกับตารางแผนความคุ้มครอง', () => {
  const want = {'10/5':[10,5], '10/10':[10,10], '15/5':[15,5], '15/15':[15,15],
                '19/5':[19,5], '19/14':[19,14], '19/15':[19,15], '19/16':[19,16], '19/19':[19,19]};
  for(const [plan, [cover, pay]] of Object.entries(want)){
    const meta = termPlanMeta(plan);
    assert.ok(meta, `ไม่มี plan_meta ของแผน ${plan}`);
    assert.equal(meta.cover, cover, `แผน ${plan} ระยะคุ้มครองไม่ตรง`);
    assert.equal(meta.pay, pay, `แผน ${plan} ระยะชำระเบี้ยไม่ตรง`);
    // ชื่อแผนคือ คุ้มครอง/ชำระ ถ้าสองค่านี้ไม่ตรงกับชื่อ แปลว่าใส่สลับช่อง
    assert.deepEqual(plan.split('/').map(Number), [cover, pay], `ชื่อแผน ${plan} ไม่ตรงกับ plan_meta`);
    assert.ok(pay <= cover, `แผน ${plan} ชำระเบี้ยนานกว่าระยะคุ้มครอง`);
  }
});

test('เบี้ยที่คิดได้ต้องเท่ากับอัตรา คูณทุน หาร 1,000', () => {
  assert.equal(termRiderPremium('10/5', 1000000, 'f', 27, 'annual'), 5310);   // 5.31 × 1,000
  assert.equal(termRiderPremium('19/19', 500000, 'm', 40, 'annual'), 4420);   // 8.84 × 500
  assert.equal(termRiderPremium('15/15', 100000, 'f', 59, 'annual'), 2054);   // 20.54 × 100
});

test('เงื่อนไขที่บริษัทกำหนดต้องปิดกั้นการคิดเบี้ยจริง', () => {
  assert.equal(G.capital_min, 100000);
  assert.equal(G.min_modal_premium, 200);
  // ทุนต่ำกว่าขั้นต่ำ คิดไม่ได้ ไม่ใช่คิดแล้วค่อยเตือน
  assert.equal(termRiderPremium('10/5', 50000, 'f', 27, 'annual'), null);
  // อายุนอกช่วงที่เผยแพร่
  assert.equal(termRiderPremium('10/5', 1000000, 'f', 14, 'annual'), null);
  assert.equal(termRiderPremium('10/5', 1000000, 'f', 60, 'annual'), null);
  // งวดอื่นยังไม่มีตัวคูณทางการ ต้องคืน null ไม่ใช่เดาจากรายปี
  for(const freq of ['semiannual','quarterly','monthly']){
    assert.equal(termRiderPremium('10/5', 1000000, 'f', 27, freq), null, `งวด ${freq} ไม่ควรคิดเบี้ยให้`);
  }
  // แผนที่ไม่มีในตาราง
  assert.equal(termRiderPremium('20/20', 1000000, 'f', 27, 'annual'), null);
});

test('เบี้ยต้องคงที่ตลอดระยะชำระ แล้วหยุดตามแผน ไม่ลากยาวจนจบสัญญาหลัก', () => {
  const plan = '10/5', cap = 1000000, g = 'f', entry = 27;
  const level = termRiderPremium(plan, cap, g, entry, 'annual');
  // ปีที่ 1 ถึง 5 ต้องเท่ากันทุกปี ถ้าเปิดตารางที่อายุของปีนั้นจะไม่เท่า
  for(let y = 1; y <= 5; y++){
    assert.equal(termPremiumForYear(plan, cap, g, entry, y, 'annual'), level, `ปีที่ ${y} เบี้ยไม่คงที่`);
  }
  // ปีที่ 6 ถึง 10 ยังคุ้มครองแต่ชำระเบี้ยครบแล้ว
  for(let y = 6; y <= 10; y++){
    assert.equal(termPremiumForYear(plan, cap, g, entry, y, 'annual'), 0, `ปีที่ ${y} ควรเป็น 0 เพราะชำระเบี้ยครบแล้ว`);
  }
  // ปีที่ 11 พ้นระยะคุ้มครอง ต้องเป็นช่องว่าง ไม่ใช่ 0
  assert.equal(termPremiumForYear(plan, cap, g, entry, 11, 'annual'), null);
});

test('แผนที่ชำระเบี้ยเท่าระยะคุ้มครองต้องไม่มีปีที่เป็นศูนย์', () => {
  const plan = '19/19', cap = 1000000, g = 'm', entry = 30;
  const level = termRiderPremium(plan, cap, g, entry, 'annual');
  for(let y = 1; y <= 19; y++){
    assert.equal(termPremiumForYear(plan, cap, g, entry, y, 'annual'), level, `ปีที่ ${y} ควรยังชำระเบี้ยอยู่`);
  }
  assert.equal(termPremiumForYear(plan, cap, g, entry, 20, 'annual'), null);
});

test('หน้าคำนวณเบี้ยต้องมีแผงของตัวเองและครบทั้ง 9 แผน', () => {
  assert.ok(html.includes('id="use_term"'), 'ไม่มีช่องติ๊กแนบสัญญา');
  assert.ok(html.includes('id="term_plan"'), 'ไม่มีช่องเลือกแผน');
  assert.ok(html.includes('id="term_capital"'), 'ไม่มีช่องกรอกทุนประกัน');
  assert.ok(html.includes('id="termHint"'), 'ไม่มีคำอธิบายเงื่อนไขใต้ช่องกรอก');
  assert.ok(html.includes('id="termErr"'), 'ไม่มีช่องแสดงข้อผิดพลาด');
  for(const p of PLANS){
    assert.ok(html.includes(`<option value="${p}">`), `หน้าคำนวณไม่มีแผน ${p}`);
  }
  // ต้องเข้าไปเป็นคอลัมน์ในตาราง และเข้ายอดรวมผ่าน row.values เหมือนสัญญาอื่น
  assert.ok(html.includes("cols.push({key:'term'"), 'ไม่ได้เพิ่มคอลัมน์ในตารางเบี้ย');
  assert.ok(html.includes('row.values.term = termPremiumForYear('), 'ตารางไม่ได้ใช้ตัวคิดเบี้ยรายปีกรมธรรม์');
  assert.ok(html.includes('inp.useTerm'), 'ไม่ได้อ่านค่าจากฟอร์มเข้าสู่การคำนวณ');
});

test('ตัวเลือกงวดชำระอื่นต้องถูกทักในหน้าคำนวณ ไม่ใช่เงียบ ๆ แล้วขึ้นขีด', () => {
  assert.ok(html.includes('ภายในระยะเวลา ยังคำนวณได้เฉพาะงวดรายปี'),
    'ไม่มีข้อความเตือนเมื่อเลือกงวดที่ยังไม่มีอัตราเผยแพร่');
  assert.ok(html.includes('เบี้ยรายงวดของสัญญาเพิ่มเติม ภายในระยะเวลา ต้องไม่ต่ำกว่า'),
    'ไม่มีการตรวจเบี้ยรายงวดขั้นต่ำ');
});

test('หน้าแผนต้องมีหมวดของตัวเอง และการ์ดต้องอยู่ในหมวดนั้นจริง', () => {
  assert.ok(html.includes('id="grp-term"'), 'ไม่มีหมวดใหม่บนหน้าแผน');
  assert.ok(html.includes('data-plan-group="grp-term"'), 'ไม่มีปุ่มหมวดบนแถบเลือกหมวด');
  assert.ok(html.includes("jumpToPlanGroup('grp-term')"), 'ไม่มีลิงก์กระโดดไปหมวดใหม่');

  // การ์ดต้องอยู่ระหว่างหัวหมวดของตัวเองกับหัวหมวดถัดไป ไม่ใช่ค้างอยู่ในหมวดประกันชีวิตเหมือนเดิม
  const term = html.indexOf('id="grp-term"');
  const health = html.indexOf('id="grp-health"');
  const card = html.indexOf("showPlanDetail('termrider')");
  const life = html.indexOf('id="grp-life"');
  assert.ok(life < term && term < card && card < health,
    'การ์ดสัญญาเพิ่มเติม ภายในระยะเวลา ไม่ได้อยู่ในหมวดชีวิตแบบชั่วระยะเวลา');
});

test('หน้ารายละเอียดต้องบอกเงื่อนไขที่ทำให้แนบไม่ได้ ไม่ใช่บอกแต่ข้อดี', () => {
  const detail = slice('  termrider: {', '  premierlegacy991: {');
  for(const must of [
    'กรมธรรม์ใหม่',                 // แนบกรมธรรม์เดิมไม่ได้
    'ต่ำกว่ามาตรฐาน',                // รับเฉพาะ standard และ sub-standard จากอาชีพ
    'บัตรเครดิต',                    // ชำระด้วยบัตรเครดิตไม่ได้
    'การตรวจสุขภาพเป็นไปตามระเบียบบริษัท',
    '200 บาท',                      // เบี้ยรายงวดขั้นต่ำ
  ]){
    assert.ok(detail.includes(must), `หน้ารายละเอียดยังไม่ได้บอกเรื่อง "${must}"`);
  }
});

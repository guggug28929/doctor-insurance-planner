import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* แฮปปี้ เลดี้ / แฮปปี้ เลดี้ พลัส / คุ้มครองโรคเบาหวาน

   สามแบบนี้อยู่ในหมวดโรคร้ายแรงบนหน้าแผน (grp-ci) เหมือน Cancer และ D Care
   แฮปปี้ เลดี้ และแฮปปี้ เลดี้ พลัส รับทำประกันเฉพาะผู้หญิงเท่านั้น เบี้ยเป็นจำนวนเงินตรง
   ตามแบบผลประโยชน์ที่เลือก (ไม่ใช่อัตราต่อ 1,000) แบ่งเป็นช่วงอายุ (bands) คูณทุนประกัน 5 ระดับ
   คุ้มครองโรคเบาหวานรับทำได้ทั้งสองเพศ อัตราต่อทุน 1,000 บาท ต่อเนื่องรายอายุ แยกชาย/หญิง */

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const RATES = JSON.parse(readFileSync(new URL('data/premium-rates.json', root), 'utf8'));
const HL = RATES.happy_lady;
const HLP = RATES.happy_lady_plus;
const DB = RATES.diabetes_rider;

function slice(from, to){
  const i = html.indexOf(from);
  assert.notEqual(i, -1, `ไม่พบจุดเริ่ม ${from}`);
  const j = html.indexOf(to, i);
  assert.notEqual(j, -1, `ไม่พบจุดจบ ${to}`);
  return html.slice(i, j);
}

// ดึงฟังก์ชันคิดเบี้ยจริงออกมารัน ไม่ใช่เขียนสูตรซ้ำในเทสต์
const ctx = vm.createContext({ RATES, Math, Number, Array });
vm.runInContext(
  slice('function rateAtStart(arr, age, start){', 'function rateAt(arr, age){')
  + slice('function happyLadyRateAt(variant, capital, age, freq){', 'function paBandIndex')
  + '\nglobalThis.R = {happyLadyRateAt, happyLadyPremium, diabetesRateAt, diabetesPremium};', ctx);
const { happyLadyRateAt, happyLadyPremium, diabetesRateAt, diabetesPremium } = ctx.R;

test('แฮปปี้ เลดี้: ตารางอัตราต้องครบทุกช่วงอายุ ครบ 5 ระดับทุน ครบ 4 งวด', () => {
  assert.equal(HL.bands.length, 10, 'จำนวนช่วงอายุเปลี่ยนไป');
  assert.equal(HL.bands[0].from, 18);
  assert.equal(HL.bands[HL.bands.length-1].to, 64);
  assert.deepEqual(HL.capitals, [200000,400000,600000,800000,1000000]);
  const freqs = ['annual','semiannual','quarterly','monthly'];
  let prevTo = 17;
  for(const b of HL.bands){
    assert.equal(b.from, prevTo + 1, `ช่วงอายุขาดตอนที่ ${b.from}`);
    prevTo = b.to;
    for(const f of freqs){
      assert.equal(b[f].length, 5, `อายุ ${b.from} งวด ${f} ไม่ครบ 5 ระดับทุน`);
      for(const v of b[f]) assert.equal(typeof v, 'number', `อายุ ${b.from} งวด ${f} มีช่องว่าง`);
    }
  }
});

test('แฮปปี้ เลดี้ พลัส: ตารางอัตราต้องครบทุกช่วงอายุ ครบ 5 ระดับทุน ครบ 4 งวด', () => {
  assert.equal(HLP.bands.length, 6);
  assert.equal(HLP.bands[0].from, 18);
  assert.equal(HLP.bands[HLP.bands.length-1].to, 44);
  assert.deepEqual(HLP.capitals, [200000,400000,600000,800000,1000000]);
  for(const b of HLP.bands) for(const f of ['annual','semiannual','quarterly','monthly'])
    assert.equal(b[f].length, 5, `อายุ ${b.from} งวด ${f} ไม่ครบ 5 ระดับทุน`);
});

test('แฮปปี้ เลดี้: เบี้ยต้องตรงกับตารางที่ตรวจแล้ว และเป็นจำนวนเงินตรง ไม่ใช่อัตราต่อ 1,000', () => {
  assert.equal(happyLadyPremium('happy_lady', 200000, 18, 'annual'), 290);
  assert.equal(happyLadyPremium('happy_lady', 1000000, 18, 'annual'), 1340);
  assert.equal(happyLadyPremium('happy_lady', 1000000, 64, 'annual'), 7260); // ช่วงต่ออายุ 60-64
  assert.equal(happyLadyPremium('happy_lady', 200000, 18, 'monthly'), 25.52);
});

test('แฮปปี้ เลดี้ พลัส: เบี้ยต้องตรงกับตารางที่ตรวจแล้ว รวมแถวต่ออายุ 41-44', () => {
  assert.equal(happyLadyPremium('happy_lady_plus', 200000, 18, 'annual'), 1125);
  assert.equal(happyLadyPremium('happy_lady_plus', 1000000, 41, 'annual'), 24670); // ช่วงต่ออายุ 41-44
  assert.equal(happyLadyPremium('happy_lady_plus', 1000000, 41, 'quarterly'), 6414.2);
});

test('แฮปปี้ เลดี้ / พลัส: นอกช่วงอายุหรือทุนที่ไม่มีในตารางต้องคืนค่าว่าง ไม่ใช่เดาให้', () => {
  assert.equal(happyLadyRateAt('happy_lady', 200000, 17, 'annual'), null);
  assert.equal(happyLadyRateAt('happy_lady', 200000, 65, 'annual'), null); // เกิน renew_age_max
  assert.equal(happyLadyRateAt('happy_lady', 300000, 30, 'annual'), null); // ทุนไม่ตรงตาราง
  assert.equal(happyLadyRateAt('happy_lady_plus', 200000, 45, 'annual'), null); // เกิน renew_age_max ของพลัส (44)
  assert.equal(HL.entry_age_max, 50);
  assert.equal(HL.renew_age_max, 64);
  assert.equal(HLP.entry_age_max, 40);
  assert.equal(HLP.renew_age_max, 44);
});

test('แฮปปี้ เลดี้: อัตรารายปีต้องเพิ่มขึ้นตลอดช่วงอายุ 18-49 ปี แล้วตรงตามตารางที่ตรวจแล้วตั้งแต่ 50 ปีเป็นต้นไป', () => {
  // ตารางจริงของแบบนี้ อัตราลดลงตั้งแต่อายุ 50 ปี (จุดเดียวกับที่สมัครใหม่ปิดรับ) เป็นต้นไป
  // ตรวจสอบข้ามกับ PDF ต้นฉบับแล้วว่าไม่ใช่ความผิดพลาดในการคัดลอก จึงเช็กความเพิ่มขึ้นเฉพาะอายุ 18-49 ปี
  for(let i=0;i<HL.capitals.length;i++){
    let prev = 0;
    for(const b of HL.bands.filter(b => b.to <= 49)){
      assert.ok(b.annual[i] >= prev, `ทุน ${HL.capitals[i]} อัตราลดลงที่อายุ ${b.from}`);
      prev = b.annual[i];
    }
  }
  // ยืนยันว่าอัตราตั้งแต่อายุ 50 ปีลดลงจริงตามตารางต้นฉบับ ไม่ใช่ความผิดพลาดของเทสต์
  assert.equal(HL.bands.find(b=>b.from===45).annual[0], 3195);
  assert.equal(HL.bands.find(b=>b.from===50).annual[0], 2990);
  assert.equal(HL.bands.find(b=>b.from===60).annual[0], 1685);
});

test('คุ้มครองโรคเบาหวาน: ตารางอัตราต้องครบทุกอายุ 18-70 ทั้งสองเพศ ทุกงวด', () => {
  assert.equal(DB.entry_age_min, 18);
  assert.equal(DB.entry_age_max, 60);
  assert.equal(DB.renew_age_max, 70);
  assert.equal(DB.age_start, 18);
  const span = DB.renew_age_max - DB.age_start + 1; // 18..70 = 53 ค่า
  for(const f of ['annual','semiannual','quarterly','monthly']){
    for(const g of ['m','f']){
      const arr = DB.payment_schedules[f][g];
      assert.equal(arr.length, span, `งวด ${f} เพศ ${g} จำนวนอายุไม่ครบ`);
      for(const v of arr) assert.equal(typeof v, 'number');
    }
  }
});

test('คุ้มครองโรคเบาหวาน: เบี้ยต้องตรงกับตารางที่ตรวจแล้ว (อัตราต่อทุน 1,000 บาท)', () => {
  assert.equal(diabetesRateAt(18, 'm', 'annual'), 1.29);
  assert.equal(diabetesPremium(100000, 18, 'm', 'annual'), 129);
  assert.equal(diabetesPremium(1000000, 18, 'm', 'annual'), 1290);
});

test('คุ้มครองโรคเบาหวาน: นอกช่วงอายุที่รับต้องคืนค่าว่าง ไม่ใช่เดาให้', () => {
  assert.equal(diabetesRateAt(17, 'm', 'annual'), null);
  assert.equal(diabetesRateAt(71, 'f', 'annual'), null);
  assert.equal(typeof diabetesRateAt(70, 'f', 'annual'), 'number'); // 61-70 ต่ออายุได้ ยังมีอัตรา
  assert.equal(DB.renewal_only_from, 61);
});

test('เครื่องคำนวณต้องต่อสามแบบนี้เข้าไปแล้ว ไม่ใช่แค่มีในตารางอัตรา', () => {
  assert.match(html, /id="use_happy_lady"/);
  assert.match(html, /id="use_happy_lady_plus"/);
  assert.match(html, /id="use_diabetes"/);
  assert.match(html, /row\.values\.happy_lady = happyLadyPremium\('happy_lady', inp\.happyLadyCapital, age, freq\);/);
  assert.match(html, /row\.values\.happy_lady_plus = happyLadyPremium\('happy_lady_plus', inp\.happyLadyPlusCapital, age, freq\);/);
  assert.match(html, /row\.values\.diabetes = diabetesPremium\(inp\.diabetesCapital, age, gender, freq\);/);
  assert.match(html, /cols\.push\(\{key:'happy_lady', label:'แฮปปี้ เลดี้ \(Happy Lady\)'\}\)/);
  assert.match(html, /cols\.push\(\{key:'happy_lady_plus'/);
  assert.match(html, /cols\.push\(\{key:'diabetes'/);
});

test('หน้าแผนต้องมีการ์ดทั้งสามในหมวดโรคร้ายแรง (grp-ci) ก่อนหมวด TPD', () => {
  const iCi = html.indexOf('id="grp-ci"');
  const iHl = html.indexOf("showPlanDetail('happylady')");
  const iHlp = html.indexOf("showPlanDetail('happyladyplus')");
  const iDb = html.indexOf("showPlanDetail('diabetes')");
  const iTpd = html.indexOf('id="grp-tpd"');
  assert.ok(iCi > 0 && iHl > 0 && iHlp > 0 && iDb > 0 && iTpd > 0, 'การ์ดหรือหมวดใดหมวดหนึ่งหายไป');
  assert.ok(iCi < iHl && iHl < iHlp && iHlp < iDb && iDb < iTpd, 'ลำดับการ์ด/หมวดไม่ถูกต้อง');
  assert.match(html, /happylady: '\/plans\/happy-lady',/);
  assert.match(html, /happyladyplus: '\/plans\/happy-lady-plus',/);
  assert.match(html, /diabetes: '\/plans\/diabetes-protection',/);
});

test('หน้ารายละเอียดต้องมี PLAN_DETAILS ครบทั้งสามแบบ และอ่านอัตราจากไฟล์ข้อมูล', () => {
  assert.ok(html.includes("happylady: {\n    title: 'แฮปปี้ เลดี้ (Happy Lady)'"), 'ยังไม่มีหน้ารายละเอียดแฮปปี้ เลดี้');
  assert.ok(html.includes("happyladyplus: {\n    title: 'แฮปปี้ เลดี้ พลัส (Happy Lady Plus)'"), 'ยังไม่มีหน้ารายละเอียดแฮปปี้ เลดี้ พลัส');
  assert.ok(html.includes("diabetes: {\n    title: 'คุ้มครองโรคเบาหวาน (Diabetes)'"), 'ยังไม่มีหน้ารายละเอียดคุ้มครองโรคเบาหวาน');
  const sec = slice('function happyLadyRateTableBlock(variant, freq){', 'function diabetesRateAt(age, gender, freq){');
  assert.ok(sec.includes('RATES[variant]'), 'ตารางอัตราหน้าแผนของแฮปปี้ เลดี้ไม่ได้อ่านจากไฟล์ข้อมูล');
  const sec2 = slice('function diabetesRateTableBlock(freq){', 'function paBandIndex');
  assert.ok(sec2.includes('RATES.diabetes_rider'), 'ตารางอัตราหน้าแผนของเบาหวานไม่ได้อ่านจากไฟล์ข้อมูล');
});

test('ตรวจสอบทุกจุดที่ Cancer เชื่อมไว้ (validation, riderLabels, referenceAnnualValue) ต้องมีของสามแบบนี้ด้วย', () => {
  assert.match(html, /setErr\('happy_lady_capital','happyLadyErr'/);
  assert.match(html, /setErr\('happy_lady_plus_capital','happyLadyPlusErr'/);
  assert.match(html, /setErr\('diabetes_capital','diabetesErr'/);
  assert.match(html, /colKey === 'happy_lady'/);
  assert.match(html, /colKey === 'happy_lady_plus'/);
  assert.match(html, /colKey === 'diabetes'/);
  assert.match(html, /riderLabels\.push\(`แฮปปี้ เลดี้ — ทุน/);
  assert.match(html, /riderLabels\.push\(`คุ้มครองโรคเบาหวาน — ทุน/);
});

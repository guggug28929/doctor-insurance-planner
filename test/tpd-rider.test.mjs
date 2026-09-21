import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* สัญญาเพิ่มเติมทุพพลภาพสิ้นเชิงถาวร

   เป็นหมวดที่สี่ของเว็บ ไม่ใช่สุขภาพ ไม่ใช่โรคร้ายแรง ไม่ใช่อุบัติเหตุ
   เบี้ยคิดจากอัตราต่อทุน 1,000 บาท และเปลี่ยนตามช่วงอายุ ไม่ใช่ล็อกที่อายุแรกเข้า
   ทุนมีเพดานสองชั้นพร้อมกัน คือ 5 เท่าของทุนสัญญาหลัก และ 10 ล้านบาทของแบบเอง
   ถ้าด่านใดด่านหนึ่งหลุด ตัวแทนจะเสนอทุนที่บริษัทไม่รับตั้งแต่ขั้นสิทธิ์การขาย */

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const RATES = JSON.parse(readFileSync(new URL('data/premium-rates.json', root), 'utf8'));
const T = RATES.tpd_rider;

function slice(from, to){
  const i = html.indexOf(from);
  assert.notEqual(i, -1, `ไม่พบจุดเริ่ม ${from}`);
  const j = html.indexOf(to, i);
  assert.notEqual(j, -1, `ไม่พบจุดจบ ${to}`);
  return html.slice(i, j);
}

// ดึงฟังก์ชันคิดเบี้ยจริงออกมารัน ไม่ใช่เขียนสูตรซ้ำในเทสต์
const ctx = vm.createContext({ RATES, Math });
vm.runInContext(slice('function tpdRateAt(age, gender, freq){', 'function updateTpdHint()')
  + '\nglobalThis.R = {tpdRateAt, tpdPremium, tpdMaxCapital};', ctx);
const { tpdRateAt, tpdPremium, tpdMaxCapital } = ctx.R;

test('ตารางอัตราต้องครบทุกช่วงอายุ ทุกเพศ ทุกงวด', () => {
  assert.equal(T.bands.length, 19, 'จำนวนช่วงอายุเปลี่ยนไป');
  assert.equal(T.bands[0].from, 18);
  assert.equal(T.bands[T.bands.length-1].to, 69);
  const freqs = ['annual','semiannual','quarterly','monthly'];
  let prevTo = 17;
  for(const b of T.bands){
    assert.equal(b.from, prevTo + 1, `ช่วงอายุขาดตอนที่ ${b.from}`);
    prevTo = b.to;
    for(const g of ['m','f']) for(const f of freqs)
      assert.equal(typeof b[g][f], 'number', `อายุ ${b.from} เพศ ${g} งวด ${f} ไม่มีอัตรา`);
  }
});

test('อัตราต้องไม่ลดลงเมื่ออายุมากขึ้น และชายต้องไม่ถูกกว่าหญิง', () => {
  // ทุพพลภาพเป็นความเสี่ยงที่เพิ่มตามอายุ ถ้าตัวเลขลดลงแปลว่าคัดลอกผิดช่อง
  let pm = 0, pf = 0;
  for(const b of T.bands){
    assert.ok(b.m.annual >= pm, `อัตราชายลดลงที่อายุ ${b.from}`);
    assert.ok(b.f.annual >= pf, `อัตราหญิงลดลงที่อายุ ${b.from}`);
    assert.ok(b.m.annual >= b.f.annual, `อายุ ${b.from} อัตราชายต่ำกว่าหญิง ผิดจากตาราง`);
    pm = b.m.annual; pf = b.f.annual;
  }
});

test('เบี้ยที่คิดได้ต้องตรงกับตัวอย่างที่ตรวจกับตารางแล้ว', () => {
  assert.equal(tpdPremium(1000000, 40, 'm', 'annual'), 480);   // 0.48 × 1,000
  assert.equal(tpdPremium(1000000, 40, 'f', 'annual'), 220);   // 0.22 × 1,000
  assert.equal(tpdPremium(500000, 55, 'f', 'monthly'), 34);    // 0.068 × 500
  assert.equal(tpdPremium(1000000, 65, 'm', 'annual'), 3200);
  assert.equal(tpdPremium(1000000, 18, 'm', 'annual'), 260);
});

test('งวดย่อยต้องอ่านจากคอลัมน์ที่ประกาศ ไม่ใช่หารจากรายปี', () => {
  /* ถ้าใครเปลี่ยนไปคำนวณเอง ค่าจะเพี้ยนทันที เพราะแต่ละช่องปัดเศษของตัวเอง
     เช่น ชาย 55-59 รายปี 1.20 แต่ราย 6 เดือน 0.61 ไม่ใช่ 0.60 */
  const b = T.bands.find(x => x.from === 55);
  assert.equal(b.m.annual, 1.20);
  assert.equal(b.m.semiannual, 0.61);
  assert.notEqual(b.m.semiannual, b.m.annual / 2);
  const sec = slice('function tpdRateAt(age, gender, freq){', 'function paBandIndex');
  assert.ok(!/\/\s*2|\*\s*0\.5/.test(sec), 'มีการคิดงวดย่อยจากรายปีในโค้ด');
});

test('นอกช่วงอายุที่รับต้องคืนค่าว่าง ไม่ใช่เดาอัตราให้', () => {
  assert.equal(tpdRateAt(17, 'm', 'annual'), null);
  assert.equal(tpdRateAt(70, 'm', 'annual'), null);
  assert.equal(tpdPremium(1000000, 17, 'm', 'annual'), null);
  // 66 ถึง 69 ยังมีอัตรา เพราะใช้ต่ออายุได้ แต่สมัครใหม่ไม่ได้ ซึ่งกันด้วย validateInputs
  assert.equal(typeof tpdRateAt(69, 'm', 'annual'), 'number');
  assert.equal(T.entry_age_max, 65);
  assert.equal(T.renew_age_max, 69);
  assert.equal(T.cover_to_age, 70);
});

test('เพดานทุนต้องคิดสองด่านพร้อมกัน', () => {
  assert.equal(T.max_multiple_of_main, 5);
  assert.equal(T.capital_min, 100000);
  assert.equal(T.capital_max, 10000000);
  assert.equal(tpdMaxCapital(1000000), 5000000);      // 5 เท่ายังไม่ชนเพดานแบบ
  assert.equal(tpdMaxCapital(5000000), 10000000);     // 5 เท่า = 25 ล้าน แต่ถูกตัดที่ 10 ล้าน
  assert.equal(tpdMaxCapital(0), 0);
});

test('เครื่องคำนวณต้องคิดเบี้ยที่อายุของปีนั้น ไม่ใช่อายุแรกเข้า', () => {
  // เอกสารระบุว่าอัตราเปลี่ยนตามช่วงอายุ ถ้าล็อกที่อายุแรกเข้า ตารางสะสมจะต่ำกว่าความจริง
  assert.match(html, /if\(inp\.useTpd\) row\.values\.tpd = tpdPremium\(inp\.tpdCapital, age, gender, freq\);/);
  assert.ok(!/row\.values\.tpd = tpdPremium\(inp\.tpdCapital, entryAge/.test(html),
    'ยังล็อกอัตราไว้ที่อายุแรกเข้า');
  assert.match(html, /cols\.push\(\{key:'tpd', label:'ทุพพลภาพสิ้นเชิงถาวร \(TPD\)'\}\)/);
});

test('ต้องมีด่านตรวจครบทุกข้อของหลักเกณฑ์การรับประกัน', () => {
  const sec = slice('  if(inp.useTpd){\n    const t = RATES.tpd_rider;', '\n  return issues;');
  for(const s of ['entry_age_min', 'occupation_classes', 'capital_min', 'capital_max', 'max_multiple_of_main'])
    assert.ok(sec.includes(s), `ขาดด่านตรวจ ${s}`);
  assert.deepEqual(T.occupation_classes, [1,2,3]);
  assert.equal(T.waiting_period_days, 180);
});

test('เป็นหมวดของตัวเอง อยู่ระหว่างโรคร้ายแรงกับอุบัติเหตุ', () => {
  const iCi = html.indexOf('id="grp-ci"');
  const iTpd = html.indexOf('id="grp-tpd"');
  const iPa = html.indexOf('id="grp-pa"');
  assert.ok(iCi > 0 && iTpd > 0 && iPa > 0, 'หมวดใดหมวดหนึ่งหายไป');
  assert.ok(iCi < iTpd && iTpd < iPa, 'ลำดับหมวดบนหน้าแผนไม่ถูกต้อง');
  assert.match(html, /data-plan-group="grp-tpd"/);
  assert.match(html, /tpd: '\/plans\/tpd-rider',/);
  assert.ok(html.includes("tpd: {\n    title: 'สัญญาเพิ่มเติมทุพพลภาพสิ้นเชิงถาวร (TPD)'"),
    'ยังไม่มีหน้ารายละเอียดของแผนนี้');
});

test('หน้ารายละเอียดต้องอ่านอัตราจากไฟล์ข้อมูล ไม่ใช่พิมพ์ตัวเลขซ้ำ', () => {
  const sec = slice('function tpdRateTableBlock(freq){', 'function paBandIndex');
  assert.ok(sec.includes('RATES.tpd_rider'), 'ตารางบนหน้าแผนไม่ได้อ่านจากไฟล์ข้อมูล');
  assert.ok(!/[0-9]\.[0-9]{2}/.test(sec.replace(/0\.48 × 1,000 = 480/, '')),
    'มีอัตราเบี้ยพิมพ์ค้างไว้ในตารางหน้าแผน');
});

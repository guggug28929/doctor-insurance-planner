import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import vm from 'node:vm';

/* เฟล็กซี่ รีไทร์ เน็กซ์ 90/1 และ โปร 90/1 (ชำระเบี้ยครั้งเดียว บำนาญลดหย่อนได้)
   เบี้ยและผลประโยชน์ตรวจกับตัวอย่างในโบรชัวร์ฉบับ 01/10/2569 ของบริษัท
   จุดต่างเดียวของโปรคือเงินก้อน 30% ของทุน ณ อายุเริ่มรับบำนาญ */

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const PENSION = JSON.parse(readFileSync(new URL('data/pension-plans.json', root), 'utf8'));
const NEXT = 'flexi_retire_next_90_1', PRO = 'flexi_retire_pro_90_1';

const a = html.indexOf('const PENSION_FREQ_LABEL');
const b = html.indexOf('function pensionBalanceBox(');
assert.ok(a > 0 && b > a, 'ไม่พบช่วงฟังก์ชันบำนาญใน index.html');
const ctx = vm.createContext({PENSION, Math, Object, String, Number, Array, Infinity});
vm.runInContext(html.slice(a, b)
  + '\nglobalThis.R = {pensionPremium, pensionCashflow, pensionPctAt, pensionFirstPensionPct, pensionLumpSegment, pensionVariantKeys};', ctx);
const R = ctx.R;
const VARS = ['D55', 'D60', 'D65', 'D70'];

test('ข้อมูลแผน: 4 แบบย่อย อายุรับประกันและยอดบำนาญรวมตรงโบรชัวร์', () => {
  const want = {
    [NEXT]: {D55: [20, 50, 582], D60: [20, 55, 522], D65: [20, 60, 462], D70: [20, 65, 402]},
    [PRO]:  {D55: [20, 50, 600], D60: [20, 55, 540], D65: [20, 60, 480], D70: [20, 65, 420]},
  };
  for(const id of [NEXT, PRO]){
    const p = PENSION.plans[id];
    assert.ok(p, `ไม่พบ ${id}`);
    assert.equal(p.premiumTermType, 'single');
    assert.deepEqual(Object.keys(p.variants), VARS);
    for(const vk of VARS){
      const v = p.variants[vk];
      assert.deepEqual([v.entryAgeMin, v.entryAgeMax, v.totalPensionPct], want[id][vk], `${id} ${vk}`);
      // ผลรวมขั้นบันไดต้องเท่ายอดรวมที่โบรชัวร์ระบุ
      const sum = v.pensionLadder.reduce((s, seg) => s + seg.pct * ((seg.toAge - seg.fromAge) + 1), 0);
      assert.equal(sum, v.totalPensionPct, `${id} ${vk} ขั้นบันไดรวมไม่ตรง`);
    }
  }
});

test('เบี้ยตรงตัวอย่างโบรชัวร์ (ชาย 35 ปี ดี60 ทุน 1,000,000) และ 105% ของเบี้ยตรงช่องเสียชีวิต', () => {
  assert.equal(R.pensionPremium(NEXT, 'D60', 'male', 35, 1000000, 'single'), 2149600);
  assert.equal(R.pensionPremium(PRO, 'D60', 'male', 35, 1000000, 'single'), 2278620);
  assert.equal(Math.round(2149600 * 1.05), 2257080);
  assert.equal(Math.round(2278620 * 1.05), 2392551);
});

test('กระแสเงินสด: เน็กซ์ ดี60 บำนาญรวม 5,220,000 และโปร ดี60 รวม 5,400,000 เบี้ยจ่ายครั้งเดียว', () => {
  const n = R.pensionCashflow(NEXT, 'D60', 'male', 35, 1000000, 'single');
  const p = R.pensionCashflow(PRO, 'D60', 'male', 35, 1000000, 'single');
  assert.equal(n.totalPension, 5220000);
  assert.equal(p.totalPension, 5400000);
  assert.equal(n.payYears, 1);
  assert.equal(n.rows.filter(r => r.premium > 0).length, 1);
  assert.equal(n.rows[0].premium, 2149600);
  // เน็กซ์: 12% ตั้งแต่ปีแรกที่อายุ 60  โปร: ก้อน 30% ที่อายุ 60 แล้ว 12% ตั้งแต่ 61
  assert.equal(n.rows.find(r => r.age === 60).pension, 120000);
  assert.equal(p.rows.find(r => r.age === 60).pension, 300000);
  assert.equal(p.rows.find(r => r.age === 61).pension, 120000);
  assert.equal(p.rows.find(r => r.age === 90).pension, 240000);
});

test('ทุกแบบย่อย: โปรได้บำนาญรวมมากกว่าเน็กซ์เท่ากับ 18% ของทุนเสมอ', () => {
  for(const vk of VARS){
    const n = R.pensionCashflow(NEXT, vk, 'female', 30, 500000, 'single');
    const p = R.pensionCashflow(PRO, vk, 'female', 30, 500000, 'single');
    assert.equal(p.totalPension - n.totalPension, 500000 * 18 / 100, vk);
  }
});

test('ช่วงเงินก้อนของโปร: ใช้ % รายปีถัดไปคำนวณทุนจากบำนาญที่ต้องการ ไม่ใช้ 30%', () => {
  for(const vk of ['D55', 'D60', 'D65']){
    const start = PENSION.plans[PRO].variants[vk].pensionStartAge;
    assert.ok(R.pensionLumpSegment(PRO, vk), `${vk} ต้องมีเงินก้อน`);
    assert.equal(R.pensionPctAt(PRO, vk, start), 30);
    assert.equal(R.pensionFirstPensionPct(PRO, vk, start), 12);
  }
  // ดี70: เงินก้อนตอน 70 แล้วขึ้น 15% ทันทีตอน 71
  assert.equal(R.pensionFirstPensionPct(PRO, 'D70', 70), 15);
  // เน็กซ์ไม่มีเงินก้อน และแผนเดิมต้องไม่ถูกกระทบ
  assert.equal(R.pensionLumpSegment(NEXT, 'D60'), null);
  assert.equal(R.pensionFirstPensionPct(NEXT, 'D60', 60), 12);
  assert.equal(R.pensionLumpSegment('flexi_retire_90xx', 'D60'), null);
});

test('ตารางอัตราเบี้ย: ครบ 3 ช่วงทุน ชาย/หญิง ทุกอายุของทุกแบบ ไม่มีช่องว่าง', () => {
  for(const id of [NEXT, PRO]){
    const bands = PENSION.plans[id].ratePer1000.single;
    assert.deepEqual(Object.keys(bands), ['50000-99999', '100000-199999', '200000+']);
    for(const [bk, g] of Object.entries(bands)) for(const sex of ['male', 'female']) for(const vk of VARS){
      const v = PENSION.plans[id].variants[vk];
      for(let age = v.entryAgeMin; age <= v.entryAgeMax; age++){
        const r = g[sex][vk][String(age)];
        assert.equal(typeof r, 'number', `${id} ${bk} ${sex} ${vk} อายุ ${age}`);
        assert.ok(r > 0);
      }
    }
    // ทุนสูงขึ้น อัตราต่อ 1,000 ต้องไม่สูงขึ้น
    for(const sex of ['male', 'female']) for(const vk of VARS)
      assert.ok(bands['200000+'][sex][vk]['35'] <= bands['100000-199999'][sex][vk]['35']
        && bands['100000-199999'][sex][vk]['35'] <= bands['50000-99999'][sex][vk]['35']);
  }
  // นอกช่วงอายุรับประกันต้องไม่ได้เบี้ย (ห้ามเดา)
  assert.equal(R.pensionPremium(NEXT, 'D55', 'male', 51, 1000000, 'single'), null);
  assert.equal(R.pensionPremium(PRO, 'D70', 'male', 66, 1000000, 'single'), null);
});

test('เงื่อนไขการปรับอายุเริ่มรับบำนาญ: ตารางตรงโบรชัวร์ ค่าธรรมเนียม 300 บาท แจงล่วงหน้า 30 วัน', () => {
  for(const id of [NEXT, PRO]){
    const s = PENSION.plans[id].startAgeChange;
    assert.equal(s.fee, 300);
    assert.equal(s.noticeDays, 30);
    assert.equal(s.rules.length, 6);
    assert.deepEqual(s.matrix.D55, {D55: 'same', D60: 'up', D65: 'up', D70: 'up'});
    assert.deepEqual(s.matrix.D60, {D55: 'down:51-55', D60: 'same', D65: 'up', D70: 'up'});
    assert.deepEqual(s.matrix.D65, {D55: 'down:51-60', D60: 'down:56-60', D65: 'same', D70: 'up'});
    assert.deepEqual(s.matrix.D70, {D55: 'down:51-65', D60: 'down:56-65', D65: 'down:61-65', D70: 'same'});
  }
  const n = PENSION.plans[NEXT].startAgeChange.examples;
  const p = PENSION.plans[PRO].startAgeChange.examples;
  assert.deepEqual([n[0].sumAfter, n[0].totalPensionAfter, n[1].sumAfter, n[1].totalPensionAfter], [1259321, 5818061, 798739, 4648660]);
  assert.deepEqual([p[0].sumAfter, p[0].totalPensionAfter, p[0].deathBeforePension], [1256154, 6029538, 2392551]);
  assert.equal(p[0].premium, 2278620);
});

test('ชุดสิ่งที่ลูกค้าเห็น: หน้าแผน เส้นทาง ปก โบรชัวร์ และใบอัตราเบี้ยมีครบ', () => {
  assert.match(html, /flexi-retire-next-90-1/);
  assert.match(html, /flexi-retire-pro-90-1/);
  assert.match(html, /function pensionRateTableBlock\(pid\)/);
  assert.match(html, /function flexiNextProCompareSection\(\)/);
  assert.match(html, /function flexiStartAgeChangeSection\(pid\)/);
  assert.match(html, /flexi_retire_next_90_1: 'บำนาญขั้นบันได/);
  assert.match(html, /flexi_retire_pro_90_1: 'โครงเดียวกับเน็กซ์/);
  for(const f of ['public/brochures/flexi-retire-next-90-1.pdf', 'public/brochures/flexi-retire-pro-90-1.pdf',
                  'public/brochures/flexi-retire-next-90-1-rates.pdf', 'public/brochures/flexi-retire-pro-90-1-rates.pdf',
                  'public/plan-covers/pension-flexi-next-90-1.jpg', 'public/plan-covers/pension-flexi-pro-90-1.jpg']){
    assert.ok(existsSync(new URL(f, root)), `ไม่มีไฟล์ ${f}`);
  }
  for(const f of ['flexi-retire-next-90-1.pdf', 'flexi-retire-pro-90-1.pdf'])
    assert.ok(statSync(new URL('public/brochures/' + f, root)).size < 4 * 1024 * 1024, `${f} ใหญ่เกิน 4MB`);
  // ห้ามมีข้อมูลคอมมิชชันหรือแหล่งอ้างอิงภายในขึ้นหน้าเว็บ
  const block = html.slice(html.indexOf('function pensionRateTableBlock(pid)'), html.indexOf('function buildPensionPlanDetails()'));
  assert.doesNotMatch(block, /คอมมิชชัน|commission|smartweb|muangthai-agent/i);
});

test('หน้ารายละเอียดต้องคงเงื่อนไขแสดงตารางเบี้ยของแผนบำนาญ (p.rateTable || !p.pension)', () => {
  assert.ok(html.includes('${p.rateTable || !p.pension ? `'));
});

/* เฟล็กซี่ รีไทร์ 90/1 (รุ่นเดิม) ปิดการขายแล้ว: ซ่อนจากเว็บและเครื่องคำนวณ แต่ต้องไม่ลบข้อมูล */
test('รุ่นเดิม flexi_retire_90_1 ถูกซ่อนจากทุกจุดที่ลูกค้าเห็น แต่ข้อมูลยังอยู่', () => {
  assert.ok(PENSION.plans.flexi_retire_90_1, 'ข้อมูลรุ่นเดิมต้องยังอยู่ใน pension-plans.json');
  const ids = /const PENSION_IDS = \[([^\]]*)\]/.exec(html)[1];
  assert.doesNotMatch(ids, /flexi_retire_90_1'/, 'PENSION_IDS ต้องไม่มีรุ่นเดิม');
  assert.match(ids, /flexi_retire_next_90_1/);
  assert.match(ids, /flexi_retire_pro_90_1/);
  assert.doesNotMatch(html, /showPlanDetail\('flexi_retire_90_1'\)/, 'การ์ดแผนรุ่นเดิมต้องถูกเอาออก');
  assert.match(html, /PEN_STRAT_FAMILY = \{single: 'flexi_retire_next_90_1'/, 'ตารางเทียบรูปแบบชำระเบี้ยต้องใช้รุ่นที่ขายอยู่');
  assert.match(html, /path === '\/plans\/flexi-retire-90-1'/, 'ลิงก์เก่าต้องพาไปหน้ารวมแผน');
  // จำนวนแบบที่แสดงต้องตรงกับรายการจริง
  const n = ids.split(',').filter(s => s.trim()).length;
  assert.equal(n, 9);
  assert.match(html, /ประกันชีวิตแบบบำนาญ \(9 แบบ\)/);
  assert.match(html, /จากทั้ง 9 แบบ/);
});

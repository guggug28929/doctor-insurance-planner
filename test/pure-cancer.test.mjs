import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

/* เพียว แคนเซอร์ (Pure Cancer)

   ตารางเบี้ยมาจากเอกสารรายละเอียดแบบประกันของบริษัท ฉบับ 12.11.67
   เบี้ยเป็นจำนวนเงินตรงตามแบบ 4 แบบ (300,000 / 500,000 / 1,000,000 / 2,000,000)
   แยกชาย/หญิง แบ่งเป็น 10 ช่วงอายุ 18-70 ปี (61-70 เป็นอัตราต่ออายุเท่านั้น) */

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const RATES = JSON.parse(readFileSync(new URL('data/premium-rates.json', root), 'utf8'));
const PC = RATES.pure_cancer;

function slice(from, to){
  const i = html.indexOf(from);
  assert.notEqual(i, -1, `ไม่พบจุดเริ่ม ${from}`);
  const j = html.indexOf(to, i);
  assert.notEqual(j, -1, `ไม่พบจุดจบ ${to}`);
  return html.slice(i, j);
}

const ctx = vm.createContext({ RATES, Math, Number, Array });
vm.runInContext(
  slice('function pureCancerPremium(plan, gender, age, freq){', 'function pureCancerCapitalOf(plan){')
  + '\nglobalThis.R = {pureCancerPremium};', ctx);
const { pureCancerPremium } = ctx.R;

test('เพียว แคนเซอร์: ตารางครบ 10 ช่วงอายุ ต่อเนื่อง 18-70 ครบ 4 งวด 4 แบบ ทั้งชายและหญิง', () => {
  assert.equal(PC.bands.length, 10);
  assert.deepEqual(PC.plans, ['300k','500k','1m','2m']);
  assert.deepEqual(PC.capitals, [300000,500000,1000000,2000000]);
  let prev = 17;
  for(const b of PC.bands){
    assert.equal(b.from, prev + 1, `ช่วงอายุขาดตอนที่ ${b.from}`);
    prev = b.to;
    assert.equal(b.renewal_only, b.from >= 61);
    for(const f of ['annual','semiannual','quarterly','monthly'])
      for(const g of ['m','f']){
        assert.equal(b[f][g].length, 4, `อายุ ${b.from} งวด ${f} ${g} ไม่ครบ 4 แบบ`);
        for(const v of b[f][g]) assert.equal(typeof v, 'number');
      }
  }
  assert.equal(prev, 70);
});

test('เพียว แคนเซอร์: ตัวเลขตรงกับเอกสารของบริษัท (สุ่มตรวจหลายช่อง)', () => {
  assert.equal(pureCancerPremium('300k','m',18,'annual'), 220);
  assert.equal(pureCancerPremium('300k','f',25,'annual'), 288);
  assert.equal(pureCancerPremium('1m','f',33,'annual'), 1795);
  assert.equal(pureCancerPremium('2m','m',58,'annual'), 24124);
  assert.equal(pureCancerPremium('2m','f',70,'annual'), 28625);
  assert.equal(pureCancerPremium('500k','m',47,'semiannual'), 1364.76);
  assert.equal(pureCancerPremium('1m','f',52,'quarterly'), 2002.26);
  assert.equal(pureCancerPremium('2m','m',40,'monthly'), 258.45);
});

test('เพียว แคนเซอร์: งวดย่อยต้องเท่ารายปี × 0.51 / 0.26 / 0.088 ทุกช่อง', () => {
  const fac = {semiannual:0.51, quarterly:0.26, monthly:0.088};
  for(const b of PC.bands) for(const g of ['m','f']) for(let i = 0; i < 4; i++)
    for(const [f, k] of Object.entries(fac))
      assert.ok(Math.abs(b[f][g][i] - Math.round(b.annual[g][i]*k*100)/100) < 0.011,
        `อายุ ${b.from} ${g} แบบ ${i} งวด ${f}`);
});

test('เพียว แคนเซอร์: นอกช่วงอายุต้องคืน null ไม่เดาเบี้ย', () => {
  assert.equal(pureCancerPremium('300k','m',17,'annual'), null);
  assert.equal(pureCancerPremium('300k','m',71,'annual'), null);
  assert.equal(pureCancerPremium('3m','m',30,'annual'), null);
});

test('เพียว แคนเซอร์: มีหน้าแผน รูปหน้าปก โบรชัวร์ให้ดาวน์โหลด และอยู่ในเครื่องคำนวณ', () => {
  assert.match(html, /purecancer: \{\s*\n\s*title: 'เพียว แคนเซอร์ \(Pure Cancer\)'/);
  assert.match(html, /purecancer: '\/plans\/pure-cancer'/);
  assert.match(html, /showPlanDetail\('purecancer'\)/);
  assert.match(html, /id="use_pure_cancer"/);
  assert.match(html, /purecancer: \[\{file:'pure-cancer\.pdf'/);
  assert.ok(existsSync(new URL('public/brochures/pure-cancer.pdf', root)), 'ไม่มีไฟล์โบรชัวร์');
  assert.ok(existsSync(new URL('public/plan-covers/pure-cancer.jpg', root)), 'ไม่มีรูปหน้าปก');
  // ต้องอธิบายความต่างจากความคุ้มครองโรคมะเร็ง (Cancer Rider)
  assert.match(html, /function pureCancerVsCancerSection\(\)/);
});

test('ความคุ้มครองโรคมะเร็ง: ระยะรอคอยและอายุต่ออายุต้องตรงกับโบรชัวร์ของบริษัท (60 วัน ต่ออายุถึง 70 ปี)', () => {
  const block = slice("  cancer: {\n    title: 'ความคุ้มครองโรคมะเร็ง (Cancer)'", '\n  purecancer: {');
  assert.match(block, /60 วัน/);
  assert.doesNotMatch(block, /90 วัน/);
  assert.match(block, /ต่ออายุได้ถึง 70 ปี/);
});

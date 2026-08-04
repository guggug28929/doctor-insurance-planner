import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* ตาราง OPD เหมาจ่ายชุดเดิมถูกกางเป็นอาร์เรย์รายอายุ แล้วคอลัมน์เลื่อน
   ผลคือแผน 15,000 ที่อายุ 81 ขึ้นไปได้เบี้ย 19,000 ซึ่งแพงกว่าวงเงินที่ลูกค้าจะได้
   และอายุ 20 ก็ผิดด้วย (7,720 ทั้งที่ตารางจริงคือ 7,604)
   ชุดใหม่เก็บเป็นช่วงอายุตามหน้าตารางต้นฉบับตรง ๆ จึงไม่มีทางเลื่อนอีก */

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const RATES = JSON.parse(readFileSync(new URL('../data/premium-rates.json', import.meta.url), 'utf8'));
const G = RATES['opd_เหมา'];

function grab(sig){
  const i = html.indexOf(sig);
  let d = 0, started = false;
  for(let j = i; j < html.length; j++){
    if(html[j] === '{'){ d++; started = true; }
    else if(html[j] === '}'){ d--; if(started && d === 0) return html.slice(i, j + 1); }
  }
}
const sb = vm.createContext({RATES, Math, String, parseInt, Object});
vm.runInContext(grab('function opdMaoPremium('), sb);
const premium = vm.runInContext('opdMaoPremium', sb);

test('เก็บเป็นช่วงอายุ ไม่กางเป็นอาร์เรย์รายอายุ', () => {
  assert.ok(G.occupations, 'ต้องแยกตามชั้นอาชีพ');
  assert.ok(!G.m_15000 && !G.f_15000, 'อาร์เรย์รายอายุแบบเก่าต้องถูกลบออก เพราะเป็นต้นเหตุคอลัมน์เลื่อน');
  assert.ok(!G.data_issue, 'แก้ข้อมูลแล้ว ต้องไม่เหลือธงว่ายังต้องยืนยัน');
  assert.equal(G.verified_at, '2026-08-04');
  assert.deepEqual(G.plans, [15000, 20000, 25000, 30000, 50000, 100000]);
});

test('เบี้ยต้องไม่แพงกว่าวงเงินที่ได้ ทุกช่องในตาราง', () => {
  // ชื่อแผนคือวงเงินต่อปี ถ้าเบี้ยแพงกว่าวงเงินแปลว่าตารางผิดแน่นอน
  const bad = [];
  for(const [occ, t] of Object.entries(G.occupations))
    for(const b of t.bands)
      G.plans.forEach((ceil, i) => {
        if(b.m[i] >= ceil) bad.push(`ชั้น ${occ} อายุ ${b.from}-${b.to} ชาย แผน ${ceil} = ${b.m[i]}`);
        if(b.f[i] >= ceil) bad.push(`ชั้น ${occ} อายุ ${b.from}-${b.to} หญิง แผน ${ceil} = ${b.f[i]}`);
      });
  assert.deepEqual(bad, []);
});

test('ช่วงอายุต้องต่อกันสนิท ไม่ขาดไม่ทับ', () => {
  for(const [occ, t] of Object.entries(G.occupations)){
    assert.equal(t.bands[0].from, t.age_min, `ชั้น ${occ} ช่วงแรกไม่ตรงกับอายุต่ำสุด`);
    assert.equal(t.bands.at(-1).to, t.age_max, `ชั้น ${occ} ช่วงสุดท้ายไม่ตรงกับอายุสูงสุด`);
    for(let i = 1; i < t.bands.length; i++)
      assert.equal(t.bands[i].from, t.bands[i-1].to + 1,
        `ชั้น ${occ} ช่วงอายุขาดตอนที่ ${t.bands[i-1].to}`);
    for(const b of t.bands){
      assert.equal(b.m.length, G.plans.length, `ชั้น ${occ} อายุ ${b.from} คอลัมน์ชายไม่ครบ`);
      assert.equal(b.f.length, G.plans.length, `ชั้น ${occ} อายุ ${b.from} คอลัมน์หญิงไม่ครบ`);
    }
  }
});

test('อ่านค่าออกมาต้องตรงกับตารางทุกช่อง', () => {
  let n = 0;
  for(const [occ, t] of Object.entries(G.occupations))
    for(const b of t.bands)
      G.plans.forEach((plan, i) => {
        for(const [sex, arr] of [['m', b.m], ['f', b.f]])
          for(const age of [b.from, Math.floor((b.from + b.to) / 2), b.to]){
            n++;
            assert.equal(premium(String(plan), sex, age, occ === '3' ? '3' : '1', 'annual'), arr[i],
              `ชั้น ${occ} อายุ ${age} แผน ${plan} ${sex}`);
          }
      });
  assert.ok(n > 700, `เทียบได้แค่ ${n} จุด น่าจะอ่านตารางไม่ครบ`);
});

/* หมุดตรวจที่อ่านจากรูปตารางด้วยตา ถ้าวันไหนเลขพวกนี้เปลี่ยน ต้องกลับไปดูทุกครั้ง */
test('หมุดตรวจค่าที่เคยผิด', () => {
  assert.equal(premium('15000', 'm', 20, '1', 'annual'), 7604, 'เคยผิดเป็น 7,720');
  assert.equal(premium('15000', 'm', 85, '1', 'annual'), 14250, 'เคยผิดเป็น 19,000 ซึ่งแพงกว่าวงเงิน');
  assert.equal(premium('15000', 'm', 95, '1', 'annual'), 14250, 'เคยเป็น null');
  assert.equal(premium('100000', 'f', 8, '1', 'annual'), 86747);
  assert.equal(premium('100000', 'm', 8, '1', 'annual'), 82815);
  assert.equal(premium('30000', 'f', 65, '1', 'annual'), 26354);
});

test('ชั้นอาชีพ 3 ต้องใช้ตารางของตัวเอง ไม่ใช่ของชั้น 1-2', () => {
  // ชั้น 3 เสี่ยงกว่า เบี้ยจึงแพงกว่าเสมอ ถ้าเท่ากันแปลว่าไม่ได้แยกตาราง
  assert.equal(premium('30000', 'm', 45, '3', 'annual'), 24313);
  assert.ok(premium('30000', 'm', 45, '3', 'annual') > premium('30000', 'm', 45, '1', 'annual'));
  assert.equal(premium('15000', 'm', 45, '2', 'annual'), premium('15000', 'm', 45, '1', 'annual'),
    'ชั้น 1 กับ 2 ใช้ตารางเดียวกัน');
});

test('ช่วงอายุที่บริษัทไม่รับ ต้องคืนค่าว่าง ไม่ใช่เดา', () => {
  assert.equal(premium('15000', 'm', 5, '1', 'annual'), null, 'ชั้น 1-2 เริ่มที่อายุ 6');
  assert.equal(premium('15000', 'm', 99, '1', 'annual'), null, 'ตารางถึงอายุ 98');
  assert.equal(premium('15000', 'm', 10, '3', 'annual'), null, 'ชั้น 3 เริ่มที่อายุ 11 ไม่มีช่วง 6-10');
  assert.equal(premium('15000', 'm', 45, '4', 'annual'), null, 'ชั้นอาชีพ 4 ไม่มีอัตราเผยแพร่');
  assert.equal(premium('99999', 'm', 45, '1', 'annual'), null, 'แผนที่ไม่มีในตาราง');
});

test('เบี้ยรายงวดใช้ตัวคูณตามที่บริษัทกำหนด และปัดครึ่งขึ้น', () => {
  assert.deepEqual(G.freq_factor, {annual: 1, semiannual: 0.52, quarterly: 0.26, monthly: 0.087});
  const annual = premium('30000', 'm', 45, '1', 'annual');
  assert.equal(annual, 18702);
  assert.equal(premium('30000', 'm', 45, '1', 'semiannual'), Math.round(annual * 0.52));
  assert.equal(premium('30000', 'm', 45, '1', 'quarterly'), Math.round(annual * 0.26));
  assert.equal(premium('30000', 'm', 45, '1', 'monthly'), Math.round(annual * 0.087));
  // 9725.04 ต้องปัดลงเป็น 9725 ส่วน 1627.074 ปัดลงเป็น 1627
  assert.equal(premium('30000', 'm', 45, '1', 'semiannual'), 9725);
  assert.equal(premium('30000', 'm', 45, '1', 'monthly'), 1627);
  assert.equal(premium('30000', 'm', 45, '1', 'ไม่มีงวดนี้'), null);
});

test('เครื่องคำนวณต้องส่งชั้นอาชีพเข้าไปด้วย', () => {
  // เดิมไม่ได้ส่ง ทำให้ลูกค้าชั้นอาชีพ 3 ได้เบี้ยของชั้น 1-2 ซึ่งถูกกว่าความจริง
  assert.match(html, /function opdPremium\(cfg, gender, age, freq, occupationClass\)/);
  assert.match(html, /opdPremium\(cfg, gender, entryAge, freq, occupationClass\)\.label/);
  assert.match(html, /opdPremium\(cfg, gender, age, freq, occupationClass\)\.premium/);
  assert.match(html, /function opdMaoPremium\(plan, gender, age, occupationClass, freq\)/);
  // ไม่ควรเหลือตัวกันเบี้ยแพงกว่าวงเงินแบบชั่วคราวแล้ว เพราะแก้ข้อมูลจริงไปแล้ว
  assert.ok(!html.includes('needsVerify:true'), 'ตัวกันชั่วคราวต้องถูกถอดออกหลังแก้ข้อมูลจริง');
});

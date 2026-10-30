import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* ลูกค้าถามว่าหน้าคำนวณเบี้ยขาด Multiple CI ไหม ซึ่งขาดจริง
   ทั้งที่มีอัตราเบี้ย หน้ารายละเอียด และตัวเปรียบเทียบครบ แต่ไม่มีช่องติ๊กในเครื่องคำนวณ
   และเฟล็กซี่ 99/20 ก็เช่นกัน มีตารางเบี้ยจริงแต่ไม่มีให้เลือกเป็นสัญญาหลัก
   ไฟล์นี้ล็อกไว้ไม่ให้หายอีก */

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const api = readFileSync(new URL('../api/premium-quote.js', import.meta.url), 'utf8');
const RATES = JSON.parse(readFileSync(new URL('../data/premium-rates.json', import.meta.url), 'utf8'));

function grab(marker){
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, `ไม่พบ ${marker}`);
  let depth = 0;
  for(let i = html.indexOf('{', start); i < html.length; i++){
    if(html[i] === '{') depth++;
    else if(html[i] === '}'){ depth--; if(depth === 0) return html.slice(start, i + 1); }
  }
  throw new Error(`วงเล็บไม่ครบสำหรับ ${marker}`);
}

test('หน้าคำนวณต้องมีช่องติ๊ก Multiple CI ทุน 500,000 – 20,000,000 เพิ่มทีละ 500,000', () => {
  assert.match(html, /<input type="checkbox" id="use_mci">/);
  assert.match(html, /<input type="number" id="mci_capital" value="1000000" step="500000" min="500000" max="20000000">/);
  assert.match(html, /<input type="number" id="cipc_capital" value="500000" step="500000" min="500000" max="10000000">/);
  assert.match(html, /bindCheckboxToggle\('use_mci','mci_fields'\)/);
});

test('ทุน CI Perfect Care / Multiple CI ไม่ผูกกับทุนสัญญาหลัก (เลิกกฎ 10 เท่า) แต่มีเพดาน 10 ล้าน / 20 ล้าน', () => {
  assert.doesNotMatch(html, /inp\.cipcCapital > inp\.mainCapital\*10/);
  assert.doesNotMatch(html, /inp\.mciCapital > inp\.mainCapital\*10/);
  assert.match(html, /const CIPC_MAX_CAPITAL = 10000000/);
  assert.match(html, /const MCI_LIMITS = \{min: 500000, max: 20000000, step: 500000\}/);
  assert.match(html, /inp\.cipcCapital > CIPC_MAX_CAPITAL/);
  assert.match(html, /!mciCapitalValid\(inp\.mciCapital\)/);
  assert.doesNotMatch(html, /ไม่เกิน 10 เท่าของทุนสัญญาหลัก · จ่าย 100% ต่อกลุ่ม/);
});

test('Multiple CI ต้องต่อครบทุกจุดที่ CI Perfect Care ถูกต่ออยู่', () => {
  for(const re of [
    /const useMci = document\.getElementById\('use_mci'\)\.checked/,
    /useCipc, cipcCapital, useMci, mciCapital/,
    /cols\.push\(\{key:'mci', label:'Multiple CI'\}\)/,
    /row\.values\.mci = /,
    /if\(inp\.useMci\)\{ const v = multipleCiPremium\(inp\.mciCapital, gender, entryAge, 'annual'\)/,
    /if\(colKey === 'mci'\)/,
    /riderLabels\.push\(`Multiple CI/,
    /items\.push\(\{name:'Multiple CI'/,
    /ciLines\.push\('35 โรคร้ายแรง/,
    /setErr\('mci_capital','mciErr'/,
    /setChecked\('use_mci', true\)/,
  ]) assert.match(html, re, `ขาดการต่อ ${re}`);
  // ติ๊ก Multiple CI ต้องนับเป็นโรคร้ายแรงสำหรับกฎ 99/20 ทุนต่ำกว่า 1 ล้าน และต้องถูกห้ามกับแผน 15/3 15/6
  assert.equal((html.match(/inp\.useCipc \|\| inp\.useMci/g) || []).length, 3);
  assert.match(html, /'use_cipc','use_mci'/, 'ปุ่มล้างค่าต้องรวม Multiple CI');
});

test('ตารางเบี้ยรายปีต้องไม่ลากเบี้ย Multiple CI เกินอายุ 79 (คุ้มครองถึง 80)', () => {
  assert.match(html, /row\.values\.mci = age <= 79 \? multipleCiPremium/);
  assert.match(html, /colKey === 'mci'\) return inp\.useMci && age <= 79/);
});

test('เบี้ย Multiple CI ในเครื่องคำนวณต้องตรงกับตารางดิบ และทุนนอกคอลัมน์ใช้อัตราส่วนเดียวกัน', () => {
  const ctx = { RATES, Math, Number };
  vm.createContext(ctx);
  vm.runInContext(['const MCI_CAPITAL_COL = {500000: 2, 1000000: 3, 2000000: 4};', grab('const MCI_LIMITS = '), grab('function mciCapitalValid'), grab('function mciBaseColumn'), grab('function multipleCiPremium'), 'this.f = multipleCiPremium; this.ok = mciCapitalValid;'].join('\n'), ctx);
  for(const sex of ['m', 'f']) for(const [cap, col] of [[500000, 2], [1000000, 3], [2000000, 4]]) for(const age of [7, 30, 45, 65]){
    const row = RATES.multiple_ci[sex].find(b => b[0] <= age && age <= b[1]);
    assert.equal(ctx.f(cap, sex, age, 'annual'), row[col], `${sex} ${cap} อายุ ${age}`);
  }
  // ทุนนอกคอลัมน์ (เช่น 3 ล้าน 5 ล้าน 20 ล้าน) ต้องเท่ากับอัตราต่อทุน 1,000 บาทของตารางคูณทุน รายปีตรงเป๊ะ
  for(const sex of ['m', 'f']) for(const age of [7, 30, 45, 65]) for(const cap of [1500000, 3000000, 5000000, 20000000]){
    const row = RATES.multiple_ci[sex].find(b => b[0] <= age && age <= b[1]);
    assert.equal(ctx.f(cap, sex, age, 'annual'), row[2] * cap / 500000, `${sex} ${cap} อายุ ${age}`);
  }
  assert.equal(ctx.f(750000, 'm', 30, 'annual'), null, 'ทุนที่ไม่ใช่ทวีคูณของ 500,000 ต้องคืน null');
  assert.equal(ctx.f(20500000, 'm', 30, 'annual'), null, 'เกิน 20 ล้านต้องคืน null');
  assert.equal(ctx.f(0, 'm', 30, 'annual'), null);
  assert.equal(ctx.ok(20000000), true);
  assert.equal(ctx.ok(500000), true);
  assert.equal(ctx.ok(250000), false);
  assert.equal(ctx.f(1000000, 'm', 5, 'annual'), null, 'อายุต่ำกว่า 7 รับไม่ได้');
});

test('อายุรับทำใหม่ Multiple CI คือ 7-65 ตามโบรชัวร์ ทั้งหน้าเว็บและ API', () => {
  assert.match(html, /multipleci: \[7, 65\]/);
  assert.ok(!/7 – 69|7–69/.test(html), 'ยังมีข้อความ 7-69 ค้างอยู่');
  assert.match(html, /item\.kind==='mci'\) return age > 65 \? null/);
  assert.match(api, /profile\.age <= 65\s*\? bandPremium\(rates\.multiple_ci/);
});

test('เฟล็กซี่ 99/20 ต้องเลือกเป็นสัญญาหลักในเครื่องคำนวณได้ และตรวจทุน/อายุตามตารางจริง', () => {
  assert.match(html, /<input type="radio" name="mainPlan" value="flexi_99_20">/);
  assert.match(html, /if\(plan === 'flexi_99_20'\) return 'เมืองไทย เฟล็กซี่ โพรเทคชั่น 99\/20'/);
  assert.match(html, /flexi_99_20:'flexi9920'/);
  assert.match(html, /flexi_99_20:\{payYears:20, coverToAge:99\}/);
  assert.match(html, /inp\.mainPlan === 'flexi_99_20'/);
  assert.deepEqual(RATES.flexi_99_20.allowed_capitals, [500000, 1000000, 5000000]);
  assert.equal(RATES.flexi_99_20.age_end, 45);
});

// Audit ถาวร — บังคับว่าทุกแบบที่มีข้อมูลอัตราเบี้ยในระบบ ต้องเชื่อมครบทั้ง 4 ที่
// calculator · LIFE_PRODUCTS · advisor · compare
// ถ้ามีคนเพิ่มแบบใหม่ลง premium-rates.json แล้วลืมต่อสาย เทสต์นี้จะพัง
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const RATES = JSON.parse(
  await readFile(new URL("../data/premium-rates.json", import.meta.url), "utf8")
);

function bracketBlock(marker, open, close) {
  const start = html.indexOf(marker);
  if (start === -1) return "";
  let depth = 0;
  for (let i = html.indexOf(open, start); i < html.length; i++) {
    if (html[i] === open) depth++;
    else if (html[i] === close) {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  return "";
}
const selectableBlock = bracketBlock("const COMPARE_SELECTABLE_IDS = [", "[", "]");
const lifeProductsBlock = bracketBlock("const LIFE_PRODUCTS = [", "[", "]");
const lifeCompareBlock = bracketBlock("const LIFE_COMPARE_PRODUCTS = {", "{", "}");
const lifeProductIds = new Set([...lifeProductsBlock.matchAll(/id:'([a-z0-9_]+)'/g)].map((m) => m[1]));
const lifeCompareIds = new Set([...lifeCompareBlock.matchAll(/^ {2}([a-z0-9]+): \{title:/gm)].map((m) => m[1]));

/* ทะเบียนกลาง: แบบที่ต้องเชื่อมครบ พร้อม exact key และ route
   ชนิด main = สัญญาหลัก ต้องครบ 4 ที่
   ชนิด rider = สัญญาเพิ่มเติม ห้ามอยู่ในรายการสัญญาหลัก มีได้แค่หน้าแผนกับบล็อก add-on */
const REGISTRY = [
  {n: 1, name:'Smart Protection 99/7',        data:'main_99_7',            calc:'99_7',                 lp:'99_7',                 cmp:'main997',           route:'/plans/smart-protection-99-7',  kind:'main'},
  {n: 2, name:'Smart Protection 99/99 พรีเมียร์', data:'main_99_99_premier',calc:'99_99',                lp:'99_99',                cmp:'main9999',          route:'/plans/lifetime-protection-99-99', kind:'main'},
  {n: 3, name:'Smart Protection 80/10',       data:'main_80_10',           calc:'80_10',                lp:'80_10',                cmp:'main8010',          route:'/plans/smart-protection-80-10', kind:'main'},
  {n: 4, name:'Flexi Protection 99/5',        data:'flexi_protection_99_5',calc:'flexi_99_5',           lp:'flexi_99_5',           cmp:'flexi995',          route:'/plans/flexi-protection-99-5',  kind:'main'},
  {n: 5, name:'Premier Legacy 99/5',          data:'premier_legacy_99_5',  calc:'premier_legacy_99_5',  lp:'premier_legacy_99_5',  cmp:'premierlegacy995',  route:'/plans/premier-legacy-99-5',    kind:'main'},
  {n: 6, name:'Premier Legacy 99/10',         data:'premier_legacy_99_10', calc:'premier_legacy_99_10', lp:'premier_legacy_99_10', cmp:'premierlegacy9910', route:'/plans/premier-legacy-99-10',   kind:'main'},
  {n: 7, name:'เลกาซี่ เวลธ์ 99/5 ค่าเวนคืนคงที่', data:'legacy_wealth_99_5', calc:'legacy_wealth_99_5', lp:'legacy_wealth_99_5', cmp:'legacywealth995',   route:'/plans/legacy-wealth-99-5',     kind:'main'},
  {n: 8, name:'Happy Return 99/7',            data:'happy_return_99_7',    calc:'happy_return_99_7',    lp:'happy_return_99_7',    cmp:'happyreturn997',    route:'/plans/happy-return-99-7',      kind:'main'},
  {n: 9, name:'Happy Return 99/9',            data:'happy_return_99_9',    calc:'happy_return_99_9',    lp:'happy_return_99_9',    cmp:'happyreturn999',    route:'/plans/happy-return-99-9',      kind:'main'},
  {n:10, name:'Easy Protection 1/1',          data:'easy_protection_1_1',  calc:'easy_protection_1_1',  lp:'easy_protection_1_1',  cmp:'easyprotection',    route:'/plans/easy-protection',        kind:'main'},
  {n:11, name:'Easy Protection 5/5',          data:'easy_protection_5_5',  calc:'easy_protection_5_5',  lp:'easy_protection_5_5',  cmp:'easyprotection',    route:'/plans/easy-protection',        kind:'main'},
  {n:12, name:'Easy Protection 10/10',        data:'easy_protection_10_10',calc:'easy_protection_10_10',lp:'easy_protection_10_10',cmp:'easyprotection',    route:'/plans/easy-protection',        kind:'main'},
  {n:13, name:'Easy Protection 15/15',        data:'easy_protection_15_15',calc:'easy_protection_15_15',lp:'easy_protection_15_15',cmp:'easyprotection',    route:'/plans/easy-protection',        kind:'main'},
  {n:14, name:'วัยเก๋า คุ้มสุขใจ 90/90',       data:'sabaijai_90_90',       calc:'sabaijai_90_90',       lp:'sabaijai_90_90',       cmp:'waigao9090',        route:'/plans/waigao-90-90',           kind:'main'},
  {n:15, name:'วัยเก๋า คุ้มได้ใจ 99/10',       data:'sabaijai_99_10',       calc:'sabaijai_99_10',       lp:'sabaijai_99_10',       cmp:'waigao9910',        route:'/plans/waigao-99-10',           kind:'main'},
  {n:16, name:'Lifetime Protection 99/20',    data:'lifetime_protection',  calc:'lifetime_protection',  lp:'lifetime_protection',  cmp:'lifetimeprotection',route:'/plans/lifetime-protection',    kind:'main'},
  {n:17, name:'Smart Protection 99/20',       data:'main_99_20',           calc:'99_20',                lp:'99_20',                cmp:'main9920',          route:'/plans/smart-protection-99-20', kind:'main'},
  {n:18, name:'Premier Legacy 99/1 ชำระครั้งเดียว', data:'premier_legacy_99_1', calc:'premier_legacy_99_1', lp:'premier_legacy_99_1', cmp:'premierlegacy991', route:'/plans/premier-legacy-99-1', kind:'main'},
  {n:19, name:'เพื่อคุ้มครองตลอดชีพ 99/1 ไม่มีเงินคืน', data:'whole_life_99_1_nocash', calc:'whole_life_99_1_nocash', lp:'whole_life_99_1_nocash', cmp:'wholelife991nocash', route:'/plans/whole-life-99-1', kind:'main'},
  {n:20, name:'คุ้มครองตลอดชีพ 99/1 มีเงินคืน 1.75%', data:'whole_life_99_1_cashback', calc:'whole_life_99_1_cashback', lp:'whole_life_99_1_cashback', cmp:'wholelife991cashback', route:'/plans/whole-life-99-1-cashback', kind:'main'},
  {n:21, name:'Term rider ภายในระยะเวลา',      data:'term_rider',           calc:null, lp:null, cmp:null, route:'/plans/term-rider',                         kind:'rider'},
];

function inCalculator(key) {
  return html.includes(`name="mainPlan" value="${key}"`) || html.includes(`plan === '${key}'`);
}

test("ทุกแบบในทะเบียนมีข้อมูลอัตราเบี้ยจริง ไม่ใช่ชื่อลอย", () => {
  for (const r of REGISTRY) {
    assert.ok(RATES[r.data], `${r.name}: ไม่มีคีย์ ${r.data} ใน premium-rates.json`);
  }
});

test("สัญญาหลักทุกแบบเชื่อมครบทั้ง calculator LIFE_PRODUCTS advisor และ compare", () => {
  const fails = [];
  for (const r of REGISTRY.filter((x) => x.kind === "main")) {
    const checks = {
      calculator: inCalculator(r.calc),
      LIFE_PRODUCTS: lifeProductIds.has(r.lp),
      compare: selectableBlock.includes(`'${r.cmp}'`) && lifeCompareIds.has(r.cmp),
      route: html.includes(`'${r.route}'`),
    };
    // advisor ใช้ทะเบียนเดียวกับ LIFE_PRODUCTS จึงผูกกัน
    checks.advisor = checks.LIFE_PRODUCTS;
    const miss = Object.keys(checks).filter((k) => !checks[k]);
    if (miss.length) fails.push(`${r.n}. ${r.name} ขาด: ${miss.join(", ")}`);
  }
  assert.equal(fails.length, 0, "ยังมีแบบที่เชื่อมไม่ครบ\n" + fails.join("\n"));
});

test("สัญญาเพิ่มเติมต้องไม่ถูกจัดเป็นสัญญาหลัก", () => {
  for (const r of REGISTRY.filter((x) => x.kind === "rider")) {
    assert.ok(!inCalculator(r.data), `${r.name} ต้องไม่อยู่ในตัวเลือกสัญญาหลักของเครื่องคำนวณ`);
    assert.ok(!lifeProductIds.has(r.data), `${r.name} ต้องไม่อยู่ใน LIFE_PRODUCTS`);
    assert.ok(!selectableBlock.includes(`'${r.data}'`), `${r.name} ต้องไม่อยู่ในรายการเปรียบเทียบสัญญาหลัก`);
    assert.ok(html.includes(`'${r.route}'`), `${r.name} ควรมีหน้ารายละเอียดของตัวเอง`);
  }
});

test("ทุกแบบในกลุ่มเปรียบเทียบประกันชีวิต มีข้อมูลตารางครบ", () => {
  const groupBlock = bracketBlock("const COMPARE_GROUPS = {", "{", "}");
  const lifeIds = [...groupBlock.matchAll(/'([a-z0-9]+)'/g)].map((m) => m[1]);
  const healthIds = ["dhl", "ehp", "maochai", "ecp", "careplus", "opd"];
  for (const id of lifeIds) {
    if (healthIds.includes(id)) continue;
    assert.ok(lifeCompareIds.has(id), `${id} อยู่ในกลุ่มประกันชีวิตแต่ไม่มีข้อมูลใน LIFE_COMPARE_PRODUCTS`);
  }
});

test("แบบที่ยังไม่มีข้อมูล ต้องไม่ถูกอ้างถึงในระบบเลย ไม่ใช่ใส่ค่าเดา", () => {
  // คีย์เก่าที่เคยใช้ชั่วคราวระหว่างทำงาน ต้องไม่หลงเหลือในระบบ
  const blocked = ["main_99_1", "whole_life_99_1", "main_99_1_nocash"];
  for (const key of blocked) {
    assert.equal(RATES[key], undefined, `${key} ไม่ควรมีในไฟล์ข้อมูล ถ้ายังไม่ได้ตรวจจากแหล่งทางการ`);
    assert.ok(!html.includes(`name="mainPlan" value="${key}"`), `${key} ไม่ควรอยู่ในเครื่องคำนวณ`);
    assert.ok(!lifeProductIds.has(key), `${key} ไม่ควรอยู่ใน LIFE_PRODUCTS`);
  }
});

test("แบบชำระครั้งเดียวสองแบบ ต้องตรวจไขว้สองแหล่งและบันทึกจุดผิดจังหวะไว้บนหน้าเว็บ", () => {
  for (const key of ["premier_legacy_99_1", "whole_life_99_1_nocash"]) {
    const g = RATES[key];
    assert.equal(g.verification_status, "verified_two_sources", `${key} ต้องระบุว่าตรวจไขว้แล้ว`);
    assert.match(g.source_type, /smartweb_primary/);
    assert.match(g.source, /SmartWeb/);
    assert.match(g.scaling_note, /ไม่ใช่การประมาณ/);
    assert.match(g.riders_allowed, /แคร์ พลัส/);
    assert.match(g.underwriting, /HNW/);
    assert.equal(g.rates.annual.m.length, 81);
    assert.equal(g.rates.annual.f.length, 81);
    // ต้องเพิ่มตามอายุและหญิงถูกกว่าชายทุกอายุ
    for (let i = 0; i < 80; i++) {
      assert.ok(g.rates.annual.m[i + 1] > g.rates.annual.m[i], `${key} ชาย อายุ ${i}`);
      assert.ok(g.rates.annual.f[i + 1] > g.rates.annual.f[i], `${key} หญิง อายุ ${i}`);
    }
    for (let i = 0; i <= 80; i++) {
      assert.ok(g.rates.annual.f[i] < g.rates.annual.m[i], `${key} อายุ ${i} หญิงต้องถูกกว่าชาย`);
    }
  }
  // จุดผิดปกติต้องถูกบันทึกไว้ พร้อมค่าที่พิมพ์จริง ไม่ใช่แก้เงียบ ๆ
  const a = RATES.whole_life_99_1_nocash.anomaly_flag;
  assert.equal(a.increment, 8800);
  assert.equal(a.printed_values["30"], 2663200);
  assert.equal(a.confirmed_on_smartweb, true, "จุดผิดจังหวะต้องระบุว่าตรวจกับ SmartWeb แล้ว");
  assert.deepEqual(a.smartweb_rate_per_1000, {"29": 265.44, "30": 266.32});
  assert.match(a.note, /ไม่แก้เอง/);
  // หน้าเว็บต้องบอกจุดผิดจังหวะ และต้องไม่อ้างว่ายังไม่ได้ตรวจไขว้อีกต่อไป
  assert.match(html, /เบี้ยเพศชาย อายุ 29 ไป 30 เพิ่มขึ้นเพียง 8,800 บาท/);
  assert.match(html, /ไม่ใช่การพิมพ์ผิดของเว็บตัวแทน/);
  assert.match(html, /SmartWeb รหัสแบบ 241 ตรงกับเว็บตัวแทนครบ 162 ค่า/);
  assert.match(html, /SmartWeb รหัสแบบ 220 ตรงกับเว็บตัวแทนครบ 162 ค่า/);
  assert.doesNotMatch(html, /ไม่ควรใช้ตัวเลขนี้ออกใบเสนอราคาจริง/);
});

test("ตัวเลือกสัญญาหลักในเครื่องคำนวณ ทุกตัวคำนวณเบี้ยได้จริง", () => {
  const values = [...html.matchAll(/name="mainPlan" value="([a-z0-9_]+)"/g)].map((m) => m[1]);
  assert.ok(values.length >= 18, `มีตัวเลือกแค่ ${values.length} ตัว น้อยเกินไป`);
  const special = bracketBlock("const SPECIAL_MAIN_PLANS = {", "{", "}");
  for (const v of values) {
    if (["pension", "15_3", "15_6"].includes(v)) continue;      // มีเส้นทางคำนวณของตัวเอง
    const handled =
      html.includes(`plan === '${v}'`) ||
      special.includes(`  ${v}: {`) ||
      ["99_20", "99_99", "99_7", "80_10"].includes(v);           // อยู่ในสาขาเดิมของ mainPremiumAtEntry
    assert.ok(handled, `ตัวเลือก ${v} ไม่มีเส้นทางคำนวณเบี้ยรองรับ`);
  }
});

test("แบบอัตราคงที่ 99/1 มีเงินคืน ต้องเก็บอัตราตามที่ SmartWeb ระบุ และไม่แอบคิดเบี้ยเอง", () => {
  const g = RATES.whole_life_99_1_cashback;
  assert.equal(g.flat_rate_per_1000, 1000, "SmartWeb ระบุ 1,000 บาท ต่อทุน 1,000 บาท");
  assert.equal(g.rates.annual.m.length, 71, "อายุ 0 – 70 ปี");
  assert.equal(g.rates.annual.f.length, 71);
  // เท่ากันทุกอายุทุกเพศ ตามที่แหล่งระบุ
  for (let i = 0; i <= 70; i++) {
    assert.equal(g.rates.annual.m[i], 1000, `ชาย อายุ ${i}`);
    assert.equal(g.rates.annual.f[i], 1000, `หญิง อายุ ${i}`);
  }
  assert.equal(g.capital_min, 1000000);
  assert.equal(g.capital_max_per_person, 500000000);
  assert.match(g.riders_allowed, /ไม่สามารถซื้อสัญญาเพิ่มเติม/);
  assert.equal(g.annual_discount_per_1000, null);
  assert.match(g.annual_discount_note, /ไม่มี/);
  assert.equal(g.verification_status, "verified_smartweb_and_brochure");
  // หน้าเว็บต้องไม่ขายเกินจริงว่าไม่มีข้อยกเว้น และต้องบอกเรื่องจองสิทธิ์
  assert.match(html, /ไม่ใช่แบบไม่มีข้อยกเว้น/);
  assert.match(html, /ต้องจองสิทธิ์การขายก่อนส่งงานผ่าน/);
  // ผลประโยชน์ยืนยันจากใบปลิวแล้ว ต้องไม่เหลือข้อความว่ายังไม่พบ
  assert.match(g.maturity_benefit, /101\.75%/);
  assert.match(g.cash_back_verification, /ยืนยันจากใบปลิว/);
  // เพดานทุนต้องถูกบังคับในเส้นทางคำนวณ
  assert.match(html, /if\(g\.capital_max_per_person && capital > g\.capital_max_per_person\) return null;/);
});

test("ผลประโยชน์ 99/1 มีเงินคืน ต้องตรงกับใบปลิว และสูตรต้องพิสูจน์กับตัวอย่างในใบปลิวได้", () => {
  const g = RATES.whole_life_99_1_cashback;
  assert.equal(g.cash_back_rate_pct, 1.75);
  assert.equal(g.cash_back_first_year, 1);
  assert.equal(g.cash_back_last_age, 98);
  assert.equal(g.maturity_pct, 101.75);
  assert.match(g.death_benefit, /105%/);
  assert.match(g.death_benefit, /แล้วแต่จำนวนใดสูงกว่า/);
  assert.equal(g.exclusions.length, 3, "ใบปลิวระบุข้อยกเว้น 3 กรณี");

  // สูตรที่หน้าเว็บใช้ ต้องได้ผลตรงกับตัวอย่างในใบปลิวพอดี ไม่ใช่ใกล้เคียง
  const ex = g.brochure_example;
  const totalPct = g.cash_back_rate_pct * (g.cash_back_last_age - ex.entry_age) + g.maturity_pct;
  assert.equal(totalPct, ex.total_pct, "สูตรไม่ตรงกับตัวอย่างในใบปลิว");
  assert.equal(Math.round((totalPct / 100) * ex.capital), ex.total_benefit);
  assert.equal(g.cash_back_last_age - ex.entry_age, ex.cash_back_years);
  assert.equal(Math.round((g.cash_back_rate_pct / 100) * ex.capital), ex.cash_back_per_year);
  assert.equal(ex.total_benefit - ex.single_premium, ex.net_gain);

  // หน้าเว็บต้องติดป้ายว่าเป็นผลรวมไม่คิดมูลค่าเวลา ไม่ใช่ผลตอบแทนต่อปี
  assert.match(html, /ไม่คิดมูลค่าเวลาของเงิน ไม่ใช่ผลตอบแทนต่อปี/);
  assert.match(html, /function cashback9901Rows\(/);
  // ทุนสูงสุดต้องบอกว่านับรวมสามรุ่น ไม่ใช่รุ่นนี้รุ่นเดียว
  assert.match(g.capital_max_note, /2\.25%/);
  assert.match(g.capital_max_note, /2\.50%/);
});

test("เอกสารภายในของบริษัทต้องไม่หลุดขึ้น Git และผลประโยชน์ตัวแทนต้องไม่โผล่บนหน้าเว็บ", async () => {
  const ignore = await readFile(new URL("../.gitignore", import.meta.url), "utf8");
  assert.match(ignore, /9901returnslide\.pdf/, "สไลด์ภายในต้องถูก gitignore");
  /* ผลประโยชน์ตัวแทนและช่องทางจองสิทธิ์ภายใน ห้ามอยู่บนเว็บลูกค้า
     กันแบบตรงไปตรงมาที่ index.html เพราะเป็นไฟล์ที่เคยหลุดจริง
     ส่วนคำเดียวกันที่เป็นศัพท์กฎหมายของเงินได้ 40(2) อยู่ใน data/tax-rules.json ได้ตามปกติ */
  assert.ok(!html.includes("ค่านายหน้า"),
    "ห้ามเขียนคำนี้ใน index.html แม้ในคอมเมนต์ ถ้าเป็นศัพท์ 40(2) ให้เก็บไว้ในไฟล์ข้อมูลแทน");
  assert.ok(!html.includes("forms.gle"), "ห้ามมีลิงก์ฟอร์มจองสิทธิ์ภายในบนหน้าเว็บ");
  assert.ok(!html.includes("asp.campaign@muangthai.co.th"), "ห้ามมีอีเมลภายในบนหน้าเว็บ");
});

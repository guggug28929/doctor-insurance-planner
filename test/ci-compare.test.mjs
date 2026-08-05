// เทสต์หน้าเทียบประกันโรคร้ายแรง /plans/compare-ci
// ตัวเลขทุกตัวบนหน้าต้องมาจากตารางอัตราเบี้ยจริงในระบบ ไม่ใช่ค่าที่พิมพ์ลอยไว้
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const RATES = JSON.parse(
  await readFile(new URL("../data/premium-rates.json", import.meta.url), "utf8")
);

function extract(marker) {
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, `ไม่พบ ${marker} ใน index.html`);
  let depth = 0;
  for (let i = html.indexOf("{", start); i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error(`วงเล็บไม่ครบสำหรับ ${marker}`);
}
function extractConst(name) {
  const start = html.indexOf(`const ${name} = [`);
  assert.notEqual(start, -1, `ไม่พบ const ${name}`);
  let depth = 0;
  for (let i = html.indexOf("[", start); i < html.length; i++) {
    if (html[i] === "[") depth++;
    else if (html[i] === "]") {
      depth--;
      if (depth === 0) return html.slice(start, i + 1) + ";";
    }
  }
  throw new Error(`วงเล็บไม่ครบสำหรับ ${name}`);
}

const sandbox = { RATES, Math, Number, Array, String, JSON, Object };
vm.createContext(sandbox);
vm.runInContext(
  [
    extract("function rateAtStart("),
    extract("function rateAt("),
    extract("function lifetimeProtectionPremium("),
    extract("function cipcPremium("),
    extract("function cancerPremium("),
    extract("function dcareRateArray("),
    extract("function dcareRate("),
    extract("function dcarePremium("),
    extract("function careplusPremium("),
    extract("function occKeyFor("),
    extractConst("CI_PLANS"),
    extract("const CI_NEW_BUSINESS_AGE = "),
    extract("function ciAgeAllowed("),
    extract("function ciAnnualPremiums("),
    extract("function ciCumulative("),
  ]
    .join("\n")
    // ciAnnualPremiums เรียก mainPremiumAtEntry ซึ่งเป็นตัวกระจายงานของหน้าเว็บ
    // ในเทสต์ต่อสายตรงเข้าฟังก์ชันของแบบนี้ เพื่อไม่ต้องลากทั้งไฟล์เข้ามา
    .replace(/mainPremiumAtEntry\('lifetime_protection', ?sum, ?sex, ?age, ?'annual'\)/g,
             "lifetimeProtectionPremium(sum, sex, age, 'annual')")
    .replace(/mainPremiumAtEntry\('lifetime_protection', ?sum, ?sex, ?startAge, ?'annual'\)/g,
             "lifetimeProtectionPremium(sum, sex, startAge, 'annual')"),
  sandbox
);
const CI_PLANS = vm.runInContext("CI_PLANS", sandbox);
const premiums = (...a) => vm.runInContext("ciAnnualPremiums", sandbox)(...a);
const cumulative = (...a) => vm.runInContext("ciCumulative", sandbox)(...a);

test("หน้าใหม่ถูกต่อเข้าระบบครบทุกจุด", () => {
  assert.match(html, /id="page-ci-compare"/);
  assert.match(html, /'ci-compare': '\/plans\/compare-ci'/);
  assert.match(html, /if\(name === 'ci-compare'/);
  // ต้องมีปุ่มเข้าจากทั้งหน้าแผนประกันและหน้าประกันสุขภาพ
  assert.equal((html.match(/showPage\('ci-compare'\)/g) || []).length, 2);
  for (const id of ["ciCompareTable", "ciAdvisorOut", "ciCrossoverOut", "ciAgeGuide", "ciReduceGuide"]) {
    assert.match(html, new RegExp(`id="${id}"`), `ไม่พบกล่อง ${id}`);
  }
});

test("ตารางเกณฑ์ครบทุกแบบ และสองแถวแรกคือเรื่องที่เข้าใจผิดบ่อยที่สุด", () => {
  assert.equal(CI_PLANS.length, 6);
  const keys = CI_PLANS.map((p) => p.key).join(",");
  assert.equal(keys, "lifetimeprotection,cipc,dcare,multipleci,cancer,careplus");
  for (const p of CI_PLANS) {
    for (const f of ["times", "endsAfterClaim", "wait", "entry", "renew", "minSum", "cashValue", "fit"]) {
      assert.ok(p[f] && p[f].length > 3, `${p.key} ขาดข้อมูล ${f}`);
    }
  }
  const tableFn = html.indexOf("function renderCiCompareTable(");
  const body = html.slice(tableFn, tableFn + 1600);
  assert.ok(body.indexOf("จ่ายกี่ครั้ง") < body.indexOf("ชนิดสัญญา"));
  assert.ok(body.indexOf("เคลมแล้วสัญญาจบไหม") < body.indexOf("ชนิดสัญญา"));
});

test("เกณฑ์ในตารางตรงกับข้อมูลจริงของไลฟ์ไทม์ โพรเทคชั่น", () => {
  const p = CI_PLANS.find((x) => x.key === "lifetimeprotection");
  const g = RATES.lifetime_protection;
  assert.match(p.wait, new RegExp(String(g.waiting_period_days)));
  assert.match(p.diseases, new RegExp(String(g.ci_count)));
  assert.match(p.entry, new RegExp(`${g.entry_age_range[0]}.*${g.entry_age_range[1]}`));
  assert.match(p.minSum, /150,000/);
  assert.equal(g.capital_min, 150000);
  assert.match(p.endsAfterClaim, /จบทันที/);
  assert.match(p.maxBenefit, /ต้องเคลม \(ข\) ครบ 2 รายการก่อน/);
});

test("เบี้ยที่หน้าเทียบดึงมา ตรงกับฟังก์ชันคำนวณของแต่ละแบบ", () => {
  const pr = premiums(35, "m", 1000000);
  assert.equal(Math.round(pr.lifetimeprotection), 41180);
  assert.ok(pr.cipc > 0 && pr.cipc < pr.lifetimeprotection);
  assert.ok(pr.dcare > 0);
  assert.ok(pr.cancer > 0);
  assert.ok(pr.multipleci > 0);
  assert.ok(pr.careplus > 0);
  // ทุนที่ไม่มีในตารางของแบบนั้น ต้องคืนค่าว่าง ไม่ใช่เดาด้วยการเทียบสัดส่วน
  const pr3m = premiums(35, "m", 3000000);
  assert.equal(pr3m.cancer, null);
  assert.equal(pr3m.multipleci, null);
  assert.ok(pr3m.lifetimeprotection > 0);
});

test("อายุที่แต่ละแบบรับไม่ได้ ต้องคืนค่าว่าง", () => {
  const old = premiums(70, "m", 1000000);
  assert.equal(old.lifetimeprotection, null, "ไลฟ์ไทม์ รับถึง 65 ปี");
  assert.equal(old.cancer, null, "Cancer รับใหม่ถึง 60 ปี");
  const young = premiums(5, "m", 1000000);
  assert.equal(young.cancer, null, "Cancer รับตั้งแต่ 18 ปี");
  assert.equal(young.multipleci, null, "Multiple CI รับตั้งแต่ 7 ปี");
  assert.ok(young.lifetimeprotection > 0);
});

test("จุดตัดเบี้ยสะสมคำนวณจากตารางจริง ไม่ได้พิมพ์ค่าไว้", () => {
  // เบี้ยไลฟ์ไทม์หยุดหลังปีที่ 20 ส่วนสัญญาเพิ่มเติมสะสมต่อไปเรื่อย ๆ
  const r = cumulative(35, "m", 1000000, 84);
  assert.equal(r.perYear, 41180);
  const y20 = r.series.find((s) => s.age === 54);
  assert.equal(Math.round(y20.ltp), 41180 * 20);
  const y30 = r.series.find((s) => s.age === 64);
  assert.equal(Math.round(y30.ltp), 41180 * 20, "หลังปีที่ 20 ต้องไม่เพิ่ม");
  assert.ok(y30.rider > y20.rider, "สัญญาเพิ่มเติมต้องสะสมต่อ");
  assert.equal(r.crossover, 67);
  // เริ่มอายุมากขึ้น จุดตัดต้องเลื่อนออกไป
  assert.ok(cumulative(30, "m", 1000000, 84).crossover < r.crossover);
  assert.ok(cumulative(45, "m", 1000000, 84).crossover > r.crossover);
});

test("อายุที่ทำไลฟ์ไทม์ไม่ได้ ต้องไม่คำนวณจุดตัด", () => {
  const r = cumulative(70, "m", 1000000, 84);
  assert.equal(r.perYear, null);
  assert.equal(r.crossover, null);
});

test("คำแนะนำตามช่วงอายุ อ้างตัวเลขที่ตรงกับที่คำนวณได้จริง", () => {
  const guide = html.slice(html.indexOf("function renderCiAgeGuide("), html.indexOf("function renderCiReduceGuide("));
  assert.match(guide, /ชายอายุ 55 ปีขึ้นไป และหญิงอายุ 63 ปีขึ้นไป/);
  assert.match(guide, /อายุ 1 – 20 ปี/);
  assert.match(guide, /อายุ 66 ปีขึ้นไป/);
  // ยืนยันตัวเลข 55 กับ 63 จากตารางจริงอีกครั้ง
  const cross = (sex) => {
    for (let age = 1; age <= 65; age++) {
      const p = vm.runInContext("lifetimeProtectionPremium", sandbox)(1000000, sex, age, "annual");
      if (p !== null && p * 20 > 1500000) return age;
    }
    return null;
  };
  assert.equal(cross("m"), 55);
  assert.equal(cross("f"), 63);
});

test("คำแนะนำเรื่องลดทุนบอกให้ลดทุนก่อนยกเลิก และอธิบายคำว่าจ่ายทิ้งให้ตรง", () => {
  const guide = html.slice(html.indexOf("function renderCiReduceGuide("), html.indexOf("function renderCiComparePage("));
  // ต้องไม่ฟันธงแทนลูกค้า ให้เสนอเป็นทางเลือกที่ควรขอใบเสนอมาเทียบก่อน
  assert.doesNotMatch(guide, /ลดทุน ดีกว่ายกเลิกเสมอ/);
  assert.match(guide, /ควรขอใบเสนอเปรียบเทียบก่อนตัดสินใจ/);
  assert.match(guide, /ขอใบเสนอทั้งสองทางจากบริษัทมาเทียบกันก่อนตัดสินใจ/);
  assert.match(guide, /ต้องแถลงสุขภาพใหม่/);
  assert.match(guide, /ไม่มีมูลค่าเวนคืน/);
  assert.match(guide, /ไม่มีแบบไหนดีกว่าโดยสมบูรณ์/);
  assert.match(guide, /ให้ลดทุนของแบบที่ครอบคลุมกว้าง แทนการเปลี่ยนไปแบบที่แคบลง/);
});

test("จุดตัดต้องติดป้ายว่าเป็นเบี้ยสะสมดิบ ไม่ใช่ ROI", () => {
  assert.match(html, /เป็นการบวกเบี้ยดิบ ไม่ใช่ผลตอบแทน/);
  assert.match(html, /ไม่ได้คิดมูลค่าเงินตามเวลา ไม่ได้หักมูลค่าเวนคืน ไม่ได้คิดภาษีที่ลดหย่อนได้/);
  assert.match(html, /ไม่ใช่ตัวเลข ROI/);
  assert.match(html, /ไม่ได้ปรับให้ผลประโยชน์ของสองแบบเท่ากัน/);
});

test("Care Plus ถูกระบุว่าเป็นค่ารักษาตามจริง ไม่ใช่เงินก้อน", () => {
  const p = CI_PLANS.find((x) => x.key === "careplus");
  assert.match(p.pay, /ค่ารักษาตามจริง/);
  assert.match(html, /Care Plus จ่ายเป็นค่ารักษาตามจริง ไม่ใช่เงินก้อน จึงเทียบราคาตรง ๆ กับแบบอื่นไม่ได้/);
});

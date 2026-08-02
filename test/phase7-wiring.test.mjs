// เทสต์เฟส 7 — เชื่อมแบบใหม่เข้าเครื่องคำนวณ ทะเบียนแบบประกัน และผู้ช่วยออกแบบสองก้อน
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const RATES = JSON.parse(
  await readFile(new URL("../data/premium-rates.json", import.meta.url), "utf8")
);

function block(marker, open, close) {
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, `ไม่พบ ${marker}`);
  let depth = 0;
  for (let i = html.indexOf(open, start); i < html.length; i++) {
    if (html[i] === open) depth++;
    else if (html[i] === close) {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error(`วงเล็บไม่ครบสำหรับ ${marker}`);
}
const fn = (m) => block(m, "{", "}");
const arr = (n) => block(`const ${n} = [`, "[", "]") + ";";
const obj = (n) => block(`const ${n} = {`, "{", "}") + ";";

const sandbox = { RATES, Math, Number, Array, String, JSON, Object, isNaN, parseFloat, parseInt };
vm.createContext(sandbox);
vm.runInContext(
  [
    "const SAVINGS_MAIN_PLANS = new Set(['15_3','15_6']);",
    "let currentPensionMain = null;",
    fn("function rateAtStart("),
    fn("function rateAt("),
    fn("function isSavingsMainPlan("),
    obj("SPECIAL_MAIN_PLANS"),
    fn("function specialMainPlan("),
    fn("function isSeniorMainPlan("),
    fn("function isPensionMainPlan("),
    fn("function epRateSet("),
    fn("function lifetimeProtectionPremium("),
    fn("const SENIOR_PLANS = "),
    fn("function seniorPremium("),
    fn("const EASY_PROTECTION_PLANS = "),
    fn("const HAPPY_RETURN_PLANS = "),
    fn("const HNW_LEGACY_PLANS = "),
    fn("const SINGLE_PREMIUM_PLANS = "),
    fn("function singlePremiumPlanPremium("),
    fn("function mainPremiumAtEntry("),
    fn("const LIFE_REAL_DISCOUNT = ") ? "" : "",
    "const LIFE_REAL_DISCOUNT = 0.03; const LIFE_RETIRE_AGE = 60;",
    fn("function lifeAnnuityFactor("),
    fn("function lifeNeedAnalysis("),
    arr("LIFE_PRODUCTS"),
    fn("function lifeCapMax("),
    fn("function lifeBucket("),
    fn("function lifeRoundCapital("),
    fn("function lifeCapitalForBudget("),
    // เพดานฝ่ายพิจารณา lifeTwoBucket เรียกใช้ จึงต้องดึงมาด้วย ไม่งั้น ReferenceError
    arr("LIFE_UW_MULTIPLE"),
    "const LIFE_UW_PREMIUM_PCT = 20;",
    fn("function lifeUwBand("),
    fn("function lifeUnderwriting("),
    fn("function lifeTwoBucket("),
    fn("function lifeDefaultDependencyYears("),
    fn("function lifeCoverYears("),
    fn("function lifeBucketPick("),
  ].join("\n"),
  sandbox
);
const call = (name, ...a) => vm.runInContext(name, sandbox)(...a);
const LIFE_PRODUCTS = vm.runInContext("LIFE_PRODUCTS", sandbox);

test("แบบใหม่ทั้งสามอยู่ในตัวเลือกสัญญาหลักของเครื่องคำนวณ", () => {
  for (const v of ["lifetime_protection", "sabaijai_90_90", "sabaijai_99_10"]) {
    assert.match(html, new RegExp(`name="mainPlan" value="${v}"`), `ไม่พบตัวเลือก ${v}`);
    assert.ok(vm.runInContext(`SPECIAL_MAIN_PLANS['${v}']`, sandbox), `ไม่มีกฎของ ${v}`);
  }
});

test("กฎเฉพาะของแต่ละแบบตรงกับข้อมูลจริง", () => {
  const ltp = call("specialMainPlan", "lifetime_protection");
  assert.equal(ltp.entryAgeMin, RATES.lifetime_protection.entry_age_range[0]);
  assert.equal(ltp.entryAgeMax, RATES.lifetime_protection.entry_age_range[1]);
  assert.equal(ltp.capitalMin, RATES.lifetime_protection.capital_min);
  assert.equal(ltp.capitalMaxOf(10), RATES.lifetime_protection.capital_max_this_product["1-15"]);
  assert.equal(ltp.capitalMaxOf(35), RATES.lifetime_protection.capital_max_this_product["16-65"]);
  assert.equal(ltp.ridersLocked, false);

  for (const [key, dataKey] of [["sabaijai_90_90", "sabaijai_90_90"], ["sabaijai_99_10", "sabaijai_99_10"]]) {
    const sp = call("specialMainPlan", key);
    const g = RATES[dataKey];
    assert.equal(sp.entryAgeMin, g.entry_age_range[0]);
    assert.equal(sp.entryAgeMax, g.entry_age_range[1]);
    assert.equal(sp.coverToAge, g.coverage_to_age);
    assert.equal(sp.capitalMaxOf(60), g.capital_max_per_person_all_channels);
    assert.equal(sp.ridersLocked, true, "วัยเก๋าแนบสัญญาเพิ่มเติมชุดปกติไม่ได้");
    assert.deepEqual(sp.freqAllowed.join(","), g.available_frequencies.join(","));
    assert.equal(call("isSeniorMainPlan", key), true);
  }
  assert.equal(call("isSeniorMainPlan", "99_20"), false);
});

test("mainPremiumAtEntry คืนเบี้ยถูกต้องสำหรับแบบใหม่ทุกตัว", () => {
  assert.equal(call("mainPremiumAtEntry", "lifetime_protection", 1000000, "m", 35, "annual"), 41180);
  assert.equal(call("mainPremiumAtEntry", "sabaijai_90_90", 500000, "m", 50, "annual"), 26500);
  assert.equal(call("mainPremiumAtEntry", "sabaijai_99_10", 500000, "m", 50, "annual"), 68380);
  // นอกช่วงอายุต้องคืนค่าว่าง ไม่ใช่ตัวเลขมั่ว
  assert.equal(call("mainPremiumAtEntry", "sabaijai_90_90", 500000, "m", 76, "annual"), null);
  assert.equal(call("mainPremiumAtEntry", "lifetime_protection", 1000000, "m", 66, "annual"), null);
});

test("ตารางในเครื่องคำนวณหยุดตามอายุที่สัญญาคุ้มครองจริง", () => {
  // 90/90 คุ้มครองถึงอายุ 90 ปี ไม่ใช่ 98 เหมือนแบบตลอดชีพอื่น
  assert.match(html, /spEnd && spEnd\.coverToAge \? Math\.min\(98, spEnd\.coverToAge\)/);
  assert.equal(call("specialMainPlan", "sabaijai_90_90").coverToAge, 90);
});

test("ทะเบียนแบบประกันมีแบบใหม่ครบ และแท็กก้อนถูกต้อง", () => {
  const byId = Object.fromEntries(LIFE_PRODUCTS.map((p) => [p.id, p]));
  for (const id of ["lifetime_protection", "sabaijai_90_90", "sabaijai_99_10"]) {
    assert.ok(byId[id], `ไม่มี ${id} ใน LIFE_PRODUCTS`);
    assert.equal(call("lifeBucket", byId[id]), "permanent");
  }
  for (const id of ["easy_protection_15_15", "easy_protection_10_10"]) {
    assert.ok(byId[id], `ไม่มี ${id}`);
    assert.equal(call("lifeBucket", byId[id]), "temporary");
  }
  // แบบเดิมที่ไม่ได้ติดแท็ก ต้องถือเป็นทุนถาวรโดยปริยาย ไม่ใช่ undefined
  assert.equal(call("lifeBucket", byId["99_20"]), "permanent");
  assert.equal(call("lifeBucket", byId["15_3"]), "saving");
  // เบี้ยของทุกแบบต้องดึงจากตารางจริง
  assert.equal(Math.round(byId["lifetime_protection"].premiumOf(1000000, "m", 35, "annual")), 41180);
  assert.ok(byId["easy_protection_15_15"].premiumOf(1000000, "m", 35, "annual") > 0);
});

test("เพดานทุนที่ขึ้นกับอายุถูกใช้จริงตอนปัดทุน", () => {
  const ltp = LIFE_PRODUCTS.find((p) => p.id === "lifetime_protection");
  assert.equal(call("lifeCapMax", ltp, 10), 3000000);
  assert.equal(call("lifeCapMax", ltp, 40), 5000000);
  // ขอทุน 8 ล้าน เด็กต้องถูกตัดที่ 3 ล้าน ผู้ใหญ่ที่ 5 ล้าน
  assert.equal(call("lifeRoundCapital", ltp, 8000000, 10), 3000000);
  assert.equal(call("lifeRoundCapital", ltp, 8000000, 40), 5000000);
  const waigao = LIFE_PRODUCTS.find((p) => p.id === "sabaijai_99_10");
  assert.equal(call("lifeRoundCapital", waigao, 2000000, 60), 600000);
});

test("งบเยอะแค่ไหนก็ต้องไม่เสนอทุนเกินเพดานที่บริษัทรับ", () => {
  const ltp = LIFE_PRODUCTS.find((p) => p.id === "lifetime_protection");
  // งบสูงมาก ระบบต้องหยุดที่เพดานของแบบนั้น ไม่ใช่ไต่ขึ้นไปเรื่อย ๆ
  for (const [age, cap] of [[10, 3000000], [40, 5000000]]) {
    const got = call("lifeCapitalForBudget", ltp, "m", age, 99999999, "annual");
    assert.equal(got, cap, `อายุ ${age} ต้องได้ ${cap}`);
  }
  // งบกลาง ๆ ที่ซื้อได้ต่ำกว่าเพดาน ต้องไม่ถูกดันขึ้นไปถึงเพดาน
  const mid = call("lifeCapitalForBudget", ltp, "m", 40, 200000, "annual");
  assert.ok(mid > 0 && mid < 5000000, `ได้ ${mid}`);
  assert.ok(ltp.premiumOf(mid, "m", 40, "annual") <= 200000);
});

test("โมเดลสองก้อนแยกภาระถูกประเภท และไม่ทำให้ยอดรวมหาย", () => {
  const st = {
    age: 40, gender: "m", incomeAnnual: 1000000, selfSpendPct: 30, dependencyYears: 20,
    debtOther: 500000, mortgage: 3000000, children: 2, eduPerChild: 1000000,
    liquidAssets: 0, existingCover: 0, finalExpenses: 500000, legacyWish: 1000000, freq: "annual",
  };
  const tb = call("lifeTwoBucket", st);
  // ก้อนถาวรมาจากค่าใช้จ่ายสุดท้ายบวกมรดกเท่านั้น
  assert.equal(tb.permanent.gross, 1500000);
  // ก้อนชั่วคราวคือทดแทนรายได้บวกหนี้บวกค่าเล่าเรียน
  const a = tb.analysis;
  assert.equal(tb.temporary.gross, a.incomeNeed + 500000 + 3000000 + 2000000);
  // สองก้อนรวมกันต้องไม่น้อยกว่าช่องว่างเดิม เพราะเพิ่มค่าใช้จ่ายสุดท้ายกับมรดกเข้ามา
  assert.ok(tb.totalNeed >= a.gap);
});

test("สินทรัพย์และทุนเดิมถูกหักจากก้อนชั่วคราวก่อน แล้วจึงล้นไปก้อนถาวร", () => {
  const base = {
    age: 40, gender: "m", incomeAnnual: 0, selfSpendPct: 30, dependencyYears: 1,
    debtOther: 1000000, mortgage: 0, children: 0, eduPerChild: 0,
    finalExpenses: 500000, legacyWish: 0, freq: "annual",
  };
  // สินทรัพย์ 600,000 ไม่ควรแตะก้อนถาวรเลย เพราะก้อนชั่วคราวยังมี 1,000,000
  let tb = call("lifeTwoBucket", Object.assign({}, base, { liquidAssets: 600000, existingCover: 0 }));
  assert.equal(tb.temporary.need, 400000);
  assert.equal(tb.permanent.need, 500000);
  // สินทรัพย์ 1,200,000 ต้องปิดก้อนชั่วคราวหมด แล้วเหลือ 200,000 ไปลดก้อนถาวร
  tb = call("lifeTwoBucket", Object.assign({}, base, { liquidAssets: 1200000, existingCover: 0 }));
  assert.equal(tb.temporary.need, 0);
  assert.equal(tb.permanent.need, 300000);
});

test("งบไม่พอ ต้องไม่ย้ายทุนถาวรไปแบบชั่วระยะเวลาเอง และต้องบอก gap แยกก้อน", () => {
  // ข้อความบนหน้าเว็บต้องระบุกฎนี้ชัดเจน
  assert.match(html, /ไม่ย้ายทุนถาวรไปเป็นแบบชั่วระยะเวลาให้อัตโนมัติ/);
  assert.match(html, /ทั้งสามทางต้องให้ลูกค้ายืนยันเอง/);
  // และตัวเลือกของก้อนถาวรต้องเป็นแบบตลอดชีพเท่านั้น ไม่มีแบบชั่วระยะเวลาปน
  const st = { age: 40, gender: "m", freq: "annual" };
  const perm = call("lifeBucketPick", "permanent", 3000000, st, 20000);
  const ids = perm.map((r) => r.productId);
  assert.ok(ids.length > 0);
  assert.ok(!ids.includes("easy_protection_15_15"));
  assert.ok(!ids.includes("easy_protection_10_10"));
  // เมื่องบไม่พอ ต้องรายงาน shortfall ไม่ใช่แอบลดความต้องการ
  const cut = perm.filter((r) => r.capital != null && r.capital < r.fullCapital);
  assert.ok(cut.length > 0, "ที่งบ 20,000 บาท ต้องมีอย่างน้อยหนึ่งแบบที่ซื้อได้ไม่เต็มทุน");
  for (const r of cut) assert.ok(r.shortfall > 0, `${r.productId} ควรรายงานส่วนที่ขาด`);
});

test("ก้อนชั่วคราวเสนอเฉพาะแบบชั่วระยะเวลา และถูกกว่าก้อนถาวรที่ทุนเท่ากัน", () => {
  const st = { age: 40, gender: "m", freq: "annual" };
  const temp = call("lifeBucketPick", "temporary", 3000000, st, null);
  assert.ok(temp.length > 0);
  for (const r of temp) assert.match(r.productId, /^easy_protection_/);
  const perm = call("lifeBucketPick", "permanent", 3000000, st, null);
  const cheapestTemp = temp[0].fullPremium;
  const cheapestPerm = perm.filter((r) => r.fullPremium != null)[0].fullPremium;
  assert.ok(cheapestTemp < cheapestPerm,
    `แบบชั่วระยะเวลาควรถูกกว่า ได้ ${cheapestTemp} เทียบ ${cheapestPerm}`);
});

test("มีช่องกรอกค่าใช้จ่ายสุดท้ายและมรดก และถูกอ่านเป็นตัวเลข", () => {
  assert.match(html, /finalExpenses/);
  assert.match(html, /legacyWish/);
  assert.match(html, /'finalExpenses','legacyWish'/);
  assert.match(html, /ค่าใช้จ่ายสุดท้าย \(บาท\)/);
  assert.match(html, /เงินที่ตั้งใจส่งต่อเป็นมรดก \(บาท\)/);
  assert.match(html, /\$\{renderTwoBucketSection\(st\)\}/);
});

test("เพดานฝ่ายพิจารณาต้องหดลงตามอายุ และคุมเบี้ยไม่เกิน 20% ของรายได้", () => {
  const income = 1000000;
  const bands = [
    [25, 20], [35, 15], [45, 10], [55, 10], [65, 5],
  ];
  let prev = Infinity;
  for (const [age, mult] of bands) {
    const uw = call("lifeUnderwriting", age, income);
    assert.equal(uw.multiple, mult, `อายุ ${age} ตัวคูณควรเป็น ${mult}`);
    assert.equal(uw.capitalMax, income * mult);
    assert.equal(uw.premiumMax, income * 0.2);
    assert.ok(uw.multiple <= prev, "ตัวคูณต้องไม่เพิ่มขึ้นตามอายุ");
    prev = uw.multiple;
  }
  // ยังไม่กรอกรายได้ ต้องไม่เดาเพดานให้เอง
  assert.equal(call("lifeUnderwriting", 35, 0), null);
});

test("ทุนที่ต้องการเกินเพดาน ต้องรายงานส่วนเกิน ไม่ใช่ตัดทุนเงียบ ๆ", () => {
  const base = {
    gender: "m", age: 35, incomeAnnual: 500000, dependencyYears: 20, selfSpendPct: 30,
    debtOther: 0, mortgage: 5000000, children: 2, eduPerChild: 2000000,
    liquidAssets: 0, existingCover: 0, finalExpenses: 500000, legacyWish: 0,
  };
  const tb = call("lifeTwoBucket", base);
  assert.ok(tb.uw, "ต้องมีข้อมูลเพดานติดมากับผลลัพธ์");
  assert.equal(tb.uw.capitalMax, 500000 * 15);
  assert.ok(tb.totalNeed > tb.uw.capitalMax, "เคสนี้ควรทะลุเพดาน");
  assert.equal(tb.uwOverCapital, tb.totalNeed - tb.uw.capitalMax);
  // ทุนที่คำนวณได้ต้องไม่ถูกหั่นทิ้ง ผู้ใช้ต้องเห็นตัวเลขจริงเพื่อตัดสินใจเอง
  assert.equal(tb.totalNeed, tb.permanent.need + tb.temporary.need);
});

test("อยู่ในเพดาน ต้องไม่รายงานว่าเกิน", () => {
  const tb = call("lifeTwoBucket", {
    gender: "f", age: 30, incomeAnnual: 3000000, dependencyYears: 5, selfSpendPct: 30,
    debtOther: 0, mortgage: 0, children: 0, eduPerChild: 0,
    liquidAssets: 0, existingCover: 0, finalExpenses: 500000, legacyWish: 0,
  });
  assert.equal(tb.uwOverCapital, 0);
});

test("กล่องเพดานต้องขึ้นบนหน้าจริง และบอกทางออกเมื่อเกิน", () => {
  assert.match(html, /function lifeUwPanel\(st, tb\)/);
  // ต้องถูกเสียบเข้าไปในผลลัพธ์จริง ไม่ใช่เขียนฟังก์ชันทิ้งไว้เฉย ๆ
  assert.match(html, /\$\{lifeUwPanel\(st, lifeTwoBucket\(st\)\)\}/);
  // ยังไม่กรอกรายได้ ต้องชวนให้กรอก ไม่ใช่หายไปเฉย ๆ
  assert.match(html, /กรอกรายได้ต่อปีด้านบน/);
  // เกินเพดานต้องเสนอทางออกที่ทำได้จริง 3 ทาง
  assert.match(html, /ทยอยทำเป็นรอบ/);
  assert.match(html, /แสดงรายได้ให้ครบ/);
  assert.match(html, /ลดทุนก้อนชั่วคราวก่อน/);
  // ห้ามบอกให้ลดก้อนถาวรก่อน เพราะเป็นส่วนที่ต้องมีอยู่แน่ในวันที่ใช้จริง
  assert.ok(!/ลดทุนก้อนถาวรก่อน/.test(html));
  // ต้องกำกับว่าเป็นแนวปฏิบัติทั่วไป ไม่ใช่เกณฑ์ทางการของบริษัท
  assert.match(html, /เป็นแนวปฏิบัติทั่วไปของอุตสาหกรรม/);
});

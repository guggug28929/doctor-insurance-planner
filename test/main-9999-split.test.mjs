import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* คุ้มครองตลอดชีพ 99/99 (ทุน 50,000 บาทเท่านั้น) กับ สมาร์ท โพรเทคชั่น 99/99 (ทุน 50,001 ขึ้นไป)
   เป็นคนละแผนและคนละอัตราเบี้ย ห้ามเอาตารางของแผนหนึ่งไปคูณสัดส่วนให้อีกแผน */
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const RATES = JSON.parse(readFileSync(new URL("../data/premium-rates.json", import.meta.url), "utf8"));

function extract(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `ไม่พบ function ${name}`);
  let depth = 0, i = html.indexOf("{", start);
  for (; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}" && --depth === 0) break;
  }
  return html.slice(start, i + 1);
}
const sandbox = { RATES, Math, Number, Array };
vm.createContext(sandbox);
for (const fn of ["isPensionMainPlan", "isSavingsMainPlan", "rateAtStart", "smart9999RiderRuleOk"]) {
  try { vm.runInContext(extract(fn), sandbox); } catch { /* ฟังก์ชันที่ไม่จำเป็นกับการคำนวณ ข้ามได้ */ }
}
vm.runInContext(`
  var currentPensionMain = null;
  var SAVINGS_MAIN_PLANS = new Set(['15_3','15_6','smart_link_15_3','smart_link_15_6']);
  var EASY_PROTECTION_PLANS = {}, SINGLE_PREMIUM_PLANS = {}, SENIOR_PLANS = {}, HAPPY_RETURN_PLANS = {}, HNW_LEGACY_PLANS = {};
  function isPensionMainPlan(){ return false; }
  function isSavingsMainPlan(p){ return SAVINGS_MAIN_PLANS.has(p); }
`, sandbox);
vm.runInContext(extract("rateAtStart"), sandbox);
vm.runInContext(extract("mainPremiumAtEntry"), sandbox);
vm.runInContext(extract("smart9999RiderRuleOk"), sandbox);
const prem = (plan, cap, g, age, freq) => sandbox.mainPremiumAtEntry(plan, cap, g, age, freq);

test("คุ้มครองตลอดชีพ 99/99 คิดเบี้ยได้เฉพาะทุน 50,000 บาท", () => {
  assert.ok(prem("99_99", 50000, "m", 39, "annual") > 0);
  for (const cap of [50001, 100000, 200000, 1000000]) {
    assert.equal(prem("99_99", cap, "m", 39, "annual"), null, `ทุน ${cap} ต้องไม่ได้เบี้ยจากแผน 99/99 ทุน 50,000`);
  }
});

test("สมาร์ท โพรเทคชั่น 99/99 คิดเบี้ยได้เฉพาะทุนมากกว่า 50,000 และใช้อัตราคนละชุด", () => {
  assert.equal(prem("smart_99_99", 50000, "m", 39, "annual"), null);
  assert.equal(prem("smart_99_99", 40000, "m", 39, "annual"), null);
  const tiers = RATES.smart_protection_99_99.tiers;
  const check = (cap, tier) => {
    const rate = tiers[tier].m.annual[39];
    assert.equal(prem("smart_99_99", cap, "m", 39, "annual"), rate * cap / 1000);
  };
  check(100000, "under_500k");
  check(500000, "under_1m");
  check(1000000, "from_1m");
  // คนละชุดกับตารางทุน 50,000: ทุน 50,001 ขึ้นไปห้ามเท่ากับ 50,000 คูณสัดส่วน
  const lifetime50k = prem("99_99", 50000, "m", 39, "annual");
  assert.notEqual(prem("smart_99_99", 100000, "m", 39, "annual"), lifetime50k * 2);
});

test("เกณฑ์สัญญาเพิ่มเติมบังคับของ Smart 99/99 ทุน 50,001-199,999 ตรงกับ SmartWeb", () => {
  const ok = sandbox.smart9999RiderRuleOk;
  assert.equal(ok(20001, 50000), true, "มากกว่า 20,000 ผ่านข้อ 1 ไม่ว่าเบี้ยหลักเท่าไร");
  assert.equal(ok(20000, 50000), false, "เท่ากับ 20,000 ไม่ผ่านข้อ 1 และไม่ถึง 2 เท่าของเบี้ยหลัก");
  assert.equal(ok(6000, 3000), true, "มากกว่า 5,000 และเท่ากับ 2 เท่าของเบี้ยหลักพอดี ผ่านข้อ 2");
  assert.equal(ok(6000, 3001), false, "ต่ำกว่า 2 เท่าของเบี้ยหลัก ไม่ผ่าน");
  assert.equal(ok(5000, 1000), false, "เท่ากับ 5,000 พอดี ไม่ผ่านเพราะต้องมากกว่า 5,000");
  assert.equal(ok(0, 1000), false);
});

test("หน้าเว็บแยกสองแผนเป็นตัวเลือกของตัวเอง และล็อกทุน 99/99 ที่ 50,000", () => {
  assert.match(html, /name="mainPlan" value="99_99">\s*คุ้มครองตลอดชีพ 99\/99 \(ทุน 50,000 บาทเท่านั้น\)/);
  assert.match(html, /name="mainPlan" value="smart_99_99">\s*สมาร์ท โพรเทคชั่น 99\/99 \(ทุน 50,001 บาทขึ้นไป\)/);
  assert.match(html, /capitalInput\.min = 50000;\s*capitalInput\.max = 50000;/);
  assert.match(html, /if\(capital !== 50000\) return null;/);
  assert.match(html, /showPlanDetail\('main9999smart'\)/);
  assert.match(html, /main9999smart: '\/plans\/smart-protection-99-99'/);
});

test("แผนที่บันทึกไว้ก่อนแยกแผน (99/99 ทุนมากกว่า 50,000) ถูกย้ายไป Smart 99/99", () => {
  assert.match(html, /if\(R\.mainPlan === '99_99' && Number\(V\.mainCapital\) > 50000\) R\.mainPlan = 'smart_99_99';/);
});

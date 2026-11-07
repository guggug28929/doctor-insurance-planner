import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* สมาร์ท อินเด็กซ์ 15/6 และ 15/6 โปร (Global) แทนสมาร์ท ลิงค์ 15/6 ที่ปิดการขาย
   อัตราจาก SmartWeb หน้า 256 (ตรวจ 2026-11-07): 15/6 = 967 (30 วัน-70 ปี) / 996 (71-80) ต่อทุน 1,000
   15/6 โปร = 968 ทุกอายุ ไม่มีส่วนลดตามทุน เบี้ยในตาราง = อัตรา x ทุน / 1,000 */
const R = JSON.parse(readFileSync(new URL("../data/premium-rates.json", import.meta.url), "utf8"));
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

function check(key) {
  const g = R[key];
  for (const band of g.bands) {
    const [from, to, ...prem] = band;
    const rb = g.rate_per_1000_bands.find(([f, t]) => f === from && t === to);
    assert.ok(rb, `${key} แบนด์ ${from}-${to} ไม่มีอัตราต่อทุน 1,000`);
    g.capitals.forEach((cap, i) => assert.equal(prem[i], rb[2] * cap / 1000, `${key} อายุ ${from}-${to} ทุน ${cap}`));
  }
}

test("ตารางเบี้ยตรงกับอัตราต่อทุน 1,000 ที่บริษัทประกาศ", () => {
  assert.deepEqual(R.smart_link_15_6.rate_per_1000_bands, [[0, 70, 967], [71, 80, 996]]);
  assert.deepEqual(R.smart_index_15_6_pro.rate_per_1000_bands, [[0, 80, 968]]);
  check("smart_link_15_6");
  check("smart_index_15_6_pro");
});

test("ตัวอย่างทุน 100,000 ตรงกับภาพสรุปของบริษัท", () => {
  const at = (key, age) => { const g = R[key]; const b = g.bands.find(([f, t]) => age >= f && age <= t); return b[g.capitals.indexOf(100000) + 2]; };
  assert.equal(at("smart_link_15_6", 35), 96700);
  assert.equal(at("smart_link_15_6", 75), 99600);
  assert.equal(at("smart_index_15_6_pro", 35), 96800);
  assert.equal(at("smart_index_15_6_pro", 80), 96800);
});

test("ผลประโยชน์สองรุ่นต่างกันตรงเงินคืนและ PR Rate เท่านั้น", () => {
  const s = R.smart_link_15_6, p = R.smart_index_15_6_pro;
  assert.equal(s.coupon_pct, 5); assert.equal(p.coupon_pct, 2.5);
  assert.equal(s.pr_rate_pct, 50); assert.equal(p.pr_rate_pct, 100);
  for (const k of ["maturity_pct", "coupon_years", "death_benefit_pct_by_year", "capital_min", "capital_max_by_age", "pay_years", "coverage_years"]) {
    assert.deepEqual(s[k], p[k], `${k} ต้องเหมือนกันทั้งสองรุ่น`);
  }
  assert.equal(s.maturity_pct, 600);
  assert.equal(s.capital_min, 20000);
});

test("หน้าเว็บไม่เหลือชื่อ สมาร์ท ลิงค์ 15/6 เป็นตัวเลือกขาย และมีรุ่นโปรในเครื่องคำนวณ", () => {
  assert.doesNotMatch(html, /name="mainPlan" value="15_6"> เมืองไทย สมาร์ท ลิงค์ 15\/6/);
  assert.match(html, /name="mainPlan" value="15_6"> เมืองไทย สมาร์ท อินเด็กซ์ 15\/6 \(Global\)/);
  assert.match(html, /name="mainPlan" value="15_6_pro"> เมืองไทย สมาร์ท อินเด็กซ์ 15\/6 โปร \(Global\)/);
  assert.match(html, /if\(plan === '15_6_pro' \|\| plan === 'smart_index_15_6_pro'\) return RATES\.smart_index_15_6_pro;/);
});

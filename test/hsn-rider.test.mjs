import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* แยกค่าใช้จ่าย H&S (N) จาก SmartWeb หน้า 172 (ตรวจ 2026-11-07)
   ผลรวมตัวเลขของแต่ละตารางเบี้ยด้านล่าง คำนวณจากหน้า SmartWeb ตรง ๆ ใช้จับการพิมพ์ผิดทุกช่อง */
const R = JSON.parse(readFileSync(new URL("../data/premium-rates.json", import.meta.url), "utf8"));
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const H = R.hsn;

const SMARTWEB_SUMS = {
  "1_2": { annual: 2016189, semiannual: 1048410, quarterly: 544373, monthly: 181463 },
  "3":   { annual: 2822667, semiannual: 1467789, quarterly: 762121, monthly: 254044 },
};

test("ตารางเบี้ยทุกช่องตรงกับ SmartWeb (ผลรวม 8 ตาราง)", () => {
  for (const [occ, byFreq] of Object.entries(SMARTWEB_SUMS)) {
    for (const [freq, want] of Object.entries(byFreq)) {
      const rows = H.bands[occ][freq];
      assert.equal(rows.length, 12, `${occ} ${freq} ต้องมี 12 ช่วงอายุ`);
      const sum = rows.reduce((t, [, , ...n]) => t + n.reduce((a, b) => a + b, 0), 0);
      assert.equal(sum, want, `${occ} ${freq}`);
    }
  }
});

test("เบี้ยงวดสอดคล้องกับรายปี x 0.52 / 0.27 / 0.09 ทุกช่อง", () => {
  for (const occ of ["1_2", "3"]) {
    const A = H.bands[occ].annual;
    for (const [freq, f] of [["semiannual", 0.52], ["quarterly", 0.27], ["monthly", 0.09]]) {
      H.bands[occ][freq].forEach((row, r) => row.slice(2).forEach((v, i) =>
        assert.ok(Math.abs(Math.round(A[r][i + 2] * f) - v) <= 1, `${occ} ${freq} แถว ${r} ช่อง ${i}`)));
    }
  }
});

test("ตารางรายอายุขยายจากช่วงอายุถูกต้อง และจุดตรวจตรงหน้า SmartWeb", () => {
  const o = H.payment_schedules.occupations;
  const at = (occ, freq, key, age) => o[occ][freq][key][age - H.payment_schedules.age_start];
  assert.equal(at("1_2", "annual", "m_1000", 11), 3261);
  assert.equal(at("1_2", "annual", "m_5000", 35), 9468);
  assert.equal(at("1_2", "annual", "f_3000", 40), 8088);
  assert.equal(at("1_2", "monthly", "f_5000", 80), 12447);
  assert.equal(at("3", "annual", "f_5000", 75), 193620);
  assert.equal(at("3", "quarterly", "m_2000", 62), 5999);
  assert.equal(o["1_2"].annual.m_1000.length, 70, "อายุ 11-80 = 70 ช่อง");
});

test("ผลประโยชน์หลักตรงกับตารางความคุ้มครอง", () => {
  const b = H.benefits;
  assert.deepEqual(b.room_per_day, [1000, 2000, 3000, 5000]);
  assert.deepEqual(b.cat2_max_per_admission, [15000, 20000, 25000, 40000]);
  assert.deepEqual(b.surgeon_fee, [40000, 60000, 80000, 100000]);
  assert.deepEqual(b.doctor_visit_per_day, [600, 800, 900, 1000]);
  assert.equal(H.deductible, 0);
  assert.equal(H.entry_age_min, 11); assert.equal(H.entry_age_max, 74); assert.equal(H.renew_age_max, 80);
});

test("เครื่องคำนวณมีช่อง H&S (N) และบังคับหลักเกณฑ์การแนบ", () => {
  assert.match(html, /<input type="checkbox" id="use_hsn">/);
  assert.match(html, /<select id="hsn_plan">/);
  assert.match(html, /healthList\.push\(\{type:'hsn', plan: document\.getElementById\('hsn_plan'\)\.value\}\)/);
  assert.match(html, /แยกค่าใช้จ่าย H&S \(N\) แนบได้เมื่อแบบประกันหลักมีทุนตั้งแต่ 50,000 บาทขึ้นไป/);
  assert.match(html, /แยกค่าใช้จ่าย H&S \(N\) รับทำใหม่อายุ 11–74 ปี/);
  assert.match(html, /hsn: '\/plans\/hs-n'/);
  assert.match(html, /showPlanDetail\('hsn'\)/);
});

test("ผู้ช่วยจัดแผนมีทางเลือกใช้ H&S ปิดส่วนแรกของ Extra Care Plus และ D Health Lite", () => {
  assert.match(html, /id:'alt-hsn-ecp'/);
  assert.match(html, /health:\[\{kind:'ecp', plan:'p2'\}, \{kind:'hsn', plan:'3000'\}\]/);
  assert.match(html, /id:'alt-hsn-dhl'/);
  assert.match(html, /cheaperThan:\[\{kind:'dhl', sum:'5m', mode:'deduct', deduct:'d0'\}\]/);
  // ห้ามเสนอเป็นแผนใหม่ที่อายุ 75 ขึ้นไป
  assert.match(html, /if\(item\.kind==='hsn'\) return \(age < 11 \|\| age > 74\) \? null/);
});

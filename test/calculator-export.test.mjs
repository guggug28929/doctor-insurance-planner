import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("calculator renders an Excel export action for the calculated table", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /class="btn btn-export-excel"/);
  assert.match(html, /onclick="exportPremiumTableExcel\(\)"/);
  assert.match(html, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  assert.match(html, /\.xlsx/);
  assert.match(html, /tableWrap\.innerHTML = `[^`]*<table>/s);
});

test("calculator exposes occupation and payment-frequency controls", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /id="occupationClass"/);
  assert.match(html, /ขั้นอาชีพ 4/);
  assert.match(html, /id="paymentFrequency"/);
  assert.match(html, /value="semiannual"/);
  assert.match(html, /value="quarterly"/);
  assert.match(html, /value="monthly"/);
  assert.match(html, /เบี้ยชำระต่องวด/);
  assert.match(html, /เบี้ยรวมทั้งปี/);
});

test("15/3 and 15/6 are annual-only savings plans with no rider controls", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /name="mainPlan" value="15_3"/);
  assert.match(html, /name="mainPlan" value="15_6"/);
  assert.match(html, /id="ridersPanel"/);
  assert.match(html, /แผน 15\/3 และ 15\/6 แนบสัญญาเพิ่มเติมไม่ได้/);
  // แบบออมยังต้องล็อกงวดชำระเป็นรายปีเหมือนเดิม แต่แบบวัยเก๋าที่ล็อกสัญญาเพิ่มเติม
  // เปิดรายเดือนได้ตามที่บริษัทกำหนด จึงแยกตัวแปรล็อกงวดออกจากล็อกสัญญาเพิ่มเติม
  assert.match(html, /const freqLocked = locked && !isSeniorMainPlan\(plan\)/);
  assert.match(html, /frequency\.disabled = freqLocked/);
  assert.match(html, /if\(freqLocked\) frequency\.value = 'annual'/);
  assert.match(html, /if\(isSavingsMainPlan\(inp\.mainPlan\)\)/);
});

test("PA Easy Plan stops showing a premium after age 85", async () => {
  const api = await readFile(new URL("../api/premium-quote.js", import.meta.url), "utf8");
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(api, /numericAge > 85\) return null/);
  assert.match(html, /Number\(age\) > 85\) return null/);
});

test("stores published SmartWeb instalment tables without deriving them from annual premiums", async () => {
  const rates = JSON.parse(
    await readFile(new URL("../data/premium-rates.json", import.meta.url), "utf8")
  );

  const main = rates.main_99_20.payment_schedules;
  for (const sex of ["m", "f"]) {
    for (const period of ["annual", "semiannual", "quarterly", "monthly"]) {
      assert.equal(main[sex][period].length, 71);
    }
  }
  assert.equal(main.m.monthly[35], 2.286);
  assert.equal(main.f.quarterly[35], 5.76);

  const dcare = rates.dcare.payment_schedules;
  for (const stage of ["severe", "early_and_severe"]) {
    for (const category of ["cancer", "cardio", "organ", "neuro", "other", "popular"]) {
      for (const sex of ["m", "f"]) {
        for (const period of ["annual", "semiannual", "quarterly", "monthly"]) {
          assert.equal(dcare.stages[stage].categories[category][sex][period].length, 81);
        }
      }
    }
  }
  assert.equal(dcare.stages.early_and_severe.categories.cancer.m.monthly[35], 0.225);

  const dhl = rates.dhl_payment_schedules;
  for (const occupation of ["1_2", "3"]) {
    for (const period of ["annual", "semiannual", "quarterly", "monthly"]) {
      for (const coverage of ["1m", "5m"]) {
        assert.equal(dhl.occupations[occupation][period][coverage].no_deduct.m.length, 99);
      }
    }
  }
  assert.equal(dhl.occupations["1_2"].monthly["5m"].no_deduct.m[35], 1504);
  assert.equal(dhl.occupations["3"].quarterly["1m"].deduct_20k.f[35], 4747);

  const wellbeing = rates.well_being_plus.payment_schedules;
  assert.equal(wellbeing.rates.monthly.p1[0], 881);
  assert.equal(wellbeing.rates.monthly.p2[8], 1896);

  const maternity = rates.maternity_plus.payment_schedules;
  assert.equal(maternity.occupations["1_2"].rates.quarterly.p2[0], 23836);
  assert.equal(maternity.occupations["3"].rates.monthly.p1[5], 6881);

  // OPD lump-sum is the sole product with an expressly-approved instalment formula.
  const opdLump = rates["opd_เหมา"].payment_schedules;
  assert.equal(opdLump.formula.monthly, "annual × 0.087");
  assert.equal(opdLump.monthly.m_30000[25], 1445);

  const hb = rates.hb.payment_schedules;
  assert.equal(hb.annual[16], 1600);
  assert.equal(hb.semiannual[36], 936);
  assert.equal(hb.monthly[46], 189);
  assert.equal(hb.annual[15], null);
  assert.equal(hb.annual[64], 2100);
});

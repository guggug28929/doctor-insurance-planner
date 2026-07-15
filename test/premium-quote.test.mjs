import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import premiumQuoteHandler from "../api/premium-quote.js";

const indexHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");

function createResponse(resolve) {
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      resolve({ statusCode: this.statusCode, body });
      return this;
    },
    setHeader() {},
  };
}

function quote(profile) {
  return new Promise((resolve) => {
    const req = {
      method: "POST",
      headers: {
        host: "doctor-insurance.test",
        "x-forwarded-proto": "https",
      },
      body: { profile },
    };

    premiumQuoteHandler(req, createResponse(resolve));
  });
}

test("เลือก Elite 20 + 99/99 + PA เมื่อ OPD เป็น optional และงบ 40,000", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(indexHtml, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const result = await quote({
      age: 40,
      gender: "m",
      occupation: "แพทย์",
      annualBudget: 40000,
      roomBudget: 10000,
      healthStatus: "none",
      hasGroupBenefit: false,
      opdPreference: "optional",
      requestedHealthPlan: "auto",
      quoteScope: "package",
      focus: ["ipd", "opd", "critical_illness", "accident"],
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.planCode, "elite_20m");
  assert.match(result.body.text, /Elite Health Plus.*20/);
  assert.match(result.body.text, /99\/99/);
  assert.match(result.body.text, /PA/);
  assert.equal(result.body.totalPremium, 43325);

  const mainItem = result.body.items.find((item) => item.key === "main");
  const paItem = result.body.items.find((item) => item.key === "pa");
  assert.match(mainItem.product, /99\/99/);
  assert.ok(paItem, "99/99 ต้องมี PA แนบเสมอ");
});

test("คำขอ D Health Lite โดยตรงชนะกฎค่าห้องที่เคยเลือก Elite", async () => {
  const result = await quote({
    age: 40,
    gender: "m",
    occupation: "แพทย์",
    annualBudget: 40000,
    roomBudget: 10000,
    healthStatus: "none",
    hasGroupBenefit: false,
    opdPreference: "optional",
    requestedHealthPlan: "dhl",
    quoteScope: "package",
    focus: ["ipd", "critical_illness", "accident"],
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.ok, true);
  assert.match(result.body.planCode, /^dhl_5m_/);
  assert.match(result.body.text, /D Health Lite/);
  assert.doesNotMatch(result.body.text, /Elite Health Plus/);
});

test("ใช้ค่า D Health Lite ที่แก้ตาม muangthai-agent", async () => {
  const result = await quote({
    age: 48,
    gender: "m",
    occupation: "วิศวกร",
    annualBudget: 50000,
    roomBudget: 4000,
    requestedHealthPlan: "dhl",
    quoteScope: "health_only",
  });
  assert.equal(result.body.ok, true);
  assert.equal(result.body.totalPremium, 23053);
});

test("เปรียบเทียบ CI Perfect Care, Multiple CI, D Care และมะเร็งแบบเงินก้อน", async () => {
  const result = await quote({
    age: 40,
    gender: "m",
    occupation: "แพทย์",
    annualBudget: 50000,
    requestedProduct: "critical_comparison",
    criticalIllnessNeed: "lump_sum",
    criticalIllnessSumInsured: 1000000,
  });
  assert.equal(result.body.ok, true);
  assert.equal(result.body.planType, "critical_comparison");
  assert.equal(result.body.alternatives.length, 4);
  assert.equal(result.body.alternatives.find((item) => item.product === "CI Perfect Care").premium, 7180);
  assert.match(result.body.text, /CI Perfect Care/);
  assert.match(result.body.text, /Multiple CI/);
  assert.match(result.body.text, /D Care/);
  assert.match(result.body.text, /ความคุ้มครองโรคมะเร็ง/);
});

test("Maternity Plus แนบกับ D Health Lite และรวมเบี้ยจากตาราง", async () => {
  const result = await quote({
    age: 30,
    gender: "f",
    occupation: "พนักงานบริษัท",
    annualBudget: 150000,
    roomBudget: 4000,
    requestedHealthPlan: "dhl",
    quoteScope: "health_only",
    wantsMaternity: true,
  });
  assert.equal(result.body.ok, true);
  assert.ok(result.body.items.some((item) => item.key === "maternity"));
  assert.match(result.body.text, /60,681/);
});

test("Well-Being Plus แนบกับ Elite และแสดงเบี้ยจริง", async () => {
  const result = await quote({
    age: 40,
    gender: "f",
    occupation: "แพทย์",
    annualBudget: 100000,
    roomBudget: 15000,
    requestedHealthPlan: "elite20",
    quoteScope: "health_only",
    wantsWellBeing: true,
  });
  assert.equal(result.body.ok, true);
  assert.ok(result.body.items.some((item) => item.key === "wellbeing"));
  assert.match(result.body.text, /14,856/);
});

test("Flexi 99/20 เลือกทุนสูงสุดที่อยู่ในงบ", async () => {
  const result = await quote({
    age: 35,
    gender: "m",
    annualBudget: 36000,
    requestedProduct: "flexi_99_20",
  });
  assert.equal(result.body.ok, true);
  assert.equal(result.body.planType, "flexi");
  assert.equal(result.body.items[0].capital, 1000000);
  assert.equal(result.body.totalPremium, 35500);
});

test("Smart Link 15/3 และ 15/6 แนะนำทุนตามงบ", async () => {
  const result = await quote({
    age: 35,
    annualBudget: 100000,
    requestedProduct: "smart_link_auto",
  });
  assert.equal(result.body.ok, true);
  assert.equal(result.body.planType, "savings");
  assert.equal(result.body.alternatives.length, 2);
  assert.deepEqual(
    result.body.alternatives.map((option) => [option.capital, option.premium]),
    [[20000, 18900], [100000, 94500]]
  );
});

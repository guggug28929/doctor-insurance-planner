import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultProfile,
  inferContextualUpdates,
  missingFields,
} from "../api/line-agent.js";
import {
  brochureKeysForQuote,
  brochureLinks,
  isBrochureAcceptance,
} from "../lib/brochures.js";

test("สนใจโรคร้ายแรงต้องถามก่อนว่าเน้นค่ารักษาหรือเงินก้อน", () => {
  const current = defaultProfile();
  const updates = inferContextualUpdates("สนใจประกันโรคร้ายแรงครับ", current);
  const profile = { ...current, ...updates };
  assert.ok(profile.focus.includes("critical_illness"));
  assert.equal(profile.criticalIllnessNeed, "unknown");
  assert.deepEqual(missingFields(profile), ["criticalIllnessNeed"]);
});

test("เข้าใจคำตอบภาษาพูดว่าเอาทั้งค่ารักษาและเงินก้อน", () => {
  const current = {
    ...defaultProfile(),
    focus: ["critical_illness"],
    criticalIllnessNeed: "unknown",
  };
  const updates = inferContextualUpdates("เอาทั้งสองอย่างเลยครับ", current);
  assert.equal(updates.criticalIllnessNeed, "both");
  assert.equal(updates.requestedProduct, "auto");
});

test("ข้อความกังวลหลังเกษียณเลือก Flexi 99/20", () => {
  const updates = inferContextualUpdates(
    "ตอนนี้มีสวัสดิการรัฐวิสาหกิจ แต่กลัวหลังเกษียณจ่ายเบี้ยไม่ไหวและกังวลค่ารักษา",
    defaultProfile()
  );
  assert.equal(updates.requestedProduct, "flexi_99_20");
});

test("ตรวจสุขภาพและวัคซีนเลือก Well-Being Plus เป็นสัญญาแนบ", () => {
  const updates = inferContextualUpdates(
    "อยากได้ตรวจสุขภาพ วัคซีน ทำฟัน และค่าสายตาด้วย",
    defaultProfile()
  );
  assert.equal(updates.wantsWellBeing, true);
  assert.equal(updates.requestedProduct, "auto");
});

test("ออมลดหย่อนภาษีไม่เน้นทุนชีวิตเลือก Smart Link", () => {
  const updates = inferContextualUpdates(
    "อยากออมทรัพย์ลดหย่อนภาษี ไม่เน้นทุนชีวิต ขอเทียบ 15/3",
    defaultProfile()
  );
  assert.equal(updates.requestedProduct, "smart_link_15_3");
});

test("มีประกันส่วนตัวต้องจำไว้และถามวงเงินเดิมเพียงครั้งเดียว", () => {
  const current = {
    ...defaultProfile(),
    age: 35,
    gender: "f",
    occupation: "พนักงานบริษัท",
    annualBudget: 40000,
    roomBudget: 4000,
    healthStatus: "none",
  };
  const updates = inferContextualUpdates("มีประกันส่วนตัว แต่ทำงานแล้ววงเงินไม่เยอะค่ะ", current);
  const profile = { ...current, ...updates };
  assert.equal(profile.hasGroupBenefit, true);
  assert.deepEqual(missingFields(profile), ["groupBenefit"]);

  const declined = inferContextualUpdates("จำวงเงินไม่ได้ค่ะ", { ...profile, groupBenefitAsked: true });
  const afterDeclined = { ...profile, groupBenefitAsked: true, ...declined };
  assert.equal(afterDeclined.deductiblePreference, "none");
  assert.deepEqual(missingFields(afterDeclined), []);
});

test("คำตอบว่าไม่มีโรคประจำตัวต้องล้างสถานะประวัติสุขภาพเดิม", () => {
  const updates = inferContextualUpdates("ไม่มีโรคประจำตัวค่ะ", {
    ...defaultProfile(),
    healthStatus: "has_history",
  });
  assert.equal(updates.healthStatus, "none");
});

test("บ่นว่าทุน 99/20 ต่ำสุดสูงเกินไป เปลี่ยนเป็น 99/99 หนึ่งแสน", () => {
  const updates = inferContextualUpdates(
    "ทุนสัญญาหลัก 99/20 สองแสนสูงไป ลดลงได้ไหม",
    defaultProfile()
  );
  assert.equal(updates.mainPlanPreference, "99_99_100k");
});

test("ส่งโบรชัวร์เฉพาะแผนที่อยู่ในใบเสนอ", () => {
  const keys = brochureKeysForQuote({
    items: [
      { product: "D Health Lite" },
      { product: "Care Plus" },
      { product: "PA Easy Plan 1" },
    ],
  });
  assert.deepEqual(keys, ["d_health_lite", "care_plus", "pa_easy"]);
  assert.deepEqual(
    brochureLinks(keys).map((item) => item.file),
    ["d-health-lite.pdf", "care-plus.pdf", "pa-easy.pdf"]
  );
});

test("ตอบรับโบรชัวร์ตามรูปแบบภาษาพูดที่กำหนด", () => {
  for (const message of ["ใช่ครับ", "ใช่ค่ะ", "โอเคครับ", "ได้ค่ะ", "ครับ", "ค่ะ"]) {
    assert.equal(isBrochureAcceptance(message), true, message);
  }
  assert.equal(isBrochureAcceptance("ยังไม่เอาครับ"), false);
});

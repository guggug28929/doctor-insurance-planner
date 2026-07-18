import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultProfile,
  inferContextualUpdates,
  mergeProfile,
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

test("เก็บหลายคำตอบจากบอลลูนเดียวโดยไม่ถามอายุ เพศ อาชีพ งบ ค่าห้อง และสุขภาพซ้ำ", () => {
  const current = defaultProfile();
  const message = [
    "ญ 30 ปี ไม่มีโรคประจำตัว",
    "อาชีพแพทย์",
    "งบ30,000/ปี ค่าห้อง4,000",
    "สนใจประกันสุขภาพค่ะ",
  ].join("\n");
  const contextual = inferContextualUpdates(message, current);
  const profile = mergeProfile(
    current,
    { updates: {}, clearFields: [] },
    message,
    contextual
  );

  assert.equal(profile.age, 30);
  assert.equal(profile.gender, "f");
  assert.equal(profile.occupation, "แพทย์");
  assert.equal(profile.annualBudget, 30000);
  assert.equal(profile.roomBudget, 4000);
  assert.equal(profile.healthStatus, "none");
  assert.ok(profile.focus.includes("ipd"));
  assert.deepEqual(missingFields(profile), ["hasGroupBenefit"]);
});

test("เข้าใจคำใกล้เคียงและตัวเลขภาษาไทยหลายช่องในบอลลูนเดียว", () => {
  const updates = inferContextualUpdates(
    "ผู้หญิงวัยสามสิบ สุขภาพปกติ ทำงานเป็นหมอ งบปีละสามหมื่น ค่าห้องสี่พัน สนใจค่ารักษา",
    defaultProfile()
  );

  assert.equal(updates.age, 30);
  assert.equal(updates.gender, "f");
  assert.equal(updates.occupation, "แพทย์");
  assert.equal(updates.annualBudget, 30000);
  assert.equal(updates.roomBudget, 4000);
  assert.equal(updates.healthStatus, "none");
  assert.ok(updates.focus.includes("ipd"));
});

test("คำตอบสั้นว่าไม่มีหลังตอบสุขภาพแล้วหมายถึงไม่มีสวัสดิการเดิม", () => {
  const current = {
    ...defaultProfile(),
    age: 30,
    gender: "f",
    occupation: "แพทย์",
    annualBudget: 30000,
    roomBudget: 4000,
    healthStatus: "none",
    hasGroupBenefit: null,
  };
  const updates = inferContextualUpdates("ไม่มีค่ะ", current);
  const profile = { ...current, ...updates };

  assert.equal(updates.hasGroupBenefit, false);
  assert.equal(profile.healthStatus, "none");
  assert.deepEqual(missingFields(profile), []);
});

test("คำลงท้ายค่ะของผู้เอาประกันเองอนุมานเป็นเพศหญิงและไม่ถามซ้ำ", () => {
  const current = defaultProfile();
  const updates = inferContextualUpdates("สนใจประกันสุขภาพค่ะ", current);
  const profile = mergeProfile(current, { updates: {}, clearFields: [] }, "สนใจประกันสุขภาพค่ะ", updates);

  assert.equal(profile.gender, "f");
  assert.equal(profile.insuredGenderContext, "self");
  assert.equal(missingFields(profile)[0], "age");
});

test("พ่อ ลุง สามี และผัวเป็นผู้เอาประกันเพศชาย", () => {
  for (const relation of ["พ่อ", "ลุง", "สามี", "ผัว"]) {
    const updates = inferContextualUpdates(`สนใจประกันสุขภาพให้${relation}ค่ะ`, defaultProfile());
    assert.equal(updates.gender, "m", relation);
    assert.equal(updates.insuredGenderContext, "male_known", relation);
  }
  assert.equal(inferContextualUpdates("สนใจประกันสุขภาพสามีของดิชั้น อายุ 30 ปี", defaultProfile()).gender, "m");
});

test("แม่ ป้า ภรรยา และเมียเป็นผู้เอาประกันเพศหญิง", () => {
  for (const relation of ["แม่", "ป้า", "ภรรยา", "เมีย"]) {
    const updates = inferContextualUpdates(`สนใจประกันสุขภาพให้${relation}ครับ`, defaultProfile());
    assert.equal(updates.gender, "f", relation);
    assert.equal(updates.insuredGenderContext, "female_known", relation);
  }
  assert.equal(inferContextualUpdates("สนใจประกันสุขภาพภรรยาของหนู อายุ 30 ปี", defaultProfile()).gender, "f");
});

test("แฟน น้า และอาไม่เดาเพศจากคำลงท้ายของผู้ส่ง", () => {
  for (const relation of ["แฟน", "น้า", "อา"]) {
    const current = defaultProfile();
    const first = inferContextualUpdates(`สนใจประกันสุขภาพให้${relation}ค่ะ`, current);
    const profile = mergeProfile(current, { updates: {}, clearFields: [] }, `สนใจประกันสุขภาพให้${relation}ค่ะ`, first);
    const later = inferContextualUpdates("อายุ 30 ปีค่ะ", profile);
    const afterLater = mergeProfile(profile, { updates: {}, clearFields: [] }, "อายุ 30 ปีค่ะ", later);
    assert.equal(afterLater.gender, null, relation);
    assert.equal(afterLater.insuredGenderContext, "other_unknown", relation);
    assert.ok(missingFields(afterLater).includes("gender"), relation);
  }
});

test("AI clearFields ไม่ล้างเพศที่ยืนยันแล้วจากข้อความถัดไป", () => {
  const current = { ...defaultProfile(), gender: "f", insuredGenderContext: "self" };
  const profile = mergeProfile(
    current,
    { updates: { occupation: "แพทย์" }, clearFields: ["gender"] },
    "อาชีพแพทย์ค่ะ",
    { occupation: "แพทย์" }
  );

  assert.equal(profile.gender, "f");
  assert.equal(profile.occupation, "แพทย์");
});

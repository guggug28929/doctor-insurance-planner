import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultProfile,
  inferContextualUpdates,
  missingFields,
} from "../api/line-agent.js";

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

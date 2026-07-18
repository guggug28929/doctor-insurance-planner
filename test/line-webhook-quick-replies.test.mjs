import assert from "node:assert/strict";
import test from "node:test";

import {
  quickRepliesForBrochureDetails,
  quickRepliesForMissingField,
  quickRepliesForResult,
} from "../api/line-webhook.js";

function actionTexts(items) {
  return items.map((item) => item.action.text);
}

test("คำถามเพศมีปุ่มชายและหญิงเท่านั้น", () => {
  assert.deepEqual(actionTexts(quickRepliesForMissingField("gender")), ["เพศชาย", "เพศหญิง"]);
});

test("คำถามแบบเลือกตอบมีปุ่มตามบริบท", () => {
  assert.deepEqual(actionTexts(quickRepliesForMissingField("healthStatus")), [
    "ไม่มีโรคประจำตัว",
    "มีโรคประจำตัว",
  ]);
  assert.deepEqual(actionTexts(quickRepliesForMissingField("criticalIllnessNeed")), [
    "เน้นค่ารักษาพยาบาล",
    "เน้นเงินก้อนเจอจ่ายจบ",
    "ทั้งสองอย่าง",
  ]);
});

test("หลังเสนอแผนมีรายละเอียดและดูแผนอื่น แต่ยังไม่มีเจ้าหน้าที่", () => {
  assert.deepEqual(
    actionTexts(quickRepliesForResult({
      action: "quote",
      profile: { pendingBrochureKeys: ["d_health_lite"] },
    })),
    ["ขอรายละเอียด", "ดูแผนอื่น", "เริ่มใหม่"]
  );
});

test("ปุ่มเจ้าหน้าที่จะแสดงหลังลูกค้าขอรายละเอียดแล้ว", () => {
  assert.deepEqual(actionTexts(quickRepliesForBrochureDetails()), [
    "คุยกับเจ้าหน้าที่",
    "ดูแผนอื่น",
    "เริ่มใหม่",
  ]);
});

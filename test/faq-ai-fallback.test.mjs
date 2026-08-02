import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("กล่องถาม AI ต้องดึงเนื้อหาจากข้อมูลต้นทาง ไม่ใช่จาก DOM ที่อาจถูกย้าย", () => {
  // เคยพลาด: ย้ายหน้าแล้ว faqGetResourceList ยังไปดึงจาก #faqList ที่ถูกลบ
  // ผลคือ AI ได้ resource เปล่า แล้วตอบโดยไม่มีข้อมูลของเราเลย
  assert.match(html, /function faqGetResourceList\(\)\{[\s\S]{0,200}FAQ_ITEMS\.map/);
  assert.ok(!html.includes("#faqList"), "ยังมีการอ้าง #faqList ซึ่งไม่มีอยู่ใน HTML แล้ว");
});

test("ถ้า AI backend ล่ม ต้องยังตอบลูกค้าได้จากเนื้อหาในเว็บ", () => {
  assert.match(html, /function faqLocalAnswer\(q\)/);
  assert.match(html, /const local = faqLocalAnswer\(q\);/);
  // ต้องใช้ตัวค้นหาที่มีอยู่แล้ว ไม่ปล่อยให้เป็นโค้ดตาย
  for (const fn of ["faqExpandQueryTerms", "faqScoreResource", "faqPickSnippet", "faqHighlight"]) {
    const calls = (html.match(new RegExp("\\b" + fn + "\\b", "g")) || []).length;
    assert.ok(calls >= 2, `${fn} ยังเป็นโค้ดตาย ไม่มีใครเรียก`);
  }
});

test("ห้ามโชว์รายละเอียดเทคนิคให้ลูกค้าเห็นตอน backend ล่ม", () => {
  const leaks = ["ANTHROPIC_API_KEY</code>", "api/insurance-chat.js", "extractTextFromClaude", "console.anthropic.com"];
  for (const t of leaks) {
    assert.ok(!html.includes(t), `ข้อความเทคนิคหลุดถึงลูกค้า: ${t}`);
  }
  assert.match(html, /ตอนนี้ผู้ช่วย AI ยังใช้งานไม่ได้ชั่วคราว/);
});

test("ไม่มีฟังก์ชันตายที่อ้าง DOM ซึ่งถูกลบไปแล้ว", () => {
  for (const fn of ["faqToggleAll", "focusKnowledgeFaqFromHash"]) {
    assert.ok(!html.includes(fn), `${fn} ยังค้างอยู่ทั้งที่ DOM ที่มันใช้ถูกลบแล้ว`);
  }
});

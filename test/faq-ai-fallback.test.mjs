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

test("ปิดกล่องถาม AI ไว้ เพราะ backend ยังไม่พร้อม", () => {
  // ระบบที่บอกว่าเป็น AI จริงแต่ตอบไม่ได้ เสียความน่าเชื่อถือมากกว่าไม่มี
  assert.match(html, /const FAQ_AI_ENABLED = false;/);
  // ตรวจเฉพาะส่วน HTML ของหน้า ไม่ใช่ CSS/JS ที่เก็บไว้เผื่อเปิดกลับ
  const faqPage = html.slice(html.indexOf('id="page-faq"'), html.indexOf('id="page-knowledge"'));
  assert.ok(!faqPage.includes('class="faq-ai"'), "ยังมีกล่องถาม AI แสดงอยู่บนหน้า");
  assert.ok(!faqPage.includes('id="faqChatInput"'), "ยังมีช่องพิมพ์ถาม AI อยู่บนหน้า");
  // ต้องเขียนวิธีเปิดกลับไว้ให้ชัด จะได้ไม่กลายเป็นโค้ดที่ไม่มีใครกล้าแตะ
  assert.match(html, /วิธีเปิดกลับ: ตั้งค่า ANTHROPIC_API_KEY บน Vercel/);
});

test("หน้า FAQ ต้องมีช่องทางทักหาหมอกึ๊กโดยตรง", () => {
  assert.match(html, /href="https:\/\/line\.me\/R\/ti\/p\/@doctorguginsurance"/);
  assert.match(html, /href="tel:0852312027"/);
  assert.match(html, /ยังไม่เจอคำตอบที่ต้องการ/);
});

test("ห้ามโชว์รายละเอียดเทคนิคให้ลูกค้าเห็น", () => {
  const leaks = ["ANTHROPIC_API_KEY</code>", "api/insurance-chat.js", "extractTextFromClaude", "console.anthropic.com"];
  for (const t of leaks) {
    assert.ok(!html.includes(t), `ข้อความเทคนิคหลุดถึงลูกค้า: ${t}`);
  }
});

test("ไม่มีฟังก์ชันตายที่อ้าง DOM ซึ่งถูกลบไปแล้ว", () => {
  for (const fn of ["faqToggleAll", "focusKnowledgeFaqFromHash"]) {
    assert.ok(!html.includes(fn), `${fn} ยังค้างอยู่ทั้งที่ DOM ที่มันใช้ถูกลบแล้ว`);
  }
});

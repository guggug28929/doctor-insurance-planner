import { test } from "node:test";
import assert from "node:assert";
import { readFileSync, writeFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

// ประกอบโมดูลจาก index.html เพื่อทดสอบการค้นหาจริง ไม่ใช่แค่ดูว่ามีโค้ดอยู่
const a = html.indexOf("const FAQ_ITEMS = [");
const b = html.indexOf("\n];\n", a) + 4;
const c = html.indexOf("let FAQ_HAY = null;");
const d = html.indexOf("function renderFaq()");
const mod = "/tmp/faq-search-mod.mjs";
writeFileSync(mod, html.slice(a, b) + "\n" + html.slice(c, d) +
  "\nexport {FAQ_ITEMS, faqSegment, faqScore, faqSnippet};\n");
const m = await import(mod + "?t=" + Date.now());

const rank = (q) => {
  const t = m.faqSegment(q);
  return m.FAQ_ITEMS.map((it) => ({ q: it.q, sc: m.faqScore(it, t) }))
    .filter((x) => x.sc > 0).sort((x, y) => y.sc - x.sc);
};

test("ตัดคำไทยที่พิมพ์ติดกันได้ ไม่ใช่หาเจอเฉพาะตอนเว้นวรรค", () => {
  // เคยพลาด: "ปกปิดประวัติ" หาไม่เจอเลยทั้งที่เนื้อหามีทั้งสองคำ
  assert.deepEqual(m.faqSegment("ปกปิดประวัติ"), ["ปกปิด", "ประวัติ"]);
  assert.ok(rank("ปกปิดประวัติ").length > 0, "ปกปิดประวัติ ต้องหาเจอ");
  assert.ok(rank("ปกปิดประวัติสุขภาพมีผลยังไง").length > 0, "พิมพ์ยาวก็ต้องหาเจอ");
});

test("คำค้นที่เจาะจง ต้องได้คำตอบที่ถูกต้องเป็นอันดับหนึ่ง", () => {
  const cases = [
    ["ขอเวชระเบียน", "ขอเวชระเบียนจากโรงพยาบาลยังไง"],
    ["แฟกซ์เคลม", "แฟกซ์เคลม คืออะไร ทำไมบางครั้งยังต้องสำรองจ่าย"],
    ["เบี้ยขึ้นทุกปี", "ทำไมเบี้ยประกันสุขภาพถึงขึ้นทุกปี"],
    ["ระยะรอคอย", "ทำประกันแล้วป่วยเลย เคลมได้ไหม"],
    ["ตรวจสุขภาพก่อนทำประกัน", "ควรตรวจสุขภาพก่อนทำประกันไหม"],
    ["ปกปิดประวัติสุขภาพ", "แถลงสุขภาพคืออะไร ทำไมสำคัญกว่าที่คิดมาก"],
    ["จ่ายรายเดือนดีไหม", "จ่ายรายปี หรือรายเดือนดี รูดบัตรผ่อนได้ไหม"],
  ];
  for (const [q, want] of cases) {
    const top = rank(q)[0];
    assert.ok(top, `"${q}" ไม่เจออะไรเลย`);
    assert.equal(top.q, want, `"${q}" ได้อันดับหนึ่งเป็น "${top.q}"`);
  }
});

test("คำถามทั่วไปอย่าง อะไร ไหม ต้องไม่ทำให้ผลลัพธ์เพี้ยน", () => {
  const withStop = rank("ระยะรอคอยคืออะไร")[0];
  const plain = rank("ระยะรอคอย")[0];
  assert.equal(withStop.q, plain.q, "เติมคำว่า คืออะไร แล้วอันดับหนึ่งต้องไม่เปลี่ยน");
});

test("ต้องโชว์ตัวอย่างบรรทัดที่ตรง พร้อมไฮไลท์คำที่ค้น", () => {
  const t = m.faqSegment("แฟกซ์เคลม");
  const item = m.FAQ_ITEMS.find((it) => m.faqScore(it, t) > 0);
  const snip = m.faqSnippet(item, t);
  assert.ok(snip.includes("<mark>"), "ไม่มีไฮไลท์ในตัวอย่างบรรทัด");
  assert.ok(snip.length > 40 && snip.length < 400, "ตัวอย่างบรรทัดสั้นหรือยาวเกินไป");
  // ห้ามมีแท็ก HTML จากเนื้อหาหลุดมาทำให้หน้าพัง
  assert.ok(!/<b>|<\/b>/.test(snip), "แท็กจากเนื้อหาหลุดเข้ามาในตัวอย่าง");
});

test("คำที่ไม่มีจริง ต้องไม่คืนผลลัพธ์มั่ว", () => {
  assert.equal(rank("zxqwvbnmkjh").length, 0, "คำมั่วต้องไม่คืนผลลัพธ์");
  assert.equal(m.faqSegment("zxqwvbnmkjh").length, 0, "คำมั่วต้องตัดคำไม่ได้เลย");
  // ช่องค้นหาว่าง แอปจะข้ามการให้คะแนนไปเลย จึงเช็คที่ตัวเงื่อนไขในโค้ดแทน
  assert.match(html, /const hits = q\s*\n?\s*\? FAQ_ITEMS\.map/);
});

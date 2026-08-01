import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("หน้า FAQ ต้องมีครบ ทั้ง route หน้าเพจ และเมนู", () => {
  assert.match(html, /faq: '\/faq'/);
  assert.match(html, /id="page-faq"/);
  assert.match(html, /data-page="faq"/);
  // ต้องเรียกเรนเดอร์ตอนเปิดหน้า ไม่งั้นหน้าว่าง
  assert.match(html, /name === 'faq' && typeof renderFaq === 'function'/);
});

test("ต้องมี 5 หมวด และคำถามครบทุกหมวด ไม่มีหมวดร้าง", () => {
  const groups = [...html.matchAll(/\{id:'(\w+)',\s*icon:/g)].map((m) => m[1]);
  assert.deepEqual(groups, ["prep", "exist", "exclude", "copay", "claim"]);
  for (const g of groups) {
    const n = [...html.matchAll(new RegExp(`\\{g:'${g}'`, "g"))].length;
    assert.ok(n >= 4, `หมวด ${g} มีแค่ ${n} คำถาม น้อยเกินไป`);
  }
});

test("ทุกคำถามต้องมีทั้งคำตอบสั้นและคำตอบเต็ม ห้ามมีแต่หัวข้อ", () => {
  const items = [...html.matchAll(/\{g:'\w+', q:'([^']+)',\s*\n\s*lead:'([^']+)',\s*\n\s*body:`([^`]+)`/g)];
  assert.equal(items.length, 28, `แกะได้ ${items.length} คำถาม ควรได้ 28`);
  for (const [, q, lead, body] of items) {
    assert.ok(lead.length >= 25, `คำตอบสั้นของ "${q}" สั้นเกินไป`);
    assert.ok(body.length >= 120, `คำตอบเต็มของ "${q}" สั้นเกินไป จะกลายเป็นย่อจนไม่ได้สาระ`);
  }
});

test("สาระสำคัญที่หาข้อมูลมาต้องอยู่ครบ ไม่ถูกตัดทิ้งตอนย่อ", () => {
  // กรอบเวลาสืบประวัติที่ต่างกันของสามสัญญา
  assert.match(html, /สืบย้อนโรคที่เป็นก่อนทำได้ 5 ปี และหลังทำได้ 3 ปี/);
  // ระยะรอคอยสองชั้น
  assert.match(html, /<b>30 วันแรก<\/b>/);
  assert.match(html, /<b>120 วันแรก<\/b>/);
  // ข้อยกเว้นต้องครบ 21 ข้อจริง
  assert.match(html, /มาตรฐานปี 2564 กำหนดไว้ 21 ข้อ/);
  for (const n of [1, 7, 14, 21]) {
    assert.ok(html.includes(`\n${n} `), `ข้อยกเว้นข้อ ${n} หายไป`);
  }
  // เกณฑ์ Copayment ต้องบอกว่าเข้าสองอย่างพร้อมกัน ไม่ใช่อย่างเดียว
  assert.match(html, /ต้องเข้าทั้งสองเงื่อนไขพร้อมกัน/);
  assert.match(html, /โรคร้ายแรงตามนิยาม 50 โรคของ คปภ\. และการผ่าตัดใหญ่ ถูกกันออกจากเกณฑ์/);
  // ขบวนการรักษา 4 ขั้น
  assert.match(html, /ตรวจวินิจฉัย → รักษา → ติดตามอาการ → บันทึกว่าหายขาด/);
  // สิทธิที่ลูกค้ามักไม่รู้
  assert.match(html, /มีเวลาตอบรับหรือปฏิเสธ 15 วัน/);
  assert.match(html, /ต้องยื่นภายใน 2 เดือนก่อนครบกำหนดชำระเบี้ย/);
});

test("ต้องมีมุมของหมอ ซึ่งเป็นสิ่งที่ตัวแทนทั่วไปเขียนไม่ได้", () => {
  const n = [...html.matchAll(/doc:'/g)].length;
  assert.ok(n >= 8, `มีมุมของหมอแค่ ${n} จุด ควรมีอย่างน้อย 8`);
  // ต้องไม่แนะนำให้เลี่ยงการรักษาเพื่อรักษาสิทธิ์ประกัน
  assert.match(html, /อย่าเลื่อนการรักษาเพราะเหตุผลเรื่องประกัน/);
  assert.match(html, /อย่าตอบเลี่ยงกับหมอเพื่อรักษาสิทธิ์เคลม/);
});

test("ต้องค้นหาได้ กรองตามหมวดได้ และมีลิงก์ข้ามไปคู่มือ", () => {
  assert.match(html, /function faqMatch\(item, q\)/);
  assert.match(html, /function faqSetGroup\(g\)/);
  assert.match(html, /function faqCrossLinkHtml\(\)/);
  // ตอนค้นหาต้องดูข้ามหมวด ไม่งั้นหาไม่เจอคำตอบที่อยู่คนละหมวด
  assert.match(html, /const activeG = q \? 'all' : faqActiveGroup;/);
});

test("แบบที่เพิ่งเพิ่มต้องกดเปรียบเทียบได้ ไม่ใช่การ์ดเทา", () => {
  for (const id of ["flexi9920", "smartlink153", "smartlink156"]) {
    assert.ok(
      new RegExp(`COMPARE_SELECTABLE_IDS[\\s\\S]*'${id}'`).test(html),
      `${id} ยังไม่อยู่ในลิสต์ที่เลือกเทียบได้`,
    );
    assert.match(html, new RegExp(`^  ${id}: \\{title:'`, "m"), `${id} ยังไม่มีข้อมูลสำหรับตารางเทียบ`);
  }
});

test("ค้นแล้วไม่เจอ ต้องบอกทางออก ไม่ใช่หน้าว่าง", () => {
  assert.match(html, /if\(!found\) html \+= /);
  assert.match(html, /ไม่พบคำถามที่ตรงกับคำค้นนี้ ลองใช้คำสั้นลง/);
});

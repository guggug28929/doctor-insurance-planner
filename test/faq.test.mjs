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
  assert.deepEqual(groups, ["prep", "exist", "exclude", "copay", "claim", "premium"]);
  for (const g of groups) {
    const n = [...html.matchAll(new RegExp(`\\{g:'${g}'`, "g"))].length;
    assert.ok(n >= 3, `หมวด ${g} มีแค่ ${n} คำถาม น้อยเกินไป`);
  }
});

test("ทุกคำถามต้องมีทั้งคำตอบสั้นและคำตอบเต็ม ห้ามมีแต่หัวข้อ", () => {
  // คำถามที่เคยเป็นลิงก์เก่าจะมีฟิลด์ k คั่นอยู่ ตัวแกะจึงต้องยอมให้มีหรือไม่มีก็ได้
  const items = [...html.matchAll(/\{g:'\w+',(?: k:'[\w-]+',)? q:'([^']+)',\s*\n\s*lead:'([^']+)',\s*\n\s*body:`([^`]+)`/g)];
  assert.equal(items.length, 36, `แกะได้ ${items.length} คำถาม ควรได้ 36`);
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
  assert.match(html, /function faqSegment\(q\)/);
  assert.match(html, /function faqScore\(item, tokens\)/);
  assert.match(html, /function faqSnippet\(item, tokens\)/);
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

test("ห้ามมีโค้ด escape หลุดไปแสดงเป็นตัวอักษรบนหน้าเว็บ", () => {
  // เคยพลาด: เขียน \\u{1F50D} ในส่วน HTML แล้วมันโชว์เป็นตัวหนังสือดิบ
  const faqBlock = html.slice(html.indexOf('id="page-faq"'), html.indexOf('id="page-knowledge"'));
  assert.ok(!/\\u\{?[0-9A-Fa-f]{4}/.test(faqBlock), "ยังมี escape หลุดในส่วน HTML ของหน้า FAQ");
});

test("รวมแท็บ FAQ เดิมเข้ามาแล้ว ต้องไม่เหลือสองที่ให้สับสน", () => {
  // แท็บเดิมในหน้าความรู้ต้องถูกยุบ ไม่งั้นเนื้อหาซ้ำสองที่
  assert.ok(!html.includes('id="knowTab-faq"'), "ยังมีแท็บ FAQ เดิมค้างอยู่ในหน้าความรู้");
  assert.ok(!html.includes('id="knowTabBtn-faq"'), "ยังมีปุ่มแท็บเดิมค้างอยู่");
  // ลิงก์เก่าที่เรียก setKnowTab('faq') ต้องยังใช้ได้ โดยเด้งไปหน้าใหม่
  assert.match(html, /if\(tab === 'faq'\)\{ showPage\('faq'\); return; \}/);
  // กล่องถาม AI ปิดไว้ชั่วคราวจนกว่า backend จะพร้อม จึงไม่ต้องมีบนหน้า
  assert.match(html, /const FAQ_AI_ENABLED = false;/);
});

test("เนื้อหาจากแท็บเดิมต้องถูกรวมเข้ามาครบ ไม่ใช่ทิ้ง", () => {
  const must = [
    // 7 หัวข้อที่ของเดิมมี แต่ของใหม่ยังไม่มี
    "ซื้อกับตัวแทน กับซื้อออนไลน์เอง ต่างกันตรงไหน",
    "แฟกซ์เคลม คืออะไร ทำไมบางครั้งยังต้องสำรองจ่าย",
    "ทำไมตัวแทนถึงการันตีไม่ได้ว่าจะไม่โดนสำรองจ่าย",
    "บริษัทการันตีต่อสัญญาทุกปี แล้วมีกรณีไหนที่ไม่ต่อบ้าง",
    "ได้ข้อเสนอใหม่ที่ยกเว้นโรคหรือเพิ่มเบี้ย ควรทำยังไง",
    "ทำไมเบี้ยประกันสุขภาพถึงขึ้นทุกปี",
    "ประกันสุขภาพเบี้ยคงที่ มีจริงไหม",
    "จ่ายรายปี หรือรายเดือนดี รูดบัตรผ่อนได้ไหม",
    // สาระจากของเดิมที่ต้องถูกผนวกเข้าข้อที่ซ้ำ ไม่ใช่แทนที่
    "เกณฑ์หน้า 5 หลัง 3",
    "OPD กับโรคเรื้อรังบางโรค รอ 180 วัน",
    "ภาวะที่เป็นมาแต่กำเนิด รอ 1 ปี",
    "จากวันที่เซ็นรับข้อเสนอใหม่",
    "อย่าสับสนกับ Deductible",
    "และสองอย่างนี้ซ้อนกันได้",
    "การสืบประวัติใช้เวลาได้สูงสุด 90 วัน",
    "แต่ให้ตอบเฉพาะที่เขาถาม",
    "ไม่ออกข้อยกเว้นภายใน 1 เดือน",
  ];
  for (const m of must) assert.ok(html.includes(m), `เนื้อหาจากของเดิมหายไป: ${m}`);
});

test("ตัวเลขเกณฑ์ Copayment ต้องตรงกับข้อมูลฝั่งบริษัท", () => {
  assert.match(html, /นอนตั้งแต่ 3 ครั้งขึ้นไป และเคลมรวมตั้งแต่ 200% ของเบี้ย/);
  assert.match(html, /นอนตั้งแต่ 3 ครั้งขึ้นไป และเคลมรวมตั้งแต่ 400% ของเบี้ย/);
});

test("ลิงก์ไปหน้าเทียบโรคร้ายแรงต้องไม่หายไปตอนยุบแท็บเดิม", () => {
  assert.match(html, /class="faq-inline-link" onclick="showPage\('ci-compare'\)"/);
});

test("ช่องค้นหาต้องมีปุ่มล้างอันเดียว ไม่ซ้อนกับของเบราว์เซอร์", () => {
  // input type=search มีปุ่มล้างในตัว พอทำเองด้วยเลยได้กากบาทสองอัน
  assert.match(html, /<input id="faqSearch" type="text"/);
  assert.match(html, /#faqSearch::-webkit-search-cancel-button/);
});

test("CSS กล่องถาม AI ต้องพร้อมใช้ทันทีถ้าเปิดกลับ", () => {
  // เคยพลาด: ย้าย HTML ไปหน้า faq แต่ CSS ยังผูกกับ #page-knowledge สไตล์เลยหลุดหมด
  for (const sel of ["#faqChatInput", ".faq-chat-actions button", ".faq-chatbot", "#faqChatAnswer"]) {
    assert.ok(html.includes("#page-faq " + sel), `CSS ของ ${sel} ยังไม่ตามมาที่หน้า faq`);
  }
  assert.ok(!/#page-knowledge #faqChat/.test(html), "ยังมี CSS กล่อง AI ค้างที่หน้าความรู้");
  assert.ok(!/#page-knowledge \.faq-chat/.test(html), "ยังมี CSS กล่อง AI ค้างที่หน้าความรู้");
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

/* สองเรื่องในไฟล์นี้เป็นเรื่องที่พังแล้วลูกค้าเห็นทันที
   1) โน้ตทำงานภายในหลุดขึ้นหน้าเว็บ ลูกค้าอ่านแล้วสรุปว่าเบี้ยทั้งเว็บเชื่อไม่ได้
   2) ปุ่มเมนูหาย ทำให้ทั้งการสลับหน้าและดัชนีค้นหาทั้งเว็บพังเงียบ ๆ */

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

/* ---------- โน้ตภายในต้องไม่อยู่บนหน้าเว็บ ---------- */

test('เนื้อหาบันทึก Recheck ต้องไม่อยู่ใน index.html แล้ว', () => {
  const banned = [
    'บันทึก Recheck ข้อมูลและตารางเบี้ย',
    'ไม่ควรใช้ตัวเลขนี้ปิดการขาย',
    'ควรตรวจใบเสนอราคาจริงซ้ำ',
    'จุดที่ดูแปลก',
    'NST/ใบเสนอจริง',
  ];
  for(const s of banned)
    assert.ok(!html.includes(s),
      `ข้อความภายใน "${s}" หลุดกลับขึ้นหน้าเว็บ ต้องเก็บไว้ที่ docs/rate-recheck-notes.md เท่านั้น`);
});

test('ต้องยังเก็บบันทึกไว้เป็นเอกสารภายใน ไม่ใช่ลบทิ้ง', () => {
  const url = new URL('../docs/rate-recheck-notes.md', import.meta.url);
  assert.ok(existsSync(url), 'ไม่พบ docs/rate-recheck-notes.md');
  const doc = readFileSync(url, 'utf8');
  // ประเด็นที่ต้องไม่หายไปพร้อมกับการย้าย เพราะเป็นข้อควรระวังตอนเสนอราคาจริง
  for(const s of ['OPD', 'Elite Health Plus', 'D Care', 'HB', 'PA Easy Plan'])
    assert.ok(doc.includes(s), `เอกสารภายในขาดประเด็น ${s}`);
  assert.match(doc, /ไม่ใช่เนื้อหาสำหรับลูกค้า/);
});

/* ---------- แถบเมนู ---------- */

/* ตัดช่วงด้วยการนับวงเล็บของ div จริง เพราะแถบเมนูมี div ซ้อนแล้ว
   ถ้าตัดด้วยการหา </div> ตัวแรกจะได้ช่วงผิดและเทสต์จะผ่านทั้งที่ของพัง */
function sliceTag(src, openMarker){
  const start = src.indexOf(openMarker);
  assert.notEqual(start, -1, `ไม่พบ ${openMarker}`);
  let depth = 0, i = start;
  const re = /<(\/?)div\b/g;
  re.lastIndex = start;
  let m;
  while((m = re.exec(src))){
    depth += m[1] ? -1 : 1;
    if(depth === 0) return src.slice(start, re.lastIndex + 6);
  }
  throw new Error(`แท็ก div ไม่ครบสำหรับ ${openMarker}`);
}

const navbar = sliceTag(html, '<div class="navbar" id="navbar">');

const pagesInNav = [...navbar.matchAll(/data-page="([a-z-]+)"/g)].map(m => m[1]);

test('ทุกหน้าหลักต้องยังมีปุ่มอยู่ใน navbar แม้จะไม่ได้โชว์บนแถบ', () => {
  /* showPage และ ssBuildIndex อ่านปุ่มจาก #navbar ที่เดียว
     ถ้าเอาปุ่มออกจาก DOM หน้านั้นจะหลุดจากผลค้นหาทันที ต้องซ่อนด้วย CSS แทน */
  for(const p of ['home','ai','calc','plans','knowledge','tax','faq','contact','hnw'])
    assert.ok(pagesInNav.includes(p), `ปุ่มหน้า ${p} หายไปจาก #navbar`);
});

test('แถบเมนูต้องเหลือ 7 ปุ่มที่มองเห็น ไม่ใช่ 9 ปุ่มเรียงยาว', () => {
  // hnw ถูกซ่อนด้วย .nav-off ส่วน knowledge กับ faq ย้ายลงเมนูย่อย
  assert.ok(/data-page="hnw"[^>]*class="[^"]*nav-off/.test(navbar),
    'ปุ่ม HNW ต้องมีคลาส nav-off เพื่อซ่อนจากแถบเมนู');
  assert.match(html, /\.navbar button\.nav-off\{display:none !important;\}/);

  const panel = sliceTag(navbar, '<div class="nav-more-panel"');
  for(const p of ['knowledge','faq'])
    assert.ok(panel.includes(`data-page="${p}"`), `${p} ต้องอยู่ในเมนูย่อย`);
  // ภาษีเป็นเครื่องมือคำนวณ ไม่ใช่บทความ ต้องอยู่บนแถบหลักไม่ใช่ในเมนูย่อย
  assert.ok(!panel.includes('data-page="tax"'), 'วางแผนภาษีต้องอยู่บนแถบหลัก');
});

test('ชื่อปุ่มต้องสั้นลงจริง และคำเต็มต้องยังค้นเจอ', () => {
  for(const s of ['>จัดแผนให้<', '>คำนวณเบี้ย<', '>แผนทั้งหมด<'])
    assert.ok(navbar.includes(s), `ขาดปุ่มชื่อสั้น ${s}`);
  assert.ok(!navbar.includes('>ผู้ช่วยออกแบบแผนประกัน<'), 'ยังเหลือชื่อปุ่มแบบยาว');
  // ย่อชื่อแล้วลูกค้ายังพิมพ์คำเต็มมาค้น ต้องมีคำพ้องกำกับ
  assert.match(html, /const NAV_ALIAS = \{/);
  for(const s of ['ผู้ช่วยออกแบบแผนประกัน', 'คำนวณเบี้ยประกัน', 'แผนประกันทั้งหมด'])
    assert.ok(html.includes(s), `NAV_ALIAS ขาดคำเต็ม ${s}`);
  assert.match(html, /add\('หน้า', b\.textContent, PAGE_ROUTES\[name\] \|\| '', NAV_ALIAS\[name\] \|\| ''/);
});

test('เมนูย่อยต้องเปิดปิดได้ ปิดเมื่อคลิกนอกหรือกด Escape และไฮไลต์ปุ่มแม่', () => {
  assert.match(html, /function navMoreSetOpen\(open\)\{/);
  assert.match(html, /function navMoreSyncActive\(name\)\{/);
  assert.match(html, /if\(typeof navMoreSyncActive === 'function'\) navMoreSyncActive\(name\);/);
  assert.match(html, /e\.key === 'Escape' && navMoreIsOpen\(\)/);
  assert.match(html, /!e\.target\.closest\('#navMore'\)\) navMoreSetOpen\(false\)/);
  // กดปุ่มในเมนูย่อยแล้วต้องปิดแผงด้วย ไม่ใช่ค้างบังเนื้อหาหน้าใหม่
  assert.match(html, /if\(btn\)\{ navMoreSetOpen\(false\); showPage\(btn\.dataset\.page\); \}/);
  assert.match(html, /aria-expanded="false" aria-controls="navMorePanel"/);
});

/* ---------- ทางเข้า HNW ในหน้าแผน ---------- */

test('หน้าแผนทั้งหมดต้องมีทางเข้าแผน HNW แทนที่ปุ่มบนเมนู', () => {
  assert.match(html, /<div class="content-card hnw-entry">/);
  assert.match(html, /onclick="showPage\('hnw'\)"/);
  assert.match(html, /\.hnw-entry\{/);
  // เส้นทางเดิมที่เคยส่งให้ลูกค้าต้องยังใช้ได้
  assert.match(html, /hnw: '\/hnw'/);
});

test('เมนูย่อยบนจอแคบต้องกางเต็มความกว้าง ไม่ลอยทับเนื้อหา', () => {
  const mq = html.slice(html.indexOf('.nav-more-panel{'), html.indexOf('.hnw-entry{'));
  assert.ok(mq.includes('@media (max-width:640px)'), 'ขาดการจัดเมนูย่อยบนจอแคบ');
  assert.ok(mq.includes('position:static'), 'จอแคบต้องไม่ลอยทับเนื้อหา');
});

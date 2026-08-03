import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* เอฟเฟกต์ที่ทำพลาดแล้วอันตรายกว่าไม่มีเอฟเฟกต์เลย
   ถ้าอนิเมชันค้างกลางทาง หน้าเว็บจะกลายเป็นจอเปล่า หรือกล่องคำตอบเปิดปิดไม่ได้อีก
   ชุดนี้จึงคุมสองเรื่องเป็นหลัก คือความเร็วที่เหมาะสม และสถานะต้องไม่มีทางค้าง */

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('ความเร็วการกางกล่อง ต้องอยู่ในช่วงที่ไม่ทำให้รู้สึกหน่วง', () => {
  const base = Number(html.match(/const DG_OPEN_BASE_MS = (\d+);/)[1]);
  const max = Number(html.match(/const DG_OPEN_MAX_MS = (\d+);/)[1]);
  assert.ok(base >= 200 && base <= 450, `ค่าเริ่มต้น ${base}ms อยู่นอกช่วงที่คนรู้สึกว่าลื่น`);
  assert.ok(max > base && max <= 600, `เพดาน ${max}ms นานเกินไป กดหลายข้อติดกันจะรอนาน`);
  // กล่องยาวได้เวลามากขึ้น แต่ต้องมีเพดาน
  assert.match(html, /Math\.min\(DG_OPEN_MAX_MS, DG_OPEN_BASE_MS \+ Math\.abs\(delta\) \* [\d.]+\)/);
});

test('สถานะการกางกล่องต้องถูกเก็บกวาดเสมอ ห้ามพึ่ง event finish', () => {
  /* เจอจริงตอนทดสอบ: onfinish กับ finished promise ของ Web Animations
     ไม่ยิงในบางสภาพแวดล้อม แล้วกล่องค้าง overflow:hidden เปิดปิดไม่ได้อีกเลย */
  assert.ok(!/dgAnim\.onfinish/.test(html), 'ห้ามผูกการเก็บกวาดไว้กับ onfinish');
  assert.ok(!/dgAnim\.finished/.test(html), 'ห้ามผูกการเก็บกวาดไว้กับ finished promise');
  assert.match(html, /d\.dgTimer = setTimeout\(\(\) => dgFinishDetails\(d, opening\), ms \+ \d+\);/);
  assert.match(html, /function dgFinishDetails\(d, opening\)/);
  // เก็บกวาดต้องคืนค่าให้ครบทุกอย่างที่ไปแตะไว้
  const fn = html.slice(html.indexOf('function dgFinishDetails('));
  const body = fn.slice(0, fn.indexOf('\n}') + 2);
  for(const k of ["d.style.overflow = ''", "d.style.height = ''", "d.classList.remove('dg-opening')"])
    assert.ok(body.includes(k), `dgFinishDetails ไม่ได้คืนค่า ${k}`);
});

test('กดรัว ๆ ต้องยกเลิกของเดิมก่อน ไม่ให้อนิเมชันซ้อนกัน', () => {
  assert.match(html, /function dgClearDetails\(d\)/);
  assert.match(html, /if\(d\.dgTimer\)\{ clearTimeout\(d\.dgTimer\); d\.dgTimer = null; \}/);
  assert.match(html, /dgClearDetails\(d\);\s*\/\/ กดรัว/);
});

test('ห้ามใช้ fill-mode กับอนิเมชันที่ซ่อนเนื้อหา', () => {
  /* fill:both จะตรึงเฟรมแรกไว้ ถ้าอนิเมชันไม่ได้เริ่ม เช่นแท็บถูกพักไว้เบื้องหลัง
     หน้าเว็บจะค้างที่ opacity 0 แล้วลูกค้าเห็นจอเปล่า อันตรายกว่าไม่มีเอฟเฟกต์ */
  const risky = [...html.matchAll(/animation:dg(PageIn|SlideDown)[^;]*;/g)].map(m => m[0]);
  assert.ok(risky.length >= 2, 'หาอนิเมชันไม่เจอ');
  for(const r of risky)
    assert.ok(!/\b(both|backwards|forwards)\b/.test(r), 'ห้ามใส่ fill-mode: ' + r);
});

test('การเปลี่ยนหน้าต้องถอดคลาสออกเสมอ หน้าห้ามค้างเป็นจอเปล่า', () => {
  assert.match(html, /const DG_PAGE_IN_MS = (\d+);/);
  const ms = Number(html.match(/const DG_PAGE_IN_MS = (\d+);/)[1]);
  assert.ok(ms >= 150 && ms <= 400, `${ms}ms อยู่นอกช่วงที่เหมาะกับการสลับหน้า`);
  assert.match(html, /dgPageInTimer = setTimeout\(\(\) => \{\s*\n\s*target\.classList\.remove\('dg-page-in'\);/);
  // กดหน้าเดิมซ้ำต้องเล่นใหม่ได้ ต้องบังคับคำนวณใหม่ก่อนใส่คลาสกลับ
  assert.match(html, /void target\.offsetWidth;/);
  // ทุกครั้งต้องล้างของหน้าอื่นก่อน ไม่ให้ค้างพร้อมกันหลายหน้า
  assert.match(html, /document\.querySelectorAll\('\.dg-page-in'\)\.forEach\(el => el\.classList\.remove\('dg-page-in'\)\)/);
  // showPage ต้องเรียกเล่นจังหวะเข้าหน้าใหม่ทุกครั้ง ไม่ใช่บางเส้นทาง
  const fn = html.slice(html.indexOf('function showPage(name, options = {})'));
  const body = fn.slice(0, fn.indexOf('\n}') + 2);
  assert.ok(body.includes('dgPlayPageIn(target);'), 'showPage ไม่ได้เรียก dgPlayPageIn');
});

test('ผู้ใช้ที่ตั้งค่าลดการเคลื่อนไหว ต้องได้เว็บที่ไม่ขยับ', () => {
  assert.match(html, /function dgReducedMotion\(\)/);
  assert.match(html, /if\(dgReducedMotion\(\) \|\| typeof d\.animate !== 'function'\) return false;/);
  assert.match(html, /function dgPlayPageIn\(target\)\{\s*\n\s*if\(dgReducedMotion\(\)\) return;/);
  assert.match(html, /@media \(prefers-reduced-motion: reduce\)\{[\s\S]{0,220}\.page\.dg-page-in\{animation:none;\}/);
});

test('ปุ่มต้องมีการตอบสนองตอนกด ไม่งั้นช่วงรอยต่อจะเหมือนไม่มีอะไรเกิดขึ้น', () => {
  assert.match(html, /\.btn:active, \.nav-btn:active\{transform:translateY\(1px\);\}/);
  assert.match(html, /\.faq-arrow\{[\s\S]{0,200}transition:transform var\(--dg-open-ms,340ms\)/);
});

test('ดักที่ summary ทุกอันในเว็บ ไม่ไล่ผูกทีละที่', () => {
  // FAQ กับหน้าภาษีวาดเนื้อหาใหม่ตลอด ผูกทีละอันแล้วจะหลุด
  assert.match(html, /const summary = e\.target\.closest && e\.target\.closest\('summary'\);/);
  assert.match(html, /if\(dgToggleDetails\(d\)\) e\.preventDefault\(\);/);
  // ต้องยืนยันว่าเป็น details จริง กัน summary ที่ลอยอยู่นอก details
  assert.match(html, /if\(!d \|\| d\.tagName !== 'DETAILS'\) return;/);
});

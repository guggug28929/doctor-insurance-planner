import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* ลูกค้าส่วนใหญ่เข้าเว็บจากมือถือ แต่ปุ่มคำอธิบายเดิมเปิดได้ด้วยเมาส์อย่างเดียว
   .info-icon เปิดด้วย CSS hover ส่วน .tx-hint ใช้ title attribute
   ทั้งสองแบบเป็นของเมาส์ล้วน คนที่เปิดจาก iPhone จึงไม่มีทางอ่านคำอธิบายได้เลย */

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('ห้ามใช้ title เป็นคำอธิบาย เพราะมือถือแตะแล้วไม่ขึ้น', () => {
  // ทั้งแบบเขียนใน markup และแบบตั้งค่าจาก JS
  const bad = [
    ...[...html.matchAll(/\stitle="[^"]{12,}"/g)].map(m => m[0].trim()),
    ...[...html.matchAll(/\.title\s*=\s*'[^']{12,}'/g)].map(m => m[0].trim()),
    ...[...html.matchAll(/setAttribute\('title'[^)]{12,}\)/g)].map(m => m[0].trim()),
  ];
  assert.equal(bad.length, 0,
    'ยังมี tooltip แบบ title อยู่ ให้ย้ายไปเป็นกล่องที่กดได้ หรือ aria-label ถ้าเป็นแค่คำอธิบายซ้ำ: '
    + bad.join(' | '));
});

test('ปุ่มคำอธิบายทุกแบบต้องเปิดด้วยการกด ไม่ใช่ hover อย่างเดียว', () => {
  assert.match(html, /const HINT_SELECTOR = '\.info-icon, \.tx-hint';/);
  assert.match(html, /function toggleHint\(el\)/);
  assert.match(html, /\.hint-open \.tooltip\{visibility:visible;opacity:1;\}/);
});

test('hover ต้องจำกัดเฉพาะเครื่องที่มีเมาส์จริง', () => {
  // ถ้าไม่กั้น ทัชสกรีนจะค้างสถานะ hover หลังกด แล้วกล่องปิดไม่ลง
  const guard = html.match(/@media \(hover:hover\)\{([\s\S]*?)\n  \}/);
  assert.ok(guard, 'ไม่พบบล็อก @media (hover:hover)');
  assert.match(guard[1], /\.info-icon:hover \.tooltip/);
  assert.match(guard[1], /\.tx-hint:hover \.tooltip/);
  // ทุกกฎที่เปิดกล่องด้วย hover ต้องอยู่ในบล็อกนั้นเท่านั้น
  const outside = html.replace(guard[0], '');
  assert.ok(!/:hover \.tooltip\{visibility:visible/.test(outside),
    'ยังมีกฎ hover ที่เปิดกล่องโดยไม่กั้นอุปกรณ์');
});

test('กดไอคอนที่อยู่ใน label ต้องไม่ไปเลือก radio ให้ด้วย', () => {
  // ไอคอนหลายอันฝังอยู่ใน <label> ของตัวเลือกแผน ถ้าปล่อย event ไหลต่อ
  // การกดดูคำอธิบายจะเปลี่ยนแผนที่เลือกไว้โดยไม่ตั้งใจ
  assert.match(html, /document\.addEventListener\('click', \(e\) => \{[\s\S]{0,400}\}, true\);/);
  assert.match(html, /e\.preventDefault\(\);\s*\n\s*e\.stopPropagation\(\);\s*\n\s*toggleHint\(icon\);/);
});

test('ต้องปิดได้ด้วยการกดที่อื่น กด Escape และตอนเลื่อนหน้า', () => {
  assert.match(html, /closeAllHints\(\);\s*\n\}, true\);/);
  assert.match(html, /if\(e\.key === 'Escape'\)\{ closeAllHints\(\); return; \}/);
  assert.match(html, /window\.addEventListener\('scroll', \(\) => closeAllHints\(\)/);
  // เปิดได้ทีละอัน ไม่ใช่เปิดค้างเต็มหน้า
  assert.match(html, /closeAllHints\(el\);/);
});

test('ใช้คีย์บอร์ดได้ และโปรแกรมอ่านหน้าจอรู้ว่าเป็นปุ่ม', () => {
  assert.match(html, /if\(e\.key !== 'Enter' && e\.key !== ' '\) return;/);
  assert.match(html, /el\.setAttribute\('role', 'button'\);/);
  assert.match(html, /el\.setAttribute\('tabindex', '0'\);/);
  assert.match(html, /el\.setAttribute\('aria-expanded', open \? 'true' : 'false'\);/);
  assert.match(html, /focus-visible/);
});

test('ไอคอนที่ถูกวาดใหม่ทีหลังต้องกดได้ด้วย', () => {
  // หน้าเว็บวาดเนื้อหาใหม่หลายจุด ถ้าเติมคุณสมบัติแค่ตอนโหลดครั้งแรกจะหลุด
  assert.match(html, /function enhanceHints\(root\)/);
  assert.match(html, /new MutationObserver\(\(\) => enhanceHints\(\)\)\.observe\(document\.body/);
  // title ที่หลงเหลือจากที่ไหนก็ตาม ต้องถูกย้ายมาเป็นกล่องที่กดเปิดได้
  assert.match(html, /el\.removeAttribute\('title'\);/);
});

test('ไอคอนคำอธิบายในหน้าเว็บต้องมีข้อความจริงอยู่ข้างใน', () => {
  const icons = [...html.matchAll(/<span class="info-icon">.{0,4}?<span class="tooltip">([\s\S]{0,600}?)<\/span>/g)];
  assert.ok(icons.length >= 30, `เจอไอคอนแค่ ${icons.length} อัน น่าจะอ่านไม่ครบ`);
  for(const m of icons)
    assert.ok(m[1].trim().length > 10, 'มีไอคอนที่กดแล้วไม่มีอะไรขึ้น');
});

test('บนจอเล็ก กล่องคำอธิบายต้องตรึงขอบล่าง ไม่ล้นออกนอกจอ', () => {
  assert.match(html, /@media \(max-width:600px\)\{[\s\S]{0,400}\.info-icon \.tooltip, \.tx-hint \.tooltip\{[\s\S]{0,120}position:fixed;/);
});

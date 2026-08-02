import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

/* ข้อความที่ลูกค้าเห็นจริง = ตัด script/style/คอมเมนต์ แล้วตัด "แท็ก" ออกด้วย
   เพราะ href="/manifest.json" เป็นค่าใน attribute ไม่ใช่ตัวหนังสือบนหน้าจอ
   ส่วนคอมเมนต์ในโค้ดอ้างชื่อไฟล์ได้ตามปกติ แต่ตัวหนังสือบนหน้าเว็บอ้างไม่ได้ */
function visibleText(){
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ');
}

test('หน้าเว็บไม่โผล่ชื่อไฟล์ข้อมูลภายใน', () => {
  const t = visibleText();
  for (const bad of ['premium-rates.json', 'pension-plans.json', '.json']) {
    assert.ok(!t.includes(bad), `พบ "${bad}" ในข้อความที่ลูกค้าเห็น — เป็นโน้ตตอนทำงาน ไม่ใช่เนื้อหาเว็บ`);
  }
});

/* เว็บของตัวแทนท่านอื่น ห้ามเอ่ยถึงทุกที่ในไฟล์ รวมคอมเมนต์
   เพราะ view-source ก็เห็น */
test('ไม่เอ่ยถึงเว็บตัวแทนท่านอื่น', () => {
  assert.ok(!/muangthai-agent/i.test(html), 'พบการอ้างถึง muangthai-agent');
  assert.ok(!/releaseyourrisk/i.test(html), 'พบการอ้างถึง releaseyourrisk');
});

/* ห้ามเอ่ยชื่อบริษัทคู่แข่งหรือชื่อแบบประกันของคู่แข่ง
   เนื้อหาความรู้เรียบเรียงใหม่ด้วยคำของเราเอง และอ้างแบบของเมืองไทยเท่านั้น */
const COMPETITOR_TERMS = [
  // BLA เป็นตัวย่อพิมพ์ใหญ่ ต้องคุมขอบเขตคำ ไม่งั้นชนกับ _blank / bladder / black
  { term: 'BLA', re: /\bBLA\b/ },
  { term: 'Bangkok Life', re: /Bangkok\s*Life/i },
  { term: 'กรุงเทพประกันชีวิต', re: /กรุงเทพประกันชีวิต/ },
  { term: 'คุ้มครอง 2 พลัส', re: /คุ้มครอง\s*2\s*พลัส/ },
  { term: 'Premier Linked', re: /Premier\s*Linked/i },
  { term: 'Prestige Life', re: /Prestige\s*Life/i },
  { term: 'ห่วงรัก', re: /ห่วงรัก/ },
  { term: 'ตลอดชีพสุดคุ้ม', re: /ตลอดชีพสุดคุ้ม/ },
  { term: 'Happy Health', re: /Happy\s*Health/i },
];

test('ไม่เอ่ยชื่อบริษัทหรือแบบประกันของคู่แข่ง', () => {
  for (const { term, re } of COMPETITOR_TERMS) {
    assert.ok(!re.test(html), `พบ "${term}" ในไฟล์ — ห้ามอ้างชื่อของคู่แข่ง`);
  }
});

test('พาดหัวหน้าแรกบอกสิ่งที่ลูกค้าได้ ไม่ใช่สถานที่ทำงาน', () => {
  const hero = html.match(/<div class="sub">([\s\S]*?)<\/div>/);
  assert.ok(hero, 'ไม่พบพาดหัวรองหน้าแรก');
  assert.ok(!hero[1].includes('ห้องฉุกเฉิน'),
    'พาดหัวรองไม่ควรขึ้นต้นด้วยห้องฉุกเฉิน ลูกค้าอ่านแล้วไม่เข้าใจว่าเกี่ยวอะไรกับประกัน');
  assert.ok(/ตารางจริง/.test(hero[1]), 'พาดหัวรองควรบอกว่าคำนวณจากตารางจริง');
});

/* กันตัวแทนเจ้าอื่นลอกเนื้อหา ด้วยการติดเครดิตไปกับของที่ถูกลอก
   ไม่ใช่บล็อกลูกค้า เพราะบล็อกยังไงคนตั้งใจก็ผ่านได้ แต่ลูกค้าจริงจะเดือดร้อน */
test('ห้ามบล็อกคลิกขวาหรือการเลือกข้อความ เพราะกวนลูกค้าแต่กันคนตั้งใจไม่ได้', () => {
  assert.ok(!/addEventListener\('contextmenu'[\s\S]{0,120}preventDefault/.test(html),
    'มีการบล็อกคลิกขวา ลูกค้าจะก๊อปเบอร์โทรไม่ได้');
  // ใช้ user-select:none บนปุ่มได้ปกติ (กันข้อความถูกไฮไลต์ตอนกดรัว ๆ)
  // ที่ห้ามคือใส่บน body/html/* ซึ่งเท่ากับปิดทั้งหน้า
  for (const sel of ['body', 'html', '\\*']) {
    const re = new RegExp(`(^|[},;\\s])${sel}\\s*\\{[^}]{0,400}user-select\\s*:\\s*none`, 'i');
    assert.ok(!re.test(html), `มีการปิดการเลือกข้อความที่ระดับ ${sel} ซึ่งเท่ากับปิดทั้งหน้า`);
  }
  assert.ok(!/addEventListener\('selectstart'[\s\S]{0,120}preventDefault/.test(html));
});

test('คัดลอกยาว ๆ ต้องพ่วงที่มาไปด้วย แต่คัดลอกสั้นต้องปล่อยผ่าน', () => {
  assert.match(html, /const CONTENT_CREDIT = 'ที่มา doctor-insurance\.com/);
  assert.match(html, /const CREDIT_MIN_CHARS = 120;/);
  assert.match(html, /if\(sel\.trim\(\)\.length < CREDIT_MIN_CHARS\) return;/);
  assert.match(html, /clipboardData\.setData\('text\/plain', sel \+ /);
});

test('สั่งพิมพ์ต้องติดที่มา และซ่อนปุ่มที่พิมพ์ออกมาแล้วไร้ประโยชน์', () => {
  assert.match(html, /@media print\{/);
  assert.match(html, /\.print-credit\{display:block !important;/);
  assert.match(html, /<div class="print-credit">ที่มา doctor-insurance\.com/);
});

test('ต้องมีบรรทัดแสดงความเป็นเจ้าของเนื้อหาท้ายเว็บ', () => {
  assert.match(html, /class="site-credit"/);
  assert.match(html, /เรียบเรียงขึ้นเองโดย นพ\.หนึ่งบุรุษ เทียมถนอม/);
});

test('ตาราง Size S\/M\/L\/XL ต้องย้ายไปหน้าคู่มือ และเหลือลิงก์ไว้ที่หน้าแผน', () => {
  assert.match(html, /function healthGuideSizeTableHtml\(\)/);
  assert.match(html, /healthGuideMapHtml\(\) \+ healthGuideSizeTableHtml\(\)/);
  // หน้าแผนต้องไม่มีตารางเต็มอีกแล้ว แต่ต้องมีกล่องชวนไปอ่าน
  const plansStart = html.indexOf('id="page-plans"');
  const plansEnd = html.indexOf('id="page-hnw"');
  const plansHtml = html.slice(plansStart, plansEnd);
  assert.ok(!plansHtml.includes('เทียบประกันสุขภาพแบบ Size'), 'ตารางเดิมยังค้างอยู่ที่หน้าแผน');
  assert.ok(plansHtml.includes('guide-jump-card'), 'ไม่มีกล่องลิงก์ชวนไปอ่านที่หน้าแผน');
  // คำนำต้องเลิกพูดกับตัวแทน แล้วพูดกับลูกค้า
  assert.ok(!html.includes('ใช้เป็นทางลัดในการคุยกับลูกค้า'), 'ยังใช้คำที่พูดกับตัวแทนอยู่');
});

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

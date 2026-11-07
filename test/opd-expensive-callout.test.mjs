import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* กรอบ "OPD บางแบบสำคัญกว่าที่คิด" ในคู่มือวิธีเลือกประกันสุขภาพ + FAQ
   ตัวเลข OPD ของ Elite ต้องตรงกับตารางผลประโยชน์ในหน้าแผน (eliteBenefitRows) */
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('ตัวเลข OPD ของ Elite ในกรอบตรงกับตารางผลประโยชน์', () => {
  assert.match(html, /'20,000 บาทต่อปีกรมธรรม์', '40,000 บาทต่อปีกรมธรรม์', 'จ่ายตามจริง สูงสุด 360 ครั้งต่อปีกรมธรรม์'/);
  assert.match(html, /<td>40 ล้าน<\/td><td>20,000 บาท\/ปี<\/td>/);
  assert.match(html, /<td>75 ล้าน<\/td><td>40,000 บาท\/ปี<\/td>/);
  assert.match(html, /จ่ายตามจริง สูงสุด 360 ครั้ง\/ปี<\/b> ภายใต้วงเงินรวมของแผน/);
});

test('กรอบอยู่ในหัวข้อ 2 ของคู่มือ และมีลิงก์จากใต้ตารางจุดคุ้มทุน OPD', () => {
  assert.match(html, /box:true, anchor:'hg-opd-expensive'/);
  assert.match(html, /class="hg-block\$\{b\.box \? ' hg-callout' : ''\}"/);
  assert.match(html, /getElementById\('hg-opd-expensive'\)\.scrollIntoView/);
});

test('FAQ มีหัวข้อ OPD ราคาแพง และยังย้ำเงื่อนไขกรมธรรม์', () => {
  assert.match(html, /\{g:'coverage', k:'cov-opd-expensive', q:'ไม่ซื้อ OPD ได้ไหม/);
  const i = html.indexOf("k:'cov-opd-expensive'");
  const block = html.slice(i, i + 3000);
  assert.match(block, /ข้อบ่งชี้ ความจำเป็นทางการแพทย์ และเงื่อนไขกรมธรรม์/);
  assert.match(block, /D Health Lite ต้องพ่วง Care Plus/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

/* หน้าแผนทั้งหมดยาวมาก ถ้าไม่มีปุ่มกระโดด ลูกค้าที่อยากดูแค่กลุ่มเดียวต้องเลื่อนผ่านทุกแบบ */
test('หน้าแผนทั้งหมดต้องมีปุ่มกระโดดครบทุกกลุ่ม', () => {
  const groups = ['grp-life', 'grp-health', 'grp-ci', 'grp-pa', 'grp-pension', 'grp-guide'];
  for(const g of groups){
    assert.ok(html.includes(`id="${g}"`), `ไม่มีจุดหมายปลายทาง ${g}`);
    assert.ok(html.includes(`jumpToPlanGroup('${g}')`), `ไม่มีปุ่มที่ชี้ไป ${g}`);
  }
  assert.match(html, /class="plan-jump"/);
});

/* หน้านี้สลับด้วย JavaScript ถ้าปล่อยให้ hash ทำงานเอง ตัวจัดเส้นทางจะคิดว่าเป็นลิงก์เก่า
   แล้วพาไปหน้าอื่นแทนที่จะเลื่อนลงมา จึงต้องคืน false เสมอ */
test('ปุ่มกระโดดต้องไม่ปล่อยให้ hash ไปชนกับตัวจัดเส้นทางลิงก์เก่า', () => {
  assert.match(html, /function jumpToPlanGroup\(id\)\{/);
  assert.match(html, /el\.scrollIntoView\(\{behavior: dgReducedMotion\(\)/);
  assert.match(html, /return false;\n\}\n\nfunction renderPlanFit/);
  assert.match(html, /onclick="return jumpToPlanGroup\('grp-life'\);"/);
});

/* การ์ดคู่มือ S/M/L/XL ควรอยู่ตรงจุดที่คนลังเลจริง คือท้ายกลุ่มสุขภาพ
   ไม่ใช่ลอยอยู่บนสุดก่อนที่ลูกค้าจะเห็นแผนสักแบบ */
test('การ์ดเทียบตามงบต้องอยู่ก่อนกลุ่มโรคร้ายแรง ไม่ใช่บนสุดของหน้า', () => {
  const guide = html.indexOf('id="grp-guide"');
  const health = html.indexOf('id="grp-health"');
  const ci = html.indexOf('id="grp-ci"');
  assert.ok(guide > -1 && health > -1 && ci > -1);
  assert.ok(guide > health, 'การ์ดคู่มือต้องอยู่หลังกลุ่มสุขภาพ');
  assert.ok(guide < ci, 'การ์ดคู่มือต้องอยู่ก่อนกลุ่มโรคร้ายแรง');
});

/* ตารางที่ล็อกทุนไว้ค่าเดียว ลูกค้าต้องคูณเองในหัว ซึ่งไม่มีใครทำ */
test('CI Perfect Care ต้องกรอกทุนได้ และตั้งต้นที่ 500,000', () => {
  assert.match(html, /let ciTableSum = 500000;/);
  assert.match(html, /function cipcRateTableBlock\(freq='annual'\)\{/);
  assert.match(html, /rateTable: \(freq='annual'\) => cipcRateTableBlock\(freq\)/);
  // ช่องกรอกสร้างจากตัวช่วยที่ใช้ร่วมกัน จึงตรวจที่จุดเรียกใช้แทนตัวอักษร id ตรง ๆ
  assert.match(html, /ciSumInput\('cipcTableSum'/);
  assert.match(html, /function ciSumInput\(id, onInput\)\{/);
  assert.match(html, /id="\$\{id\}"/);
  assert.ok(!html.includes("{label:'ชาย (ต่อทุน 500,000บ.)'"),
    'ต้องเลิกใช้ตารางที่ล็อกทุนไว้ค่าเดียวแล้ว');
});

test('กรอกทุนแล้วต้องไม่หลุดโฟกัสกลางคัน', () => {
  // เคยพลาดจนพิมพ์เลขที่สองแล้วเคอร์เซอร์หาย ต้องกลับมาคลิกใหม่ทุกตัวอักษร
  assert.match(html, /function ciRefreshTable\(builder, inputId\)\{/);
  assert.match(html, /next\.setSelectionRange\(caret, caret\)/);
  assert.match(html, /const active = box === document\.activeElement;/);
});

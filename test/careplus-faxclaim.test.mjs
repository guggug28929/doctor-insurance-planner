import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* Care Plus: Fax Claim ใช้ได้ทั้ง IPD และ OPD (ข้อมูลอัปเดต 29.9.69) */
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('  careplus: {\n    title: \'Care Plus\'');
const block = html.slice(start, html.indexOf('\n  },', start));

test('Care Plus: หน้าแผนและข้อความอธิบายต้องไม่บอกว่า OPD ใช้ Fax Claim ไม่ได้', () => {
  assert.ok(start > 0);
  assert.match(block, /ใช้ Fax Claim ได้ทั้งผู้ป่วยนอก \(OPD\) และผู้ป่วยใน \(IPD\)/);
  assert.match(block, /29 ก\.ย\. 2569/);
  assert.doesNotMatch(block, /ไม่สามารถใช้ Fax Claim/);
  assert.doesNotMatch(html, /ต้องสำรองจ่ายแล้วนำใบเสร็จมาเบิก/);
  assert.doesNotMatch(html, /ใช้แฟกซ์เคลมไม่ได้ ส่วนผู้ป่วยใน/);
  assert.match(html, /ใช้แฟกซ์เคลมได้ทั้งผู้ป่วยนอก \(OPD\) และผู้ป่วยใน \(IPD\)/);
});

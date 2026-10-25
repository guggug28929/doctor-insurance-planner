import {test} from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
const h=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('Care Plus ระบุเนื้องอกที่ไม่ใช่มะเร็ง เบิกหมวด 10',()=>{
  assert.ok(h.includes('เนื้องอกที่ไม่ใช่มะเร็ง'));
  assert.ok(h.includes('"เนื้องอกหรือมะเร็ง"'));
  assert.ok(h.includes('ต้องเบิกในหมวด 10 ของสัญญาหลัก'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* กลุ่มคำถาม "โดนยกเว้นโรคนี้ แปลว่าอะไร"

   ลูกค้าที่ได้ข้อเสนอพร้อมสลักหลังถามคำถามเดียวกันทุกราย คือโรคข้างเคียงจะเคลมได้ไหม
   ถ้าตอบผิดด้านใดด้านหนึ่งจะเสียหายทั้งคู่ ตอบว่ายกเว้นหมดคือทำให้ลูกค้าทิ้งความคุ้มครองที่ยังมีอยู่
   ตอบว่าเคลมได้แน่นอนคือรับปากแทนฝ่ายสินไหมซึ่งไม่มีใครทำได้ เทสต์ชุดนี้กันทั้งสองด้าน */

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function faqBody(key){
  const i = html.indexOf(`k:'${key}'`);
  assert.notEqual(i, -1, `ไม่พบคำถาม ${key}`);
  const s = html.indexOf('body:`', i);
  const e = html.indexOf('`,', s + 6);
  assert.ok(s !== -1 && e !== -1, `อ่านเนื้อหาของ ${key} ไม่ได้`);
  return html.slice(s + 6, e);
}

const KEYS = ['exclusion-scope','exclusion-wording','exclusion-osa','exclusion-hypertension',
  'exclusion-diabetes','exclusion-gout','exclusion-lipid','exclusion-spine','exclusion-herpes',
  'exclusion-liver','exclusion-lung','exclusion-symptom','exclusion-cross-plan','careplus-scope'];

test('กลุ่มคำถามเรื่องสลักหลังต้องอยู่ครบทุกข้อ', () => {
  assert.match(html, /\{id:'exclmean', t:'health'/);
  for(const k of KEYS) assert.ok(html.includes(`k:'${k}'`), `หายไป ${k}`);
  const n = [...html.matchAll(/\{g:'exclmean'/g)].length;
  assert.equal(n, KEYS.length, `จำนวนคำถามในกลุ่มเปลี่ยนไป พบ ${n}`);
});

test('ทุกข้อต้องบอกทั้งฝั่งที่เข้าข้อยกเว้นและฝั่งที่ไม่ควรเข้า', () => {
  /* ถ้าเหลือแค่ฝั่งเดียว ลูกค้าจะสรุปผิดทันที ไม่ว่าจะเหลือฝั่งไหน
     สี่ข้อที่ยกออกเป็นข้ออธิบายหลักการและข้อเทียบระหว่างแผน ซึ่งมีเทสต์เฉพาะของตัวเองอยู่แล้ว */
  const skip = new Set(['careplus-scope','exclusion-scope','exclusion-wording','exclusion-cross-plan']);
  const both = KEYS.filter(k => !skip.has(k));
  for(const k of both){
    const b = faqBody(k);
    assert.ok(/เข้าข้อยกเว้น|ถูกยกเว้นสูง/.test(b), `${k} ไม่ได้บอกว่าอะไรเข้าข้อยกเว้น`);
    assert.ok(/เบิกได้ตามปกติ|ควรได้รับการพิจารณาตามปกติ/.test(b),
      `${k} ไม่ได้บอกให้ชัดว่าฝั่งไหนยังเบิกได้`);
  }
});

test('ห้ามรับปากแทนฝ่ายสินไหมว่าเคลมได้แน่นอน', () => {
  for(const k of KEYS){
    const b = faqBody(k);
    assert.ok(!/เคลมได้แน่นอน|คุ้มครองแน่นอน|รับรองว่าเคลมได้/.test(b),
      `${k} มีคำรับปากที่ตัวแทนให้ไม่ได้`);
  }
});

test('ข้อหลักต้องอธิบายเรื่องถ้อยคำและมีช่องทางขอคำชี้แจง', () => {
  const b = faqBody('exclusion-scope');
  assert.ok(b.includes('ที่เกี่ยวกับ') && b.includes('อันเป็นผลโดยตรงจาก'),
    'ต้องเทียบถ้อยคำสองแบบให้เห็น เพราะเป็นจุดที่ตีความต่างกัน');
  assert.ok(b.includes('มาตรา 11'), 'ต้องอ้างหลักการตีความเมื่อมีข้อสงสัย');
  assert.ok(b.includes('1186'), 'ต้องบอกช่องทางร้องเรียนกลางของ คปภ.');
  assert.ok(b.includes('>'), 'ต้องมีข้อความสำเร็จรูปให้ลูกค้าคัดลอกไปขอคำชี้แจง');
});

test('OSA ต้องแยกภาวะแทรกซ้อนโดยตรงออกจากโรคที่แค่มีความเสี่ยงสูงขึ้น', () => {
  const b = faqBody('exclusion-osa');
  for(const s of ['CPAP', 'ออกซิเจนในเลือดต่ำ', 'ความดันหลอดเลือดปอดสูง', 'หลับใน'])
    assert.ok(b.includes(s), `ขาดภาวะแทรกซ้อนโดยตรง ${s}`);
  assert.ok(b.includes('ตัดต่อมทอนซิล'), 'ต้องอธิบายว่าให้ดูข้อบ่งชี้ ไม่ใช่ชื่อหัตถการ');
  assert.match(b, /สโตรก|หลอดเลือดสมอง/, 'ต้องพูดถึงโรคปลายทางที่ลูกค้ากังวล');
});

test('ไขมันสูงต้องแยกกลไกของสโตรกให้เห็นว่าคนละต้นเหตุ', () => {
  const b = faqBody('exclusion-lipid');
  for(const s of ['Cardioembolic', 'Lacunar', 'atherosclerosis'])
    assert.ok(b.includes(s), `ตารางกลไกสโตรกขาด ${s}`);
});

test('ข้อยกเว้นที่เป็นอาการ ต้องบอกวิธีรับมือ ไม่ใช่แค่บอกว่ากว้าง', () => {
  const b = faqBody('exclusion-symptom');
  assert.ok(b.includes('ไปตรวจให้ได้ชื่อโรค'), 'ต้องบอกทางออกที่ทำได้จริง');
  assert.ok(/ห้ามใช้วิธีเลี่ยงไม่ไปตรวจ/.test(b), 'ต้องเตือนไม่ให้เลี่ยงการตรวจเพราะกลัวเคลมไม่ได้');
});

test('บทความข้ามแผนต้องครอบคลุมทุกแบบที่ขายอยู่จริง', () => {
  const b = faqBody('exclusion-cross-plan');
  for(const p of ['Care Plus','CI Perfect Care','Multiple CI','D Care','ไลฟ์ไทม์ โพรเทคชั่น','HB','PA'])
    assert.ok(b.includes(p), `ตารางข้ามแผนขาด ${p}`);
  assert.ok(b.includes('Lymphedema'), 'ต้องมีตัวอย่างภาวะแทรกซ้อนที่ไม่มีแผนไหนจ่าย');
});

test('หน้าแผน Care Plus ต้องมีกล่องเตือนขอบเขตความคุ้มครอง', () => {
  assert.match(html, /function careplusScopeWarning\(\)\{/);
  assert.match(html, /return careplusScopeWarning\(\) \+ /);
  const i = html.indexOf('function careplusScopeWarning()');
  const sec = html.slice(i, html.indexOf('function careplusPathoSection()', i));
  for(const s of ['ค่าห้องและค่าอาหาร', 'Colostomy', 'เม็ดเลือดขาวต่ำ', 'ศัลยกรรมถอนรากถอนโคน'])
    assert.ok(sec.includes(s), `กล่องเตือนขาด ${s}`);
  assert.match(html, /\.cp-warn\{background:var\(--danger-bg/);
});

test('ตัวเรนเดอร์คำตอบต้องรองรับตาราง กล่องเตือน และข้อความให้คัดลอก', () => {
  const i = html.indexOf('function faqBodyHtml(txt){');
  const sec = html.slice(i, html.indexOf('function faqHaystack', i));
  assert.ok(sec.includes('faq-table'), 'ต้องวาดแถวที่ขึ้นต้นด้วย | เป็นตาราง');
  assert.ok(sec.includes('faq-warn'), 'ต้องวาดแถวที่ขึ้นต้นด้วย ! เป็นกล่องเตือน');
  assert.ok(sec.includes('faq-quote'), 'ต้องวาดแถวที่ขึ้นต้นด้วย > เป็นกล่องข้อความ');
  // ทุกตารางต้องมีหัวตาราง ไม่งั้นอ่านไม่รู้เรื่องว่าคอลัมน์ไหนคืออะไร
  assert.ok(sec.includes('<thead>'), 'ตารางต้องมีหัวตาราง');
});

test('หัวข้อสองฝั่งต้องบอกผลตรง ๆ ว่าเบิกได้หรือเบิกไม่ได้', () => {
  /* เดิมเขียนว่า "ไม่ควรถูกยกเว้นอัตโนมัติ" ซึ่งเป็นภาษาเชิงหลักการ
     ลูกค้าอ่านแล้วยังตอบตัวเองไม่ได้ว่าตกลงยื่นเคลมได้ไหม */
  assert.ok(!/ไม่ควรถูกยกเว้นอัตโนมัติ<\/b>/.test(html),
    'ยังมีหัวข้อที่เขียนเป็นหลักการ แทนที่จะบอกผลว่าเบิกได้หรือไม่ได้');
  const scope = faqBody('exclusion-scope');
  assert.ok(scope.includes('ฝั่งเบิกไม่ได้') && scope.includes('ฝั่งเบิกได้ตามปกติ'),
    'ข้อหลักต้องอธิบายว่าสองฝั่งในหมวดนี้แปลว่าอะไรตอนยื่นจริง');
  assert.ok(scope.includes('กรณีก้ำกึ่ง'), 'ต้องบอกด้วยว่ากรณีก้ำกึ่งตัดสินจากอะไร');
});

test('ข้อปอดต้องแยกเนื้อปอดออกจากหลอดลม', () => {
  const b = faqBody('exclusion-lung');
  assert.ok(b.includes('Tracheobronchitis'), 'ต้องพูดถึงหลอดลมอักเสบซึ่งไม่ใช่เนื้อปอด');
  assert.ok(b.includes('Pneumonia'), 'ต้องเทียบกับปอดอักเสบซึ่งเป็นเนื้อปอด');
  assert.ok(b.includes('ระบบทางเดินหายใจส่วนล่าง'),
    'ต้องบอกว่าถ้อยคำที่กว้างกว่าจะรวมหลอดลมเข้ามาด้วย');
});

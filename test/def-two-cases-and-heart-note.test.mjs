import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* สองเรื่องที่เคยทำให้ลูกค้าอ่านแล้วสรุปผิด

   หนึ่ง ข้อที่กรมธรรม์แยกเป็นสองกรณี เคยใส่กรณีที่ 1 ไว้ในกรอบเกณฑ์
   แล้วเอากรณีที่ 2 ไปเป็นย่อหน้าลอยนอกกรอบ คนอ่านนึกว่าอันหลังเป็นหมายเหตุ
   ทั้งที่เป็นเงื่อนไขที่ต้องเข้าให้ครบเหมือนกัน ตอนนี้ใช้ criteria2 ให้ได้กรอบเดียวกัน

   สอง นิยามกล้ามเนื้อหัวใจตายเฉียบพลันบังคับครบทั้งสามข้อ รวมถึงคลื่นไฟฟ้าหัวใจ
   ซึ่งในทางปฏิบัติ STEMI เข้าเกณฑ์ง่ายกว่า NSTEMI มาก ตัวแทนต้องเห็นข้อนี้ก่อนขาย
   ไม่ใช่ไปรู้ตอนลูกค้าเคลมไม่ได้ */

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const load = f => JSON.parse(readFileSync(new URL('data/' + f, root), 'utf8'));

const CIPC = load('cipc-definitions.json');
const DCARE = load('dcare-definitions.json');
const LTP = load('ltp-definitions.json');
const MCI = load('mci-definitions.json');

test('ทุก renderer ที่วาดกล่องเกณฑ์ ต้องวาดกรณีที่สองด้วยกล่องเหมือนกัน', () => {
  // ถ้ามีที่ไหนวาด criteria แต่ลืม criteria2 ข้อความกรณีที่ 2 จะหายไปทั้งก้อน
  const withCriteria = html.match(/if\((?:d|s)\.criteria\) (?:body|h) \+=/g) || [];
  const withCriteria2 = html.match(/if\((?:d|s)\.criteria2\) (?:body|h) \+=/g) || [];
  assert.equal(withCriteria2.length, withCriteria.length,
    'มี renderer ที่วาด criteria แต่ไม่วาด criteria2');
  assert.ok(withCriteria.length >= 4, 'จำนวน renderer นิยามโรคลดลงผิดปกติ');
  // ต้องเป็นกล่องชนิดเดียวกัน ไม่ใช่ย่อหน้าลอย
  assert.ok(!/criteria2.*def-extra/.test(html), 'criteria2 ต้องไม่ถูกวาดเป็นย่อหน้านอกกรอบ');
});

test('ข้อเอดส์จากการถ่ายเลือดหรือการทำงาน ต้องอยู่ในกรอบทั้งสองกรณี', () => {
  const d = DCARE.groups.flatMap(g => g.diseases || [])
    .find(x => x.th.startsWith('โรคเอดส์/เอชไอวี จากการถ่ายเลือด'));
  assert.ok(d, 'ไม่พบข้อเอดส์จากการถ่ายเลือดหรือการทำงาน');
  assert.ok(Array.isArray(d.criteria) && d.criteria.length, 'กรณีที่ 1 ต้องเป็นรายการเกณฑ์');
  assert.ok(Array.isArray(d.criteria2) && d.criteria2.length, 'กรณีที่ 2 ต้องเป็นรายการเกณฑ์ ไม่ใช่ย่อหน้า');
  assert.match(d.criteriaTitle, /กรณีที่ 1/);
  assert.match(d.criteria2Title, /กรณีที่ 2/);
  // เนื้อหาสำคัญของกรณีที่ 2 ต้องไม่หล่นหายตอนย้ายเข้ากรอบ
  const all = d.criteria2.join(' ');
  for(const s of ['30 วัน', '180 วัน', '5 วัน', 'ทันตแพทย์'])
    assert.ok(all.includes(s), `เนื้อหากรณีที่ 2 ขาด ${s}`);
  assert.ok(!(d.extra || '').includes('กรณีที่ 2'), 'ยังมีกรณีที่ 2 ค้างอยู่นอกกรอบ');
});

test('นิยามกล้ามเนื้อหัวใจตายเฉียบพลันทุกแบบ ต้องเตือนเรื่อง STEMI กับ NSTEMI', () => {
  const targets = [
    ['CI Perfect Care', CIPC.diseases.find(d => d.th === 'กล้ามเนื้อหัวใจตายเฉียบพลันจากการขาดเลือด')],
    ['D Care กลุ่มหัวใจ', DCARE.groups[1].diseases.find(d => d.th === 'กล้ามเนื้อหัวใจตายเฉียบพลันจากการขาดเลือด')],
    ['D Care กลุ่มยอดฮิต', DCARE.groups[5].diseases.find(d => d.th === 'กล้ามเนื้อหัวใจตายเฉียบพลันจากการขาดเลือด')],
    ['ไลฟ์ไทม์ โพรเทคชั่น', LTP.diseases.find(d => d.th === 'กล้ามเนื้อหัวใจตายเฉียบพลันจากการขาดเลือด')],
    ['Multiple CI', MCI.diseases.find(d => d.th === 'หัวใจวาย')],
  ];
  for(const [label, d] of targets){
    assert.ok(d, `ไม่พบข้อกล้ามเนื้อหัวใจตายเฉียบพลันของ ${label}`);
    assert.ok(d.doc, `${label} ไม่มีมุมมองจากห้องตรวจ`);
    assert.ok(d.doc.includes('STEMI'), `${label} ไม่ได้บอกว่า STEMI คือตัวที่มักเข้าเกณฑ์`);
    assert.ok(d.doc.includes('NSTEMI'), `${label} ไม่ได้เตือนว่า NSTEMI อาจไม่เข้าครบทุกข้อ`);
  }
});

test('มุมมองจากห้องตรวจต้องถูกวาดในทุกหน้านิยาม', () => {
  const hits = html.match(/<b>มุมมองจากห้องตรวจ<\/b>/g) || [];
  assert.ok(hits.length >= 4, 'มีหน้านิยามที่ไม่ได้วาดมุมมองจากห้องตรวจแล้ว');
});

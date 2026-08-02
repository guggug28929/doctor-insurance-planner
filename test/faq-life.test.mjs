import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('มีแท็บใหญ่สองแท็บ แยกสุขภาพกับชีวิตออกจากกัน', () => {
  assert.match(html, /const FAQ_TOPICS = \[/);
  assert.match(html, /id:'health', label:'ประกันสุขภาพ'/);
  assert.match(html, /id:'life',\s+label:'ประกันชีวิต'/);
  assert.match(html, /<div id="faqTabs" class="faq-tabs"/);
  assert.match(html, /function faqSetTopic\(t\)/);
});

test('หมวดฝั่งชีวิตครบ 6 หมวด และผูกกับแท็บ life', () => {
  const block = html.match(/const FAQ_GROUPS_LIFE = \[([\s\S]*?)\];/);
  assert.ok(block, 'ไม่พบ FAQ_GROUPS_LIFE');
  const ids = [...block[1].matchAll(/id:'(\w+)'/g)].map(m => m[1]);
  assert.deepEqual(ids, ['lwhy', 'lsum', 'lpick', 'lapply', 'lright', 'lheir']);
  assert.equal([...block[1].matchAll(/t:'life'/g)].length, 6, 'มีหมวดที่ยังไม่ได้ผูกกับแท็บ life');
});

/* หมอกึ๊กสั่งไว้ตรง ๆ ว่าต้องมีเรื่องสิทธิ์ในกรมธรรม์
   สี่เรื่องนี้คือสิ่งที่ลูกค้าใช้ได้ตอนยังอยู่ แต่แทบไม่มีใครรู้ว่ามี */
test('เนื้อหาสิทธิ์ในกรมธรรม์ต้องครบทั้งสี่เรื่อง', () => {
  const must = [
    ['เวนคืนกรมธรรม์', /เวนคืนกรมธรรม์คืออะไร ได้เงินเท่าไร เสียอะไรบ้าง/],
    ['มูลค่าใช้เงินสำเร็จ', /มูลค่าใช้เงินสำเร็จ \(Paid-up\)/],
    ['มูลค่าขยายเวลา', /มูลค่าขยายเวลา \(Extended Term\)/],
    ['กู้กรมธรรม์', /กู้เงินจากกรมธรรม์ทำยังไง คิดดอกเบี้ยไหม/],
  ];
  for (const [name, re] of must) assert.match(html, re, `ขาดเรื่อง ${name}`);
  // ต้องอธิบายความต่างของสองตัวที่คนสับสนที่สุด
  assert.match(html, /ยาวเท่าสัญญาเดิม/);
  assert.match(html, /<b>ทุนประกันลดลง<\/b>/);
  assert.match(html, /<b>ทุนประกันเท่าเดิม<\/b>/);
  assert.match(html, /<b>ระยะเวลาคุ้มครองสั้นลง<\/b>/);
  // จุดที่ทำให้ลูกค้าเสียหายจริงถ้าไม่รู้
  assert.match(html, /สัญญาเพิ่มเติมทุกฉบับที่แนบอยู่สิ้นผลตามไปด้วย/);
  assert.match(html, /กู้อัตโนมัติเพื่อชำระเบี้ย/);
});

test('เกณฑ์พิจารณาที่ algorithm ต้องเคารพ ต้องอยู่ในเนื้อหา', () => {
  assert.match(html, /อายุ 20 ถึง 29 ปี ราว 15 ถึง 20 เท่า/);
  assert.match(html, /อายุ 60 ปีขึ้นไป มักไม่เกิน 5 เท่า/);
  assert.match(html, /ไม่ควรเกินราว 20% ของรายได้ต่อปีหลังหักภาษี/);
});

test('ข้อกฎหมายที่ลูกค้าถามบ่อยต้องถูกต้องและครบ', () => {
  assert.match(html, /ต้องเริ่มนับ 2 ปีใหม่/);          // ขาดอายุแล้วต่ออายุ
  assert.match(html, /ระยะผ่อนผันชำระเบี้ยตามปกติคือ 60 วัน/);
  assert.match(html, /ฆ่าตัวตายภายใน 1 ปี/);
  assert.match(html, /ภายใน 14 วันนับแต่วันเสียชีวิต/);
  assert.match(html, /อาจใช้เวลาถึง 90 วัน/);
  // ผู้รับประโยชน์ไม่มีส่วนได้เสีย เงินตกกองมรดก = เสียข้อดีทั้งหมด
  assert.match(html, /สินไหมทั้งก้อนจะตกไปสู่กองมรดกแทน/);
  // เจ้าหนี้เรียกคืนได้เท่าเบี้ย ไม่ใช่ทั้งก้อน
  assert.match(html, /ส่วนที่เท่ากับเบี้ยประกันที่ผู้เอาประกันจ่ายไปแล้ว/);
  // ภาษีมรดก
  assert.match(html, /เกิน 100 ล้านบาท<\/b> โดยทายาทโดยตรงหรือบุพการีเสีย 5%/);
  assert.match(html, /ไม่ใช่มรดก<\/b> จึงไม่ผ่านทั้งผู้จัดการมรดก/);
});

test('ค้นหาข้ามแท็บได้ ไม่งั้นลูกค้าจะคิดว่าเว็บไม่มีคำตอบ', () => {
  assert.match(html, /const other = scored\.filter\(it => faqTopicOf\(it\) !== faqTopic\)/);
  assert.match(html, /อยู่ในแท็บ\$\{meta\.label\}/);
  assert.match(html, /function faqSwitchKeepSearch\(t\)/);
});

test('ชิปนับจำนวนต้องนับเฉพาะแท็บที่เปิดอยู่', () => {
  // เคยพลาดแนวนี้มาแล้ว: นับรวมทั้งเว็บแล้วตัวเลขไม่ตรงกับที่เห็น
  assert.match(html, /const topicTotal = FAQ_ITEMS\.filter\(it => faqTopicOf\(it\) === faqTopic\)\.length/);
  assert.match(html, /const topicGroups = FAQ_GROUPS\.filter\(g => \(g\.t \|\| 'health'\) === faqTopic\)/);
});

test('ลิงก์เก่าต้องบังคับแท็บเป็นสุขภาพก่อนกางหัวข้อ', () => {
  // ถ้าลูกค้าค้างอยู่แท็บชีวิตแล้วกดลิงก์เก่า ต้องเด้งกลับมาแท็บสุขภาพให้
  assert.match(html, /faqTopic = dest\.topic \|\| 'health';/);
});

test('ห้ามใส่ตัวเลขเบี้ยหรืออัตราดอกเบี้ยที่คิดขึ้นเอง', () => {
  const block = html.match(/const FAQ_ITEMS_LIFE = \[([\s\S]*?)\n\];/);
  assert.ok(block, 'ไม่พบ FAQ_ITEMS_LIFE');
  const t = block[1];
  // อัตราดอกเบี้ยเงินกู้ต่างกันรายฉบับ ห้ามระบุตัวเลข ให้บอกว่าดูในเล่ม
  assert.ok(!/ดอกเบี้ย[^\n]{0,40}\d+\s*(%|เปอร์เซ็นต์)/.test(t),
    'มีการระบุอัตราดอกเบี้ยเงินกู้เป็นตัวเลข ซึ่งต่างกันรายฉบับ');
  assert.match(t, /ตามอัตราที่ระบุไว้ในกรมธรรม์ฉบับนั้น/);
  // เพดานการกู้ก็เช่นกัน
  assert.ok(!/กู้ได้สูงสุด\s*\d+\s*%/.test(t), 'มีการระบุเพดานการกู้เป็นตัวเลข');
});

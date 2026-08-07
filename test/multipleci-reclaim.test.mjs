import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* มัลติเพิล ซีไอ ขายด้วยคำว่าเคลมได้ 4 ครั้ง 400% ซึ่งจริงแต่มีเงื่อนไขกำกับสามชั้น
   ถ้าเขียนไม่ครบ ลูกค้าจะคาดหวังผิดตั้งแต่วันซื้อ แล้วไปรู้ตอนเคลม */

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const RATES = JSON.parse(readFileSync(new URL('../data/premium-rates.json', import.meta.url), 'utf8'));

test('หน้าแผนต้องมีส่วนเงื่อนไขการเคลมซ้ำจริง', () => {
  assert.match(html, /detailSections: \(\) => multipleCiReclaimSection\(\)/);
  assert.match(html, /function multipleCiReclaimSection\(\)\{/);
  assert.match(html, /const MCI_GROUPS = \[/);
});

test('กติกาเคลมซ้ำต้องครบทั้งสามชั้น ไม่ตกข้อไหน', () => {
  const i = html.indexOf('function multipleCiReclaimSection()');
  const sec = html.slice(i, i + 9000);
  // ชั้นที่ 1 กลุ่มละครั้งเดียว
  assert.ok(sec.includes('เคลมได้กลุ่มละครั้งเดียวเท่านั้น'), 'ขาดกติกากลุ่มละครั้ง');
  assert.ok(sec.includes('แม้จะเป็นคนละโรคในกลุ่มเดียวกันก็เคลมอีกไม่ได้'), 'ต้องบอกว่าคนละโรคในกลุ่มเดิมก็ไม่ได้');
  // ชั้นที่ 2 เพดาน 4 ครั้ง 4 เท่า
  assert.ok(sec.includes('ไม่เกิน 4 ครั้ง และไม่เกิน 4 เท่าของทุนประกัน'), 'ขาดเพดาน 4 ครั้ง');
  assert.ok(sec.includes('เป็นครบทั้ง 4 กลุ่ม'), 'ต้องบอกว่า 400% ต้องเป็นครบ 4 กลุ่ม');
  // ชั้นที่ 3 กรอบเวลา 10 ปี ซึ่งเป็นข้อที่คนลืมบ่อยที่สุด
  assert.ok(sec.includes('อีกไม่เกิน 10 ปี'), 'ขาดกรอบเวลา 10 ปี');
  assert.ok(sec.includes('แม้ยังไม่เคยเคลมกลุ่มอื่นเลย'), 'ต้องบอกว่าพ้น 10 ปีแล้วจบแม้ไม่เคยเคลม');
  // ข้อดีที่ต้องพูดคู่กัน
  assert.ok(sec.includes('ไม่ต้องจ่ายเบี้ยของสัญญาเพิ่มเติมนี้อีก'), 'ขาดเรื่องหยุดจ่ายเบี้ย');
});

test('ต้องมีตัวอย่างที่แยกกรณีได้เงินกับไม่ได้เงินให้ชัด', () => {
  const i = html.indexOf('function multipleCiReclaimSection()');
  const sec = html.slice(i, i + 9000);
  // เคสมะเร็งซ้ำคือคำถามที่ลูกค้าถามบ่อยที่สุด ต้องตอบไว้ตรง ๆ
  assert.ok(sec.includes('มะเร็งเต้านม') && sec.includes('มะเร็งปอด'), 'ขาดตัวอย่างมะเร็งสองชนิด');
  assert.ok(sec.includes('กลุ่มที่ 2</b> ซึ่งจ่ายไปแล้ว'), 'ต้องอธิบายว่าทำไมมะเร็งสองชนิดได้ครั้งเดียว');
  assert.ok(sec.includes('ปีที่ 12'), 'ขาดตัวอย่างที่เกินกรอบ 10 ปี');
  assert.match(sec, /มุมมองจากห้องตรวจ/);
  assert.ok(sec.includes('กลับเป็นซ้ำหรือกระจายไปอวัยวะอื่น'), 'ต้องเตือนเรื่องมะเร็งกลับเป็นซ้ำ');
});

test('รายชื่อโรคต้องครบ 35 โรค แบ่ง 4 กลุ่มตามเอกสาร', () => {
  const i = html.indexOf('const MCI_GROUPS = [');
  const seg = html.slice(i, html.indexOf('function multipleCiReclaimSection'));
  const counts = [...seg.matchAll(/\{n:(\d), label:'([^']+)', list:\[([\s\S]*?)\]\}/g)]
    .map(m => [Number(m[1]), (m[3].match(/'/g) || []).length / 2]);
  assert.deepEqual(counts, [[1, 8], [2, 2], [3, 6], [4, 19]],
    'จำนวนโรคต่อกลุ่มไม่ตรงกับเอกสาร (8/2/6/19 รวม 35)');
  assert.equal(counts.reduce((n, c) => n + c[1], 0), 35);
});

/* ห้ามยืมนิยามจากแผนอื่นมาใส่ เพราะชื่อโรคตรงกันไม่ได้แปลว่าเกณฑ์ตรงกัน
   ตัวอย่างที่พิสูจน์แล้วคือ angioplasty ของ D Care กับ Lifetime ที่ชื่อตรงกันแต่เกณฑ์ต่างกัน */
test('ต้องเตือนว่าชื่อโรคเหมือนแผนอื่น ไม่ได้แปลว่าเกณฑ์เหมือนกัน', () => {
  const i = html.indexOf('function multipleCiReclaimSection()');
  const sec = html.slice(i, i + 9000);
  assert.ok(sec.includes('ไม่ได้แสดงคำนิยามรายโรค'), 'ต้องบอกตรง ๆ ว่ายังไม่มีคำนิยาม');
  assert.ok(sec.includes('ไม่ได้แปลว่าเกณฑ์การวินิจฉัยเหมือนกัน'), 'ต้องเตือนไม่ให้เอาไปเทียบข้ามแผน');
  assert.ok(sec.includes('Major Stroke'), 'ควรยกตัวอย่างที่ชื่อคล้ายแต่เกณฑ์ต่าง');
  assert.ok(sec.includes('ยึดถ้อยคำในสัญญาเพิ่มเติม มัลติเพิล ซีไอ เท่านั้น'), 'ต้องชี้แหล่งอ้างอิงที่ถูกต้อง');
});

test('เงื่อนไขการรับประกันต้องตรงกับเอกสารผลิตภัณฑ์', () => {
  // ต้องยึดบรรทัด title ไม่ใช่คีย์ลอย ๆ เพราะ multipleci มีอยู่ในทะเบียนรูปปกและโบรชัวร์ด้วย
  const i = html.indexOf("  multipleci: {\n    title: 'Multiple CI'");
  assert.notEqual(i, -1, 'ไม่พบรายการแผน Multiple CI');
  const seg = html.slice(i, html.indexOf('\n  cancer: {', i));
  assert.ok(seg.includes('อายุรับประกันใหม่ 7–65 ปี'), 'อายุรับใหม่ต้องเป็น 7-65 ไม่ใช่ 7-69');
  assert.ok(seg.includes('ต่ออายุได้ถึงอายุ 79 ปี'), 'ขาดอายุต่ออายุสูงสุด');
  assert.ok(seg.includes('กลุ่มอาชีพ 1 และ 2 เท่านั้น'), 'ต้องระบุว่ารับเฉพาะขั้นอาชีพ 1-2');
  assert.ok(seg.includes('AIDS and HIV'), 'ขาดข้อยกเว้นภูมิคุ้มกันบกพร่อง');
  assert.ok(seg.includes('อายุ 66–79 ปี เป็นอัตราสำหรับการต่ออายุเท่านั้น'),
    'ต้องบอกว่าเบี้ยช่วง 66-79 เป็นอัตราต่ออายุ ไม่ใช่สมัครใหม่');
});

test('ตารางเบี้ยต้องครอบคลุมถึงอายุต่ออายุ 79 ปี', () => {
  const m = RATES.multiple_ci;
  assert.equal(m.age_start, 7);
  assert.equal(m.age_end, 79, 'ต้องขยายถึง 79 เพราะเอกสารมีอัตราต่ออายุให้');
  for(const f of ['annual', 'semiannual', 'quarterly', 'monthly'])
    for(const sex of ['m', 'f']){
      const rows = m.payment_schedules[f][sex];
      const covered = a => rows.some(r => r[0] <= a && a <= r[1]);
      for(const age of [7, 45, 65, 70, 75, 79])
        assert.ok(covered(age), `${f}/${sex} ไม่มีอัตราที่อายุ ${age}`);
      // ทุกแถวต้องมีครบ 3 ระดับทุน
      for(const r of rows) assert.equal(r.length, 5, `${f}/${sex} แถวข้อมูลไม่ครบ`);
    }
});

test('จุดยึดอัตราเบี้ยต้องตรงกับเอกสาร ฉบับ 09-09-62', () => {
  // อัตราต่อทุน 1,000 บาท คูณทุนแล้วปัดเศษ · คัดจากตารางท้ายเอกสารโดยตรง
  const at = (freq, sex, age, capIdx) => {
    const r = RATES.multiple_ci.payment_schedules[freq][sex].find(x => x[0] <= age && age <= x[1]);
    return r[2 + capIdx];
  };
  const caps = RATES.multiple_ci.allowed_capitals;
  assert.deepEqual(caps, [500000, 1000000, 2000000]);
  for(const [freq, sex, age, rate] of [
    ['annual', 'm', 7, 0.88], ['annual', 'f', 7, 0.67],
    ['annual', 'm', 35, 2.65], ['annual', 'f', 35, 3.47],
    ['annual', 'm', 65, 48.17], ['annual', 'f', 65, 25.42],
    ['annual', 'm', 79, 133.00], ['annual', 'f', 79, 71.00],
    ['monthly', 'm', 60, 3.148], ['quarterly', 'f', 50, 2.44],
  ]) for(let ci = 0; ci < caps.length; ci++)
    assert.equal(at(freq, sex, age, ci), Math.round(rate * caps[ci] / 1000),
      `${freq}/${sex} อายุ ${age} ทุน ${caps[ci]} ไม่ตรง`);
});

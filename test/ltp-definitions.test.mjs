import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* ไลฟ์ไทม์ โพรเทคชั่น จ่ายเป็นเปอร์เซ็นต์ของทุน และบางรายการทำให้สัญญาสิ้นสุด
   ถ้าเขียนไม่ชัดว่ารายการไหนจบสัญญา ลูกค้าจะวางแผนผิดทั้งฉบับ
   ตัวเลขเกณฑ์ทุกตัวคือสิ่งที่ตัดสินว่าเคลมได้หรือไม่ได้ */

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const DEF = JSON.parse(readFileSync(new URL('../data/ltp-definitions.json', import.meta.url), 'utf8'));
const byEn = en => DEF.diseases.find(d => d.en === en);
const all = JSON.stringify(DEF);

test('ต้องคัดครบทั้ง 15 โรค ไม่มีเลขข้อหาย', () => {
  assert.equal(DEF.diseases.length, 15, `คัดมา ${DEF.diseases.length} โรค`);
  assert.deepEqual(DEF.diseases.map(d => d.n).sort((a, b) => a - b),
    Array.from({length: 15}, (_, i) => i + 1));
  assert.equal(DEF._meta.total_diseases, 15);
});

test('เปอร์เซ็นต์และตารางของทุกโรคต้องตรงกับกรมธรรม์', () => {
  const want = {
    'Severe stroke': [150, 'a'], 'Severe heart attack': [150, 'a'],
    'Severe cancer': [150, 'a'], 'Terminal illness': [150, 'a'],
    'Invasive cancer': [100, 'a'], 'Benign brain tumor': [100, 'a'],
    'Acute heart attack': [100, 'a'], 'Coronary artery by-pass surgery': [100, 'a'],
    'Cardiomyopathy': [100, 'a'], 'Open heart surgery for the heart valve': [100, 'a'],
    'Open heart surgery': [100, 'a'], 'Major stroke': [100, 'a'],
    'Cerebral aneurysm requiring brain surgery': [50, 'a'],
    'Non-invasive cancer / Carcinoma in situ': [25, 'b'],
    'Coronary artery disease requiring angioplasty': [25, 'b'],
  };
  assert.equal(Object.keys(want).length, 15);
  for(const [en, [pct, table]] of Object.entries(want)){
    const d = byEn(en);
    assert.ok(d, `ไม่พบโรค ${en}`);
    assert.equal(d.pct, pct, `${en} เปอร์เซ็นต์ไม่ตรง`);
    assert.equal(d.table, table, `${en} อยู่ผิดตาราง`);
  }
  // สองรายการในตาราง (ข) มีเพดาน 500,000 บาท ห้ามลืม
  for(const d of DEF.diseases.filter(x => x.table === 'b'))
    assert.equal(d.cap, 500000, `${d.en} ต้องมีเพดาน 500,000 บาท`);
  for(const d of DEF.diseases.filter(x => x.table === 'a'))
    assert.equal(d.cap, undefined, `${d.en} อยู่ตาราง (ก) ไม่ควรมีเพดาน`);
});

test('ทุกโรคต้องมีเนื้อความจริง ไม่ปล่อยว่างหรือย่อจนไม่ได้สาระ', () => {
  for(const d of DEF.diseases){
    assert.ok(d.th && d.en, `โรคที่ ${d.n} ขาดชื่อ`);
    assert.ok(['cancer','cardio','neuro','other'].includes(d.group), `${d.en} กลุ่มไม่ถูกต้อง`);
    const full = (d.body || '') + (d.criteria || []).join('') + (d.extra || '') + (d.extra2 || '')
      + (d.exclusions || []).join('') + (d.doc || '');
    assert.ok(full.length > 140, `${d.en} เนื้อความสั้นเกินไป น่าจะถูกย่อ`);
    if(d.criteria) assert.ok(d.criteriaTitle, `${d.en} มีเกณฑ์แต่ไม่มีหัวข้อ`);
    if(d.exclusions) assert.ok(d.exclusionsTitle, `${d.en} มีข้อยกเว้นแต่ไม่มีหัวข้อ`);
  }
});

/* ตัวเลขเกณฑ์คือสิ่งที่ตัดสินการเคลม พิมพ์ผิดตัวเดียวคือให้ข้อมูลผิด */
test('ตัวเลขเกณฑ์สำคัญต้องตรงกับกรมธรรม์', () => {
  const pairs = [
    ['Severe stroke', ['ตั้งแต่ 3 อย่างขึ้นไป', 'อย่างน้อย 180 วัน', 'CT Scan', 'MRI']],
    ['Severe heart attack', ['LVEF', 'ต่ำกว่า 30%', '3 เดือนขึ้นไป', 'อย่างน้อย 3 ข้อ',
                            '2 เท่าของค่าบนของค่าช่วงปกติ', '3 เท่าของค่าบนของค่าช่วงปกติ']],
    ['Severe cancer', ['Any T, N1-3, M0', 'Rai Classification', 'Ann Arbor', 'Durie-Salmon',
                       'มะเร็งอื่น ๆ ในระยะ 3 หรือ 4']],
    ['Terminal illness', ['ภายใน 12 เดือน']],
    ['Invasive cancer', ['Basement Membrane', 'T1N0M0', 'RAI ระยะที่ 3', 'Stage II', 'CIN I, CIN II, CIN III']],
    ['Acute heart attack', ['ครบทั้ง 3 ข้อ', 'Cardiac Troponin', 'CKMB']],
    ['Cardiomyopathy', ['อย่างน้อย 90 วัน', 'Echocardiogram', 'ระดับ 3 ขึ้นไปอย่างถาวร', 'NYHA']],
    ['Open heart surgery', ['Median Sternotomy']],
    ['Major stroke', ['อย่างน้อย 45 วัน', 'ไม่รวมถึงอาการชา', 'Transient Ischemic Attack']],
    ['Cerebral aneurysm requiring brain surgery', ['Craniotomy', 'Neurosurgeon', 'Craniectomy', 'Burr hole']],
    ['Non-invasive cancer / Carcinoma in situ', ['T1N0M0', 'น้อยกว่าระยะที่ 2', 'Borderline Tumor']],
  ];
  for(const [en, keys] of pairs){
    const s = JSON.stringify(byEn(en));
    for(const k of keys) assert.ok(s.includes(k), `${en} ขาดเกณฑ์ "${k}"`);
  }
});

/* จุดที่เข้มกว่า ดี แคร์ อย่างมีนัยต่อการขาย ถ้าไม่เขียนไว้ ตัวแทนจะขายผิด */
test('เกณฑ์หลอดเลือดหัวใจต้องระบุว่าต้องตีบทั้ง 3 เส้น ไม่ใช่เส้นเดียว', () => {
  const d = byEn('Coronary artery disease requiring angioplasty');
  assert.ok((d.extra || '').includes('ตีบอย่างน้อยเส้นละร้อยละ 60 ทั้ง 3 เส้น'),
    'ต้องเขียนว่าทั้ง 3 เส้น เพราะเข้มกว่า ดี แคร์ ที่เส้นเดียวก็พอ');
  assert.ok((d.extra || '').includes('Left Main Artery ตีบอย่างน้อยร้อยละ 50'));
  assert.match(d.doc || '', /เส้นเดียวก็พอ/);
  assert.match(d.doc || '', /ห้ามขายโดยบอกว่าทำบอลลูนแล้วเคลมได้เหมือน ดี แคร์/);
});

test('ต้องบอกว่าแบบนี้ไม่รองรับการทำลิ้นหัวใจผ่านสายสวน', () => {
  const d = byEn('Open heart surgery for the heart valve');
  const red = (d.exclusions || []).join(' ');
  assert.ok(red.includes('บอลลูน') && red.includes('สายสวน'), 'ต้องคงข้อยกเว้นไว้');
  // แบบนี้ไม่มีข้อรองรับวิธีผ่านสายสวนเลย จึงเป็นสีแดงจริง ต่างจาก ดี แคร์
  assert.match(d.doc || '', /ไม่มีข้อรองรับการทำลิ้นหัวใจผ่านสายสวน/);
  assert.match(d.doc || '', /TAVI/);
});

test('บายพาส ต้องชี้ว่าบอลลูนกับขดลวดไปเข้าข้อ 15 ไม่ใช่เคลมไม่ได้', () => {
  const d = byEn('Coronary artery by-pass surgery');
  assert.ok(!d.exclusions, 'ตรงเป๊ะกับข้อ 15 จึงไม่ควรมีกล่องข้อยกเว้น');
  for(const w of ['Angioplasty', 'Stent Insertion', 'ข้อ 15', 'ไม่ได้แปลว่าเคลมไม่ได้'])
    assert.ok((d.doc || '').includes(w), `ขาดประเด็น ${w}`);
});

test('ศัพท์เทคนิคต้องมีคำอธิบายภาษาไทยกำกับ', () => {
  for(const [term, thai] of [
    ['LVEF', 'ค่าร้อยละของเลือดในหัวใจห้องล่างซ้ายที่บีบฉีดออกไปแต่ละครั้ง'],
    ['Troponin', 'เอนไซม์ที่รั่วออกมาเมื่อกล้ามเนื้อหัวใจตาย'],
    ['Echocardiogram', 'อัลตราซาวด์หัวใจ'],
    ['NYHA', 'เกณฑ์แบ่งระดับความสามารถในการใช้ชีวิตของคนไข้โรคหัวใจ'],
    ['Craniectomy', 'ตัดกะโหลกออกแล้วไม่ปิดกลับ'],
    ['Burr hole', 'เจาะกะโหลกเป็นรูเล็ก'],
    ['Transient Ischemic Attack', 'สมองขาดเลือดชั่วคราวที่อาการหายเองได้'],
  ]) assert.ok(all.includes(thai), `ศัพท์ ${term} ยังไม่มีคำอธิบายไทยกำกับ`);
});

test('ต้องบันทึกระยะรอคอยและกำหนดเวลาแจ้งเคลมไว้ด้วย', () => {
  assert.match(DEF._meta.waiting || '', /90 วัน/);
  assert.match(DEF._meta.notify || '', /60 วัน/);
  assert.match(DEF._meta.notify || '', /180 วัน/);
});

test('หน้าแผนต้องแสดงส่วนนิยามจริง พร้อมแท็บและป้ายสี 4 ระดับ', () => {
  assert.match(html, /detailSections: \(\) => ltpDefinitionsSection\(\)/);
  assert.match(html, /function ltpDefinitionsSection\(\)\{/);
  assert.match(html, /function setLtpDefTab\(key\)\{/);
  assert.match(html, /const LTP_BADGE = \{/);
  for(const k of ['lb-150', 'lb-100', 'lb-50', 'lb-25'])
    assert.ok(html.includes(`.${k}{background:`), `ขาดสีป้าย ${k}`);
  assert.match(html, /ltp-definitions\.json\?v=' \+ DATA_VERSION/);
  // โหลดไม่ได้ต้องไม่แสดงอะไรเลย ดีกว่าแสดงนิยามที่ไม่ครบ
  assert.match(html, /if\(!LTP_DEF \|\| !LTP_DEF\.diseases \|\| !LTP_DEF\.diseases\.length\) return '';/);
  // ต้องบอกให้ชัดว่าตารางไหนทำให้สัญญาจบ เพราะเป็นสาระที่สุดของแบบนี้
  assert.match(html, /จ่ายได้<b>เพียงรายการเดียว<\/b>แล้วสัญญาสิ้นสุด/);
  assert.match(html, /จ่ายได้<b>รายการละครั้ง<\/b> โดยสัญญายังมีผลต่อ/);
});

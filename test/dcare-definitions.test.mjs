import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* นิยามโรคร้ายแรงเป็นข้อความที่ตัดสินว่าเคลมได้หรือไม่ได้
   ถ้าคัดมาไม่ครบหรือย่อจนเสียใจความ ลูกค้าจะเข้าใจความคุ้มครองผิดตั้งแต่วันซื้อ
   เทสต์ชุดนี้จึงตรวจว่าคำที่เป็นเงื่อนไขจริงยังอยู่ครบทุกคำ */

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const DEF = JSON.parse(readFileSync(new URL('../data/dcare-definitions.json', import.meta.url), 'utf8'));
const all = DEF.groups.flatMap(g => g.diseases);
const find = en => {
  const d = all.find(x => x.en === en);
  assert.ok(d, `ไม่พบนิยามของ ${en}`);
  return JSON.stringify(d);
};

test('ทุกโรคต้องมีชื่อไทย ชื่ออังกฤษ และเนื้อความ ไม่ปล่อยว่าง', () => {
  for(const g of DEF.groups){
    assert.ok(g.diseases.length, `กลุ่ม ${g.label} ไม่มีโรคเลย`);
    for(const d of g.diseases){
      assert.ok(d.th && d.en, `โรคในกลุ่ม ${g.label} ขาดชื่อ`);
      assert.ok(d.body && d.body.length > 60, `${d.en} เนื้อความสั้นเกินไป น่าจะถูกย่อ`);
      if(d.exclusions) assert.ok(d.exclusionsTitle, `${d.en} มีข้อยกเว้นแต่ไม่มีหัวข้อ`);
      if(d.criteria) assert.ok(d.criteriaTitle, `${d.en} มีเกณฑ์แต่ไม่มีหัวข้อ`);
    }
  }
});

/* มะเร็ง จุดตัดสินคือทะลุ basement membrane หรือยัง และข้อยกเว้นต้องครบ 8 ข้อ
   ข้อที่คนพลาดบ่อยคือ carcinoma in situ ซึ่งหมอบอกว่าเป็นมะเร็งแต่กรมธรรม์ไม่จ่าย */
test('มะเร็งระยะลุกลาม ต้องมีเกณฑ์รุกล้ำและข้อยกเว้นครบ 8 ข้อ', () => {
  const d = all.find(x => x.en === 'Invasive Cancer' && x.exclusions);
  assert.ok(d, 'ไม่พบนิยามมะเร็งฉบับเต็ม');
  assert.match(d.body, /ลุกลามลึกเกินกว่าชั้นรองรับเนื้อเยื่อชั้นผิว/);
  assert.match(d.body, /Basement Membrane/);
  assert.match(d.body, /มะเร็งเม็ดเลือดขาว มะเร็งต่อมน้ำเหลือง มะเร็งของไขกระดูก และมะเร็งเนื้อรก/);
  assert.equal(d.exclusions.length, 8, 'ข้อยกเว้นต้องครบ 8 ข้อตามกรมธรรม์');
  const j = d.exclusions.join(' ');
  for(const k of ['T1N0M0', 'Chronic Lymphocytic Leukemia', 'Carcinoma in Situ', 'Malignant Melanoma',
                  'Stage II', 'Borderline', 'Pre-Malignant', 'CIN I', 'เอชไอวี', '90 วัน'])
    assert.ok(j.includes(k), `ข้อยกเว้นขาดคำว่า ${k}`);
});

/* กล้ามเนื้อหัวใจตายเฉียบพลัน ต้องครบทั้ง 3 ข้อ ไม่ใช่ข้อใดข้อหนึ่ง
   และตัวเลขเท่าของค่าเอนไซม์ต้องตรงเป๊ะ เพราะเป็นตัวตัดสินจริง */
test('กล้ามเนื้อหัวใจตายเฉียบพลัน ต้องครบทั้ง 3 ข้อ พร้อมตัวเลขที่ถูกต้อง', () => {
  for(const g of ['cardio', 'popular']){
    const grp = DEF.groups.find(x => x.key === g);
    const d = grp.diseases.find(x => x.en === 'Acute Heart Attack');
    assert.ok(d, `กลุ่ม ${g} ต้องมีกล้ามเนื้อหัวใจตายเฉียบพลัน`);
    assert.match(d.body, /ครบทั้ง 3 ข้อ/, `${g} ต้องย้ำว่าครบทั้ง 3 ข้อ`);
  }
  const d = DEF.groups.find(x => x.key === 'cardio').diseases.find(x => x.en === 'Acute Heart Attack');
  assert.equal(d.criteria.length, 3);
  assert.match(d.criteria[0], /เจ็บหน้าอก/);
  assert.match(d.criteria[1], /Cardiac Troponin \(T or I\) อย่างน้อย 3 เท่าของค่าบนของค่าช่วงปกติ/);
  assert.match(d.criteria[1], /CKMB อย่างน้อย 2 เท่าของค่าบนของค่าช่วงปกติ/);
  assert.match(d.criteria[2], /คลื่นไฟฟ้าหัวใจที่เกิดขึ้นใหม่/);
});

/* สโตรก สามคำที่ต้องอยู่ครบเสมอ 45 วัน · ความพิการที่ตรวจพบได้ · ภาพวินิจฉัยยืนยัน
   และต้องระบุว่าอาการชาไม่นับ กับ TIA ไม่เข้านิยาม */
test('สโตรก ต้องมี 45 วัน หลักฐานความพิการ และภาพวินิจฉัยยืนยัน', () => {
  const s = find('Major Stroke');
  for(const k of ['45 วัน', 'หลักฐานการตรวจพบความพิการทางระบบประสาท', 'ไม่รวมถึงอาการชา',
                  'CT Scan', 'MRI', 'Cerebral Thrombosis', 'Intracerebral Haemorrhage',
                  'Extracranial Embolism', 'Transient Ischemic Attack', 'Reversible Ischemic Neurological Deficit'])
    assert.ok(s.includes(k), `นิยามสโตรกขาดคำว่า ${k}`);
  const d = all.find(x => x.en === 'Major Stroke');
  assert.match(d.body, /<b>[^<]*45 วัน/, '45 วันต้องถูกทำตัวหนา เพราะเป็นตัวตัดสิน');
  assert.equal(d.exclusions.length, 2);
});

test('บายพาสหัวใจ ต้องระบุว่าไม่รวมบอลลูน ขดลวด และเลเซอร์', () => {
  const s = find('Coronary Artery By-pass Surgery');
  for(const k of ['เปิดเข้าทางทรวงอก', 'Angioplasty', 'Stent Insertion', 'Laser'])
    assert.ok(s.includes(k), `ขาดคำว่า ${k}`);
});

test('ทุพพลภาพถาวรสิ้นเชิง ต้องมี 3 อย่างขึ้นไป 180 วัน และช่วงอายุ 17-70', () => {
  const s = find('Total and permanent disability - TPD');
  for(const k of ['ตั้งแต่ 3 อย่างขึ้นไป', '180 วัน', '17 – 70 ปี'])
    assert.ok(s.includes(k), `ขาดคำว่า ${k}`);
  const d = all.find(x => x.en === 'Total and permanent disability - TPD');
  assert.equal(d.criteria.length, 3, 'กรณีการสูญเสียต้องครบ 3 กรณี');
});

test('หลอดเลือดสมองโป่งพอง ต้องระบุวิธีที่ไม่นับให้ครบ', () => {
  const s = find('Cerebral Aneurysm Requiring Brain Surgery');
  for(const k of ['Craniotomy', 'Neurosurgeon', 'Mycotic aneurysm', 'สายสวน', 'Craniectomy', 'Burr hole'])
    assert.ok(s.includes(k), `ขาดคำว่า ${k}`);
});

test('ผ่าตัดเอออร์ต้า ต้องจำกัดเฉพาะระดับอกและช่องท้อง ไม่รวมแขนง', () => {
  const s = find('Surgery to Aorta');
  for(const k of ['ไม่รวมถึงแขนงต่าง ๆ', 'Graft', 'Aortic Dissection', 'Minimally Invasive Surgery'])
    assert.ok(s.includes(k), `ขาดคำว่า ${k}`);
});

test('ไตวายเรื้อรัง ต้องระบุว่าทั้งสองข้าง และต้องล้างไตหรือปลูกถ่าย', () => {
  const s = find('Chronic Kidney Failure');
  for(const k of ['ไตวายเรื้อรังทั้ง 2 ข้าง', 'ล้างไตเป็นประจำ', 'ปลูกถ่ายไตใหม่'])
    assert.ok(s.includes(k), `ขาดคำว่า ${k}`);
});

/* ตราบใดที่ยังคัดไม่ครบทุกกลุ่ม ต้องบอกลูกค้าตรง ๆ ว่ายังไม่ครบ
   ห้ามปล่อยให้เข้าใจว่าที่เห็นคือทั้งหมดของสัญญา */
test('กลุ่มที่ยังคัดไม่เสร็จ ต้องถูกประกาศไว้ ไม่ใช่เงียบ', () => {
  const m = DEF._meta;
  const done = DEF.groups.map(g => g.key);
  const pending = m.groups_pending || [];
  for(const k of ['cancer','cardio','organ','neuro','other','popular'])
    assert.ok(done.includes(k) || pending.includes(k), `กลุ่ม ${k} หายไปทั้งจากที่ทำแล้วและที่ค้าง`);
  assert.equal(done.filter(k => pending.includes(k)).length, 0, 'กลุ่มเดียวกันอยู่ทั้งสองฝั่งไม่ได้');
  assert.match(html, /const pending = \(m\.groups_pending \|\| \[\]\)\.length/);
});

test('หน้าแผน D Care ต้องแสดงส่วนนิยามจริง พร้อมแท็บแยกกลุ่มโรค', () => {
  assert.match(html, /detailSections: \(\) => dcareDefinitionsSection\(\)/);
  assert.match(html, /function dcareDefinitionsSection\(\)\{/);
  assert.match(html, /function setDcareDefTab\(key\)\{/);
  assert.match(html, /class="def-tab/);
  assert.match(html, /dcare-definitions\.json\?v=' \+ DATA_VERSION/);
  // ถ้าโหลดไฟล์ไม่ได้ ต้องไม่แสดงอะไรเลย ดีกว่าแสดงนิยามที่ไม่ครบ
  assert.match(html, /if\(!DCARE_DEF \|\| !DCARE_DEF\.groups \|\| !DCARE_DEF\.groups\.length\) return '';/);
});

test('ต้องเตือนว่าเกณฑ์ในกรมธรรม์เข้มกว่าเกณฑ์ที่ใช้ในโรงพยาบาล', () => {
  assert.match(html, /เข้มกว่าเกณฑ์ที่ใช้วินิจฉัยในโรงพยาบาลจริงในหลายข้อ/);
});

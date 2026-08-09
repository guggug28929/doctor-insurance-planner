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
      // โรคที่ชี้ไปนิยามเดียวกันในกลุ่มอื่น ไม่ต้องเขียนซ้ำทั้งก้อน แต่ต้องบอกว่าไปดูที่ไหน
      if(d.sameAs){
        assert.match(d.body, /ดูรายละเอียดเต็มได้ที่แท็บ|นิยามเหมือนกับกลุ่ม/,
          `${d.en} ชี้ไปกลุ่มอื่นแต่ไม่ได้บอกว่าไปดูที่ไหน`);
        continue;
      }
      // บางโรคเนื้อความหลักสั้นเพราะสาระอยู่ในเกณฑ์ที่แตกเป็นข้อ จึงนับรวมกัน
      const full = (d.body || '') + (d.criteria || []).join('') + (d.extra || '')
        + (d.exclusions || []).join('') + (d.carveBack || []).join('')
        + (d.elsewhere || []).join('') + (d.elsewhereTitle || '')
        + (d.once || []).join('') + (d.onceTitle || '') + (d.doc || '');
      assert.ok(full.length > 150, `${d.en} เนื้อความสั้นเกินไป น่าจะถูกย่อ`);
      if(d.exclusions) assert.ok(d.exclusionsTitle, `${d.en} มีข้อยกเว้นแต่ไม่มีหัวข้อ`);
      // กล่องที่บอกว่าไปเข้าข้ออื่น ต้องระบุชื่อข้อปลายทางเสมอ ไม่งั้นลูกค้าไปตามหาต่อไม่ถูก
      if(d.elsewhere) assert.match(d.elsewhereTitle || '', /<b>/,
        `${d.en} บอกว่าไปเข้าข้ออื่น แต่ไม่ได้ระบุว่าข้อไหน`);
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
  // ข้อยกเว้น 8 ข้อถูกแยกเป็นสองชั้น ที่ไปเข้าระยะเริ่มต้นได้ กับที่ไม่ได้เลย
  assert.equal(d.exclusions.length + d.never.length, 8, 'ข้อยกเว้นรวมต้องครบ 8 ข้อตามกรมธรรม์');
  assert.equal(d.exclusionsTone, 'early', 'ชั้นที่ไปเข้าระยะเริ่มต้นได้ ต้องไม่ถูกทำเป็นสีแดง');
  assert.equal(d.exclusions.length, 4);
  assert.equal(d.never.length, 4);
  const j = d.exclusions.concat(d.never).join(' ');
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
  // มีคำอธิบายไทยแทรกกลาง จึงตรวจเป็นชิ้น ๆ แทนการจับทั้งประโยค
  assert.match(d.criteria[1], /Cardiac Troponin \(T or I\)/);
  assert.match(d.criteria[1], /เอนไซม์ที่รั่วออกมาเมื่อกล้ามเนื้อหัวใจตาย/);
  assert.match(d.criteria[1], /อย่างน้อย 3 เท่าของค่าบนของค่าช่วงปกติ/);
  assert.match(d.criteria[1], /CKMB/);
  assert.match(d.criteria[1], /อย่างน้อย 2 เท่าของค่าบนของค่าช่วงปกติ/);
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

test('บายพาสหัวใจ ต้องบอกว่าบอลลูนกับขดลวดไปเข้าข้อไหน', () => {
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
  // ช่องว่างแบบที่สอง กลุ่มที่ลงแล้วแต่ยังมีแต่ระยะรุนแรง ต้องประกาศแยกอีกชุด
  const earlyPending = m.early_pending || [];
  for(const g of DEF.groups){
    const hasEarly = g.diseases.some(d => d.stage === 'early' || d.stage === 'both');
    if(!hasEarly && g.key !== 'popular')
      assert.ok(earlyPending.includes(g.key), `กลุ่ม ${g.label} ยังไม่มีโรคระยะเริ่มต้น ต้องประกาศไว้ว่าค้าง`);
  }
  assert.ok(html.includes('ยังไม่ได้ลงเลย') && html.includes('ลงแล้วเฉพาะระยะรุนแรง'),
    'ต้องบอกช่องว่างทั้งสองแบบ');
});

/* ทุกโรคต้องติดป้ายว่าอยู่ในโหมดไหน ไม่งั้นลูกค้าจะเข้าใจว่าซื้อโหมดไหนก็ได้โรคเดียวกัน */
test('ทุกโรคต้องติดป้ายระยะความคุ้มครอง', () => {
  const ok = new Set(['early','severe','both']);
  for(const g of DEF.groups)
    for(const d of g.diseases)
      assert.ok(ok.has(d.stage), `${d.en} ติดป้ายระยะไม่ถูกต้อง (${d.stage})`);
  assert.match(html, /const DCARE_STAGE_BADGE = \{/);
  assert.match(html, /class="stage-badge \$\{badge\.cls\}"/);
  // ใช้คำว่า "แบบ" ไม่ใช่ "โหมด" เพราะเป็นคำที่ลูกค้ากับตัวแทนใช้จริง
  assert.match(html, /ถ้าซื้อแบบเฉพาะระยะรุนแรงจะไม่ได้/);
  assert.match(html, /ดี แคร์ มีให้เลือก 2 แบบ/);
  assert.ok(!html.includes('sb-sev'), 'สีแดงไม่ควรผูกกับตัวโรค เพราะทุกโรคในรายการเคลมได้');
  assert.match(html, /ไม่คุ้มครองทั้ง 2 แบบ/);
});

/* ปฏิเสธซ้อนปฏิเสธอ่านแล้วสรุปไม่ได้ว่าตกลงจ่ายไหม
   ต้องดึงกรณีที่กลับมาคุ้มครองออกมาเป็นกล่องแยก */
test('ข้อยกเว้นของข้อยกเว้น ต้องแยกเป็นกล่องต่างหาก', () => {
  const inv = DEF.groups.find(g => g.key === 'cancer').diseases.find(d => d.en === 'Invasive Cancer');
  // เหลือกรณีเดียวคือเมลาโนมาตั้งแต่ระยะ 2 ส่วนกรณีอื่นย้ายไปกล่องเหลืองที่บอกว่าไปเข้าระยะเริ่มต้นแทน
  assert.ok(inv.carveBack && inv.carveBack.length >= 1, 'มะเร็งระยะลุกลามต้องมีกล่องกรณีที่กลับมาคุ้มครอง');
  assert.match(inv.carveBack.join(' '), /Malignant Melanoma/);
  assert.match(html, /if\(d\.carveBack\) body \+= `<div class="def-block def-back">/);
  assert.match(html, /แต่กรณีเหล่านี้กลับมาคุ้มครอง/);
});

/* ตัวหนากลางประโยคใน <li> ต้องไม่ถูกดันขึ้นบรรทัดใหม่
   เคยพลาดจนวงเล็บกับข้อความในวงเล็บแยกคนละบรรทัด */
test('ตัวหนากลางประโยคต้องไม่ขึ้นบรรทัดใหม่', () => {
  assert.match(html, /\.def-block > b\{display:block/);
  assert.ok(!/\.def-block b\{display:block/.test(html),
    'ถ้าไม่จำกัดเป็นลูกโดยตรง ตัวหนาใน <li> จะขึ้นบรรทัดใหม่ทั้งหมด');
});

/* มะเร็งระยะไม่ลุกลามคือคำตอบของคำถามที่ลูกค้าถามบ่อยที่สุด
   ต้องอยู่ในโหมดสองระยะ และต้องบอกให้ชัดว่าโหมดรุนแรงอย่างเดียวไม่ได้ */
test('มะเร็งระยะไม่ลุกลาม ต้องมีและติดป้ายว่าเฉพาะระยะเริ่มต้น', () => {
  const d = DEF.groups.find(g => g.key === 'cancer').diseases
    .find(x => /Carcinoma in Situ/.test(x.en));
  assert.ok(d, 'ต้องมีนิยามมะเร็งระยะไม่ลุกลาม');
  assert.equal(d.stage, 'early');
  assert.equal(d.criteria.length, 4, 'รายการที่นับเป็นระยะเริ่มต้นต้องครบ 4 ข้อ');
  assert.match(d.criteria.join(' '), /Borderline Tumor \(Low malignant potential\) <b>ของรังไข่/);
  assert.match(d.doc, /ถ้าซื้อแบบเฉพาะระยะรุนแรงจะไม่ได้เลย/);
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

/* ศัพท์เทคนิคต้องมีคำอธิบายไทยกำกับ ไม่งั้นลูกค้าอ่านแล้วข้ามไปเลย
   ซึ่งแปลว่าเงื่อนไขที่สำคัญที่สุดกลายเป็นส่วนที่ไม่มีใครอ่าน */
test('ศัพท์เทคนิคต้องมีคำอธิบายภาษาไทยกำกับ', () => {
  const j = JSON.stringify(DEF);
  const pairs = [
    ['Cardiac Troponin', 'เอนไซม์ที่รั่วออกมาเมื่อกล้ามเนื้อหัวใจตาย'],
    ['CKMB', 'เอนไซม์หัวใจอีกตัวหนึ่ง'],
    ['Basement Membrane', 'แผ่นเยื่อบาง ๆ ที่กั้นใต้เซลล์ผิว'],
    ['Angioplasty', 'ใช้บอลลูนถ่างหลอดเลือดที่ตีบ'],
    ['Stent Insertion', 'ใส่ขดลวดค้ำหลอดเลือด'],
    ['CT Scan', 'เอกซเรย์คอมพิวเตอร์'],
    ['MRI', 'คลื่นแม่เหล็กไฟฟ้า'],
    ['Craniotomy', 'เปิดกะโหลกออกเป็นแผ่นแล้วปิดกลับ'],
    ['Burr hole', 'เจาะกะโหลกเป็นรูเล็ก'],
    ['Ascites', 'น้ำในช่องท้อง'],
    ['FEV 1', 'ปริมาตรลมที่เป่าออกได้ในวินาทีแรก'],
    ['Recipient', 'ผู้รับอวัยวะ ไม่ใช่ผู้บริจาค'],
  ];
  for(const [term, thai] of pairs)
    assert.ok(j.includes(thai), `ศัพท์ ${term} ยังไม่มีคำอธิบายไทยกำกับ`);
});

test('ต้องคัดครบทั้ง 6 กลุ่มโรคของหมวดระยะรุนแรง', () => {
  const keys = DEF.groups.map(g => g.key).sort().join(',');
  assert.equal(keys, 'cancer,cardio,neuro,organ,other,popular');
  assert.deepEqual(DEF._meta.groups_pending, [], 'ไม่ควรเหลือกลุ่มที่ยังไม่ได้คัดแล้ว');
  const total = DEF.groups.reduce((n, g) => n + g.diseases.length, 0);
  assert.ok(total >= 55, `คัดมาแค่ ${total} โรค น่าจะยังไม่ครบ`);
});

/* สีแดงต้องหมายถึงไม่ได้เลยเท่านั้น
   รายการที่แค่ไม่เข้าระยะนี้แต่ไปเข้าอีกระยะได้ ต้องเป็นสีเหลือง ไม่งั้นลูกค้าเข้าใจผิดว่าเคลมไม่ได้ */
test('ข้อยกเว้นที่ไปเข้าระยะเริ่มต้นได้ ต้องไม่ถูกทำเป็นสีแดง', () => {
  const inv = all.find(x => x.en === 'Invasive Cancer' && x.never);
  assert.match(inv.exclusionsTitle, /ไปเข้าเป็นระยะเริ่มต้นแทน/);
  assert.match(inv.exclusions.join(' '), /T1N0M0/);
  assert.match(inv.exclusions.join(' '), /Carcinoma in Situ/);
  assert.match(inv.never.join(' '), /Pre-Malignant/);
  assert.match(inv.never.join(' '), /เอชไอวี/);
  assert.match(html, /const shift = d\.exclusionsTone === 'early';/);
  // ชื่อคลาสถูกเลือกด้วยเงื่อนไขในโค้ด จึงตรวจที่จุดตัดสินใจแทนตัวอักษรตรง ๆ
  assert.match(html, /shift \? 'shift-tag' : 'not-tag'/);
  assert.match(html, /shift \? 'def-shift' : 'def-not'/);
  assert.match(html, /เคลมได้เฉพาะแบบระยะเริ่มต้นและรุนแรง' : 'ไม่คุ้มครองทั้ง 2 แบบ'/);
  assert.match(html, /\.def-shift\{background:#fff8ec/);
});

/* กฎการเขียนกล่องข้อยกเว้น ตกลงกันไว้ว่า
   ถ้าของที่ถูกตัดออก ไปจ่ายในข้ออื่นของแผนเดียวกันโดยนิยามตรงกันเป๊ะ ให้ตัดกล่องทิ้งไปเลย
   ไม่ต้องเขียนว่าไม่จ่ายข้อนี้แต่จ่ายข้ออื่น เพราะไม่ได้เพิ่มข้อมูล มีแต่ทำให้อ่านยาก
   แล้วไปเขียนเป็นข้อความเชิงบวกในมุมมองจากห้องตรวจแทน
   จะเก็บกล่องไว้ได้ก็ต่อเมื่อปลายทางมีเกณฑ์เพิ่ม จนมีโอกาสหลุดทั้งสองข้อ */
test('ของที่ปลายทางรับไว้ตรงเป๊ะ ต้องไม่มีกล่องข้อยกเว้นเหลืออยู่', () => {
  const byEn = en => DEF.groups.flatMap(g => g.diseases).filter(d => d.en === en);
  const cases = [
    ['Surgery to Aorta', ['Minimally Invasive Surgery', 'สายสวน'], ['ส่องกล้อง', 'ระดับอกและช่องท้อง']],
    ['Percutaneous valvuloplasty or valvotomy', ['เปลี่ยนลิ้นหัวใจ'], ['เปลี่ยนลิ้นหัวใจ']],
    ['Coronary Artery By-pass Surgery', ['Angioplasty', 'Stent'], ['สวนหลอดเลือดหัวใจ', '50%', '60%']],
    ['Open Heart Surgery for the Heart Valve', ['บอลลูน', 'สายสวน'], ['ผ่านทางเส้นเลือด', 'ไม่เข้าทั้งสองข้อ']],
  ];
  for(const [en, gone, mustSay] of cases){
    const list = byEn(en);
    assert.ok(list.length, `ไม่พบโรค ${en}`);
    for(const d of list){
      assert.ok(!d.elsewhere, `${en} ยังเหลือกล่องบอกว่าไปเข้าข้ออื่น ทั้งที่นิยามตรงเป๊ะ`);
      const boxes = [...(d.exclusions || []), ...(d.never || [])].join(' ');
      for(const w of gone)
        assert.ok(!boxes.includes(w), `${en} ยังทิ้ง "${w}" ไว้ในกล่องข้อยกเว้น`);
      // ต้องไม่หายไปเฉย ๆ สาระต้องย้ายไปอยู่ในมุมมองจากห้องตรวจ
      for(const w of mustSay)
        assert.ok((d.doc || '').includes(w), `${en} ลบกล่องแล้วแต่ไม่ได้เขียน "${w}" ไว้ที่ไหนเลย`);
    }
  }
});

/* ที่ยังเก็บกล่องไว้ ต้องมีเหตุผลจริง คือปลายทางเกณฑ์ไม่เท่ากัน */
test('ที่ยังเหลือกล่อง ต้องเป็นเคสที่ปลายทางเกณฑ์ต่างกันจริง', () => {
  const withBox = DEF.groups.flatMap(g => g.diseases).filter(d => d.elsewhere);
  const allowed = new Set([
    'Coronary Artery Disease requiring Angioplasty',   // ปลายทางต้องตีบสองเส้น เกณฑ์ไม่เท่ากันจริง
  ]);
  for(const d of withBox)
    assert.ok(allowed.has(d.en), `${d.en} ยังมีกล่องอยู่ ทั้งที่ไม่ได้อยู่ในรายการที่ตกลงว่าเกณฑ์ต่างกัน`);
  assert.equal(withBox.length, allowed.size, 'จำนวนข้อที่เหลือกล่องไม่ตรงกับที่ตกลงไว้');
});

test('เครื่องกระตุ้นกับเครื่องกระตุกหัวใจ ต้องบอกว่าจ่ายครั้งเดียว ไม่ใช่ไม่คุ้มครอง', () => {
  const byEn = en => DEF.groups.flatMap(g => g.diseases).filter(d => d.en === en);
  for(const en of ['Cardiac pacemaker implantation', 'Cardiac defibrillator']){
    const list = byEn(en);
    assert.ok(list.length, `ไม่พบ ${en}`);
    for(const d of list){
      assert.ok(d.once && d.once.length, `${en} ต้องมีกล่องกันเคลมซ้ำ`);
      assert.ok(!d.exclusions, `${en} ต้องไม่มีกล่องข้อยกเว้นสีแดงแล้ว`);
    }
  }
  assert.match(html, /function dcareDefDiseaseHtml/);
  assert.match(html, /class="once-tag">จ่ายได้ครั้งเดียว ไม่ใช่ไม่คุ้มครอง/);
});

/* ป้ายหัวข้อของโรคระยะเริ่มต้นเป็นสีเหลือง กล่องเกณฑ์ข้างในต้องเป็นสีเดียวกัน
   ถ้าเป็นสีเขียวจะสื่อว่าซื้อแบบเฉพาะระยะรุนแรงก็เคลมได้ ซึ่งไม่จริง */
test('กล่องเกณฑ์ของโรคระยะเริ่มต้นต้องเป็นสีเหลือง ไม่ใช่เขียว', () => {
  assert.match(html, /const early = d\.stage === 'early';/);
  assert.match(html, /early \? 'def-must-early' : 'def-must'/);
  assert.match(html, /\.def-must-early\{background:#fff8ec;border-left:3px solid #d99b3f;\}/);
});

/* คำถามที่ลูกค้าถามตรง ๆ คือ ฉีดสีเฉย ๆ เคลมได้ไหม
   คำตอบคือไม่ได้ และห้ามเขียนกำกวมจนอ่านแล้วคิดว่าได้ */
test('การฉีดสีเฉย ๆ ต้องบอกชัดว่าไม่ใช่เหตุการณ์ที่จ่าย พร้อมเกณฑ์ของทางออกอีกข้อ', () => {
  const list = DEF.groups.flatMap(g => g.diseases)
    .filter(d => d.en === 'Coronary Artery Disease requiring Angioplasty');
  assert.ok(list.length, 'ไม่พบโรค');
  for(const d of list){
    const red = (d.exclusions || []).join(' ');
    assert.ok(red.includes('Diagnostic angiography'), 'การฉีดสีเฉย ๆ ต้องอยู่ในกล่องที่บอกว่าไม่จ่าย');
    assert.match(d.exclusionsTitle || '', /ไม่ใช่เหตุการณ์ที่สัญญาจ่าย/);
    assert.ok(!d.exclusionsTone, 'กล่องนี้ต้องเป็นสีแดง ไม่ใช่เหลือง');

    // ทางออกอีกข้อมีเกณฑ์เข้มกว่า ถ้าไม่บอกจะกลายเป็นสัญญาว่าเคลมได้เสมอ
    // เงื่อนไขต้องเขียนให้ลูกค้าเอาไปเทียบกับผลตรวจตัวเองได้ ไม่ใช่ประโยคนามธรรม
    const title = d.elsewhereTitle || '';
    assert.ok(title.includes('ไม่ได้ถ่างบอลลูนหรือใส่ขดลวด'), 'หัวข้อต้องเริ่มจากเงื่อนไขที่ลูกค้าเช็คเองได้');
    assert.ok(title.includes('ตีบตั้งแต่ 2 เส้นขึ้นไป') && title.includes('อย่างน้อยร้อยละ 60'),
      'หัวข้อต้องบอกเกณฑ์ 2 เส้น และ 60% ให้ครบ');
    const y = (d.elsewhere || []).join(' ');
    assert.ok(y.includes('อย่างน้อย 2 เส้น'), 'ต้องบอกว่าข้อรักษาด้วยยาต้องตีบสองเส้น');
    assert.ok(y.includes('Left Main Stem') && y.includes('ไม่นับแขนงย่อย'), 'ต้องระบุว่าเส้นไหนนับบ้าง');
    assert.ok(y.includes('รักษาด้วยยาเท่านั้น'), 'ต้องบอกเงื่อนไขว่าต้องรักษาด้วยยาเท่านั้น');
    assert.ok(y.includes('invasive coronary arteriography'), 'ต้องบอกว่า CT ไม่เข้าเกณฑ์');

    // ช่องว่างจริงที่ทำให้ไม่ได้เงินเลย ต้องเขียนไว้ให้ตัวแทนใช้ ไม่ใช่ปล่อยให้ไปเจอตอนเคลม
    assert.match(d.doc || '', /ไม่ได้เงินจากข้อไหนเลย/);
    assert.match(d.doc || '', /ตีบเส้นเดียว/);
  }
});

/* การซ่อมลิ้นหัวใจที่ไม่ได้ถ่างด้วยบอลลูนและไม่ได้ใส่อุปกรณ์ ไม่มีข้อไหนรับจริง
   จึงต้องเป็นสีแดง ไม่ใช่เหลือง เพราะบอกว่าไปเข้าข้ออื่นได้จะเป็นการสัญญาเกินจริง */
test('การซ่อมลิ้นที่ไม่เข้าเงื่อนไขทั้งสองข้อ ต้องเป็นสีแดง', () => {
  const list = all.filter(d => d.en === 'Percutaneous valve replacement or device repair');
  assert.ok(list.length);
  for(const d of list){
    assert.ok(!d.elsewhere, 'ต้องไม่บอกว่าไปเข้าข้ออื่น เพราะไม่มีข้อไหนรับ');
    const red = (d.exclusions || []).join(' ');
    assert.ok(red.includes('ไม่ได้ถ่างด้วยบอลลูน'), 'ต้องระบุว่าเป็นการซ่อมที่ไม่ได้ใช้บอลลูน');
    assert.ok(!red.includes('การใช้บอลลูนขยายลิ้นหัวใจผ่านทางหลอดเลือด'),
      'บอลลูนตรงเป๊ะกับอีกข้อ ต้องถูกตัดออกจากกล่องแล้ว');
    assert.match(d.doc || '', /ถ่างด้วยบอลลูน/);
    assert.match(d.doc || '', /ไม่เข้าข้อไหนเลย/);
  }
});

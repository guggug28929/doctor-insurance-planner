import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* CI Perfect Care แบ่งความรุนแรงเป็น 3 ระยะต่อโรค ต่างจาก ดี แคร์ ที่มี 2
   ถ้าคัดนิยามมาไม่ครบระยะ ลูกค้าจะไม่รู้ว่าเคสของตัวเองเข้าระยะไหน
   และตัวเลขเกณฑ์ทุกตัวคือสิ่งที่ตัดสินว่าเคลมได้หรือไม่ได้ */

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const DEF = JSON.parse(readFileSync(new URL('../data/cipc-definitions.json', import.meta.url), 'utf8'));
const all = JSON.stringify(DEF);
const byEn = en => DEF.diseases.find(d => d.en === en);

test('ต้องคัดครบทั้ง 36 โรค ไม่มีเลขข้อหาย', () => {
  assert.equal(DEF.diseases.length, 36, `คัดมา ${DEF.diseases.length} โรค`);
  const nums = DEF.diseases.map(d => d.n).sort((a, b) => a - b);
  assert.deepEqual(nums, Array.from({length: 36}, (_, i) => i + 1));
  assert.deepEqual(DEF._meta.missing, [], 'ต้องไม่มีข้อที่ยังไม่ได้คัด');
});

test('ทุกโรคต้องมีอย่างน้อยหนึ่งระยะ และทุกระยะต้องมีเนื้อความจริง', () => {
  const ok = new Set(['early', 'mid', 'severe']);
  for(const d of DEF.diseases){
    assert.ok(d.stages && d.stages.length, `${d.en} ไม่มีระยะเลย`);
    assert.ok(['cancer','cardio','organ','neuro','other'].includes(d.group), `${d.en} กลุ่มไม่ถูกต้อง`);
    for(const s of d.stages){
      assert.ok(ok.has(s.stage), `${d.en} ระยะไม่ถูกต้อง (${s.stage})`);
      assert.ok(s.th && s.en, `${d.en} ระยะ ${s.stage} ขาดชื่อ`);
      const full = (s.body || '') + (s.criteria || []).join('') + (s.extra || '') + (s.exclusions || []).join('');
      assert.ok(full.length > 120, `${d.en} ระยะ ${s.stage} เนื้อความสั้นเกินไป น่าจะถูกย่อ`);
      if(s.criteria) assert.ok(s.criteriaTitle, `${d.en} ระยะ ${s.stage} มีเกณฑ์แต่ไม่มีหัวข้อ`);
      if(s.exclusions) assert.ok(s.exclusionsTitle, `${d.en} ระยะ ${s.stage} มีข้อยกเว้นแต่ไม่มีหัวข้อ`);
    }
    // ลำดับระยะต้องเรียงจากเบาไปหนัก ไม่งั้นลูกค้าอ่านแล้วสับสน
    const order = {early: 0, mid: 1, severe: 2};
    const seq = d.stages.map(s => order[s.stage]);
    assert.deepEqual(seq, [...seq].sort((a, b) => a - b), `${d.en} เรียงระยะสลับกัน`);
  }
});

/* ตัวเลขเกณฑ์คือสิ่งที่ตัดสินการเคลม ถ้าพิมพ์ผิดตัวเดียวคือให้ข้อมูลผิด */
test('ตัวเลขเกณฑ์สำคัญต้องตรงกับกรมธรรม์', () => {
  const pairs = [
    ["Alzheimer's disease", ['Mini-mental', 'ต่ำกว่า 20 จากทั้งหมด 30 คะแนน', 'ตั้งแต่ 3 อย่างขึ้นไป']],
    ['Aplastic Anemia', ['neutrophil ต่ำกว่า 500', 'platelet) ต่ำกว่า 20,000', 'reticulocyte) ต่ำกว่า 20,000']],
    ['Bacterial Meningitis', ['อย่างน้อย 60 วัน', 'ตั้งแต่ 1 อย่างขึ้นไป']],
    ['Blindness', ['3/60', '10 องศา', '6/60', 'Snellen']],
    ['Cancer', ['Basement Membrane', 'T1N0M0', 'RAI ระยะที่ 3', 'Radical Surgery']],
    ['Acute Heart Attack', ['อย่างน้อย 3 เท่าของค่าบนของค่าช่วงปกติ', 'อย่างน้อย 2 เท่าของค่าบนของค่าช่วงปกติ', 'ครบทั้ง 3 ข้อ']],
    ['Chronic Kidney Failure', ['eGFR ต่ำกว่า 15 ml/min/1.73m²', '6 เดือน', 'ไตวายเรื้อรังทั้ง 2 ข้าง']],
    ['Coma', ['48 ชั่วโมง', '72 ชั่วโมง', '96 ชั่วโมง', '30 วัน']],
    ['Loss of Hearing', ['60 เดซิเบล', '80 เดซิเบล', '180 วัน']],
    ['Major Burn', ['ระดับ 2', 'ร้อยละ 20', 'ร้อยละ 50 ของใบหน้า', 'Third degree burn']],
    ['Major Stroke', ['45 วัน', 'ไม่รวมถึงอาการชา', 'CT Scan', 'MRI']],
    ['Severe COPD / End-stage Lung disease', ['55 มิลลิเมตรปรอท', 'FEV 1', 'น้อยกว่า 1 ลิตร']],
    ['Total and permanent disability - TPD', ['ตั้งแต่ 3 อย่างขึ้นไป', '180 วัน']],
    ['Loss of speech', ['12 เดือน', '3 เดือน', 'ICU']],
  ];
  for(const [en, keys] of pairs){
    const d = byEn(en);
    assert.ok(d, `ไม่พบโรค ${en}`);
    const s = JSON.stringify(d);
    for(const k of keys) assert.ok(s.includes(k), `${en} ขาดเกณฑ์ "${k}"`);
  }
});

/* ศัพท์เทคนิคต้องมีคำอธิบายไทย ไม่งั้นลูกค้าข้ามส่วนที่สำคัญที่สุดไปเลย */
test('ศัพท์เทคนิคต้องมีคำอธิบายภาษาไทยกำกับ', () => {
  const pairs = [
    ['Cardiac Troponin', 'เอนไซม์ที่รั่วออกมาเมื่อกล้ามเนื้อหัวใจตาย'],
    ['CKMB', 'เอนไซม์หัวใจอีกตัวหนึ่ง'],
    ['Basement Membrane', 'แผ่นเยื่อบางที่กั้นใต้เซลล์ผิว'],
    ['Echocardiogram', 'อัลตราซาวด์หัวใจ'],
    ['NYHA', 'เกณฑ์แบ่งระดับความสามารถในการใช้ชีวิตของคนไข้โรคหัวใจ'],
    ['eGFR', 'ค่าประเมินอัตราการกรองของไต'],
    ['Ascites', 'น้ำในช่องท้อง'],
    ['Encephalopathy', 'สมองทำงานผิดปกติจากของเสียคั่ง'],
    ['Recipient', 'ไม่ใช่ผู้บริจาค'],
    ['Transient Ischemic Attack', 'สมองขาดเลือดชั่วคราวที่อาการหายเองได้'],
    ['Graft', 'ท่อเทียม'],
    ['Veno-cava Filter', 'ตะแกรงดักลิ่มเลือด'],
    ['Mini-mental', 'แบบทดสอบคัดกรองภาวะสมองเสื่อม'],
  ];
  for(const [term, thai] of pairs)
    assert.ok(all.includes(thai), `ศัพท์ ${term} ยังไม่มีคำอธิบายไทยกำกับ`);
});

/* จุดที่ต่างจาก ดี แคร์ อย่างมีนัยต่อการขาย ต้องถูกชี้ไว้ให้ตัวแทนใช้ได้ */
test('ต้องชี้จุดที่คุ้มครองกว้างกว่า ดี แคร์ ไว้ให้ตัวแทนใช้', () => {
  const docs = DEF.diseases.filter(d => d.doc).map(d => d.doc).join(' ');
  assert.ok(DEF.diseases.filter(d => d.doc).length >= 6, 'ควรมีมุมมองจากห้องตรวจอย่างน้อย 6 โรค');
  assert.match(docs, /MIDCAB/);
  assert.match(docs, /กระจกตา/);
  assert.match(docs, /เครื่องกระตุ้นหรือเครื่องกระตุกหัวใจ/);
});

test('หน้าแผน CI Perfect Care ต้องแสดงส่วนนิยามจริง พร้อมแท็บและป้าย 3 ระยะ', () => {
  assert.match(html, /detailSections: \(\) => cipcDefinitionsSection\(\)/);
  assert.match(html, /function cipcDefinitionsSection\(\)\{/);
  assert.match(html, /function setCipcDefTab\(key\)\{/);
  assert.match(html, /const CIPC_STAGE = \{/);
  for(const k of ['sb-early', 'sb-mid', 'sb-both']) assert.ok(html.includes(k), `ขาดสีป้าย ${k}`);
  assert.match(html, /cipc-definitions\.json\?v=' \+ DATA_VERSION/);
  // โหลดไม่ได้ต้องไม่แสดงอะไรเลย ดีกว่าแสดงนิยามที่ไม่ครบ
  assert.match(html, /if\(!CIPC_DEF \|\| !CIPC_DEF\.diseases \|\| !CIPC_DEF\.diseases\.length\) return '';/);
  assert.match(html, /แผนนี้แบ่งความรุนแรงเป็น 3 ระยะ/);
});

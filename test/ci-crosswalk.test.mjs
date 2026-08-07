import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* ตารางเทียบนิยามรายโรคในหน้า /plans/compare-ci

   ความเสี่ยงของฟีเจอร์นี้ไม่ใช่เรื่องหน้าตา แต่คือการบอกลูกค้าว่า "แบบนี้ไม่คุ้มครองโรคนี้"
   ทั้งที่จริงคุ้มครอง เพียงแต่กรมธรรม์เรียกชื่ออื่น เช่น Multiple CI เรียกกล้ามเนื้อหัวใจตาย
   เฉียบพลันว่า "หัวใจวาย" ถ้าจับคู่ไม่ครบ ช่องจะว่างแล้วกลายเป็นข้อมูลเท็จที่ใช้ตัดสินใจซื้อ
   เทสต์ชุดนี้จึงบังคับสองอย่าง
     1) ชื่อโรคทุกตัวที่ไฟล์แมปอ้าง ต้องมีอยู่จริงในไฟล์นิยามของแบบนั้น
     2) โรคทุกตัวในทั้งสี่ไฟล์นิยาม ต้องถูกอ้างในไฟล์แมปอย่างน้อยหนึ่งครั้ง ห้ามมีตัวตกหล่น */

const u = p => new URL(p, import.meta.url);
const J = p => JSON.parse(readFileSync(u(p), 'utf8'));
const html = readFileSync(u('../index.html'), 'utf8');

const XW = J('../data/ci-crosswalk.json');
const LTP = J('../data/ltp-definitions.json');
const CIPC = J('../data/cipc-definitions.json');
const MCI = J('../data/mci-definitions.json');
const DCARE = J('../data/dcare-definitions.json');

const PLANS = ['ltp', 'cipc', 'dcare', 'mci'];

// รายชื่อโรคของแต่ละแบบ · D Care ตัดกลุ่มยอดฮิตออกเพราะเป็นชุดที่หยิบโรคจากกลุ่มอื่นมาขายรวม
// ถ้านับซ้ำจะทำให้ตัวเลขความครบถ้วนเพี้ยน
const SRC = {
  ltp: LTP.diseases.map(d => d.th),
  cipc: CIPC.diseases.map(d => d.th),
  mci: MCI.diseases.map(d => d.th),
  dcare: [...new Set(DCARE.groups.filter(g => g.key !== 'popular')
    .flatMap(g => g.diseases.map(d => d.th)))],
};

test('ชื่อโรคทุกตัวที่ไฟล์แมปอ้าง ต้องมีอยู่จริงในไฟล์นิยามของแบบนั้น', () => {
  const bad = [];
  for(const c of XW.concepts)
    for(const p of PLANS)
      for(const n of (c.plans[p] || []))
        if(!SRC[p].includes(n)) bad.push(`${c.id} · ${p} · ${n}`);
  assert.deepEqual(bad, [], 'อ้างชื่อโรคที่ไม่มีในไฟล์นิยาม แปลว่าพิมพ์ผิดหรือไฟล์นิยามถูกแก้ชื่อไปแล้ว');
});

test('โรคทุกตัวในทั้งสี่ไฟล์นิยาม ต้องถูกอ้างในไฟล์แมป ห้ามตกหล่น', () => {
  const used = Object.fromEntries(PLANS.map(p => [p, new Set()]));
  for(const c of XW.concepts)
    for(const p of PLANS)
      for(const n of (c.plans[p] || [])) used[p].add(n);
  for(const p of PLANS){
    const miss = SRC[p].filter(n => !used[p].has(n));
    assert.deepEqual(miss, [], `โรคของ ${p} ที่ยังไม่มีในตารางเทียบ จะหายไปจากหน้าเว็บทั้งที่กรมธรรม์คุ้มครอง`);
  }
});

test('ทุกคอนเซ็ปต์ต้องมีอย่างน้อยหนึ่งแบบที่คุ้มครอง และมีกลุ่มที่รู้จัก', () => {
  const groups = Object.keys(XW._meta.groups);
  for(const c of XW.concepts){
    assert.ok(PLANS.some(p => (c.plans[p] || []).length), `${c.id} ไม่มีแบบไหนคุ้มครองเลย ไม่ควรมีแถวนี้`);
    assert.ok(groups.includes(c.group), `${c.id} อยู่กลุ่ม ${c.group} ซึ่งไม่มีใน _meta.groups`);
    assert.ok(c.th && c.th.trim(), `${c.id} ไม่มีชื่อโรคภาษาไทย`);
  }
  const ids = XW.concepts.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length, 'มี id ซ้ำ ทำให้แถวทับกัน');
});

test('ป้ายยอดฮิตของ D Care ต้องตรงกับกลุ่มยอดฮิตจริงในไฟล์นิยาม', () => {
  const pop = new Set(DCARE.groups.find(g => g.key === 'popular').diseases.map(d => d.th));
  for(const c of XW.concepts){
    const want = (c.plans.dcare || []).some(n => pop.has(n));
    assert.equal(!!c.popular, want, `${c.id} ป้ายยอดฮิตไม่ตรงกับไฟล์นิยาม D Care`);
  }
  assert.equal(XW.concepts.filter(c => c.popular).length, pop.size,
    'จำนวนโรคที่ติดป้ายยอดฮิต ต้องเท่ากับจำนวนโรคในกลุ่มยอดฮิตจริง');
});

test('ไฟล์แมปต้องไม่เก็บระยะที่จ่ายหรือเปอร์เซ็นต์ซ้ำจากไฟล์นิยาม', () => {
  // ถ้าวันหนึ่งมีคนเผลอใส่ stage/pct ลงไฟล์แมป จะกลายเป็นข้อมูลสองชุดที่หลุดจากกันได้
  for(const c of XW.concepts){
    for(const k of ['stage', 'pct', 'stages', 'group_label'])
      assert.ok(!(k in c), `${c.id} มีคีย์ ${k} ซึ่งต้องอ่านสดจากไฟล์นิยามเท่านั้น`);
    assert.deepEqual(Object.keys(c.plans).sort(), [...PLANS].sort());
    for(const p of PLANS) assert.ok(Array.isArray(c.plans[p]), `${c.id}.plans.${p} ต้องเป็น array`);
  }
});

test('หน้าเทียบโรคร้ายแรงต้องมีปุ่มเปิดป๊อปอัพ และป๊อปอัพต้องอ่านค่าจากไฟล์นิยามสด', () => {
  assert.match(html, /id="ciXw"/, 'ไม่มีกล่องป๊อปอัพ');
  assert.match(html, /id="ciXwOpen"/, 'ไม่มีที่วางปุ่มเปิดในหน้าเทียบ');
  assert.match(html, /renderCiXwOpeners\(\);/, 'หน้าเทียบไม่ได้เรียกสร้างปุ่ม');
  assert.match(html, /function openCiXw\(/);
  assert.match(html, /function closeCiXw\(/);
  assert.match(html, /ci-crosswalk\.json\?v=' \+ DATA_VERSION/, 'ไม่ได้โหลดไฟล์แมปพร้อม cache busting');
  // ช่องในตารางต้องไปหยิบจากไฟล์นิยาม ไม่ใช่พิมพ์ป้ายค้างไว้
  const fn = html.slice(html.indexOf('function ciXwCell('), html.indexOf('let ciXwTab'));
  assert.match(fn, /ciXwFind\(plan, n\)/, 'ต้องค้นจากไฟล์นิยามจริง');
  assert.match(fn, /CIPC_STAGE\[s\]\.label/, 'ป้ายระยะของ CI Perfect ต้องอ่านจากทะเบียนเดียวกับหน้าแผน');
  // ไลฟ์ไทม์จ่ายไม่เท่ากันทุกโรค (150/100/50/25) จึงห้ามพิมพ์ค้าง ต้องอ่านจากไฟล์นิยามรายโรค
  // ส่วน Multiple CI จ่าย 100% ทุกโรคเท่ากันตามโครงสร้างของแบบ ไม่ใช่ค่ารายโรค เขียนตรง ๆ ได้
  const ltpBranch = fn.slice(fn.indexOf("if(plan === 'ltp')"), fn.indexOf("} else if(plan === 'cipc')"));
  assert.match(ltpBranch, /d\.pct/, 'เปอร์เซ็นต์ของไลฟ์ไทม์ต้องอ่านจากไฟล์นิยาม');
  assert.ok(!/150%|50%|25%/.test(ltpBranch), 'ห้ามพิมพ์เปอร์เซ็นต์รายโรคของไลฟ์ไทม์ค้างไว้ในโค้ด');
  // ต้องเตือนเรื่อง D Care ขายเป็นกลุ่ม ไม่งั้นลูกค้าเข้าใจว่าซื้อ D Care แล้วได้ทุกโรค
  assert.match(fn, /ต้องซื้อกลุ่ม/);
});

test('ป๊อปอัพต้องบอกด้วยว่าแบบไหนไม่ได้อยู่ในตาราง จะได้ไม่เข้าใจว่าเทียบครบทุกแบบแล้ว', () => {
  const box = html.slice(html.indexOf('<div id="ciXw"'), html.indexOf('<!-- ============ PAGE'));
  for(const s of ['คุ้มครองโรคมะเร็ง', 'Care Plus', 'ค่ารักษาตามจริง'])
    assert.ok(box.includes(s), `ป๊อปอัพไม่ได้บอกเรื่อง ${s}`);
  assert.ok(box.includes('ไม่ใช่ข้อมูลยังไม่ครบ'), 'ต้องอธิบายว่าช่องว่างแปลว่าอะไร');
});

test('ต้องเทียบ 4 แบบที่มีไฟล์นิยาม และเรียงหัวตารางตรงกับที่โค้ดใช้', () => {
  assert.deepEqual(XW._meta.plans.map(p => p.key), PLANS);
  assert.match(html, /const CI_XW_PLANS = \['ltp', 'cipc', 'dcare', 'mci'\];/);
  for(const p of XW._meta.plans){
    assert.ok(p.name && p.short, `แผน ${p.key} ข้อมูลไม่ครบ`);
    assert.ok(html.includes(p.route), `ไม่พบเส้นทาง ${p.route} ในเว็บ`);
  }
});

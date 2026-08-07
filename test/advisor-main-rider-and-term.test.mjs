import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* สองกฎที่ผู้ช่วยจัดแผนเคยไม่รู้จัก และทำให้ตัวแทนได้ใบเสนอที่ใช้ไม่ได้จริง
   1) สัญญาหลัก 99/20 ทุนต่ำกว่า 1 ล้าน บริษัทบังคับให้แนบโรคร้ายแรงหรืออุบัติเหตุ
      ถ้าบันไดตัดของจนไม่เหลืออะไรแนบ แพ็กเกจนั้นยื่นไม่ผ่าน
   2) ประกันชีวิตแบบชั่วระยะเวลาที่คุ้มครองสั้นกว่าภาระของลูกค้า
      เดิมแบบ 1/1 ชนะทุกครั้งเพราะเรียงตามเบี้ยต่อทุนหนึ่งล้าน ทั้งที่คุ้มครองปีเดียว */

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function grab(marker){
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, `ไม่พบ ${marker}`);
  let depth = 0;
  for(let i = html.indexOf('{', start); i < html.length; i++){
    if(html[i] === '{') depth++;
    else if(html[i] === '}'){ depth--; if(depth === 0) return html.slice(start, i + 1); }
  }
  throw new Error(`วงเล็บไม่ครบสำหรับ ${marker}`);
}
function grabArray(name){
  const start = html.indexOf(`const ${name} = [`);
  assert.notEqual(start, -1, `ไม่พบ ${name}`);
  let depth = 0;
  for(let i = html.indexOf('[', start); i < html.length; i++){
    if(html[i] === '[') depth++;
    else if(html[i] === ']'){ depth--; if(depth === 0) return html.slice(start, i + 1) + ';'; }
  }
  throw new Error(`วงเล็บไม่ครบสำหรับ ${name}`);
}

/* ---------- กฎสัญญาหลัก 99/20 ---------- */

const ctx = vm.createContext({Math, Number, Array, Object, String});
vm.runInContext([
  grabArray('ADV_MAIN_LEVELS'),
  'const fmt = n => String(n);',
  'let CAN_PRICE = () => true;',
  'function advCanPrice(it, input){ return CAN_PRICE(it, input); }',
  grab('const ADV_MAIN_RIDER_REQUIRED_BELOW'),
  grab('function advMainNeedsRider(level)'),
  grab('function advHasAttachableRider(state)'),
  grab('function advFixMainRiderRule(state)'),
  'this.L = ADV_MAIN_LEVELS;',
  'this.advMainNeedsRider = advMainNeedsRider;',
  'this.advFixMainRiderRule = advFixMainRiderRule;',
  'this.setCanPrice = f => { CAN_PRICE = f; };',
].join('\n').replace('const ADV_MAIN_RIDER_REQUIRED_BELOW', 'var ADV_MAIN_RIDER_REQUIRED_BELOW'), ctx);

const L = ctx.L;
const idxOf = cap => L.findIndex(x => x.capital === cap);

test('รู้ว่าขั้นไหนของสัญญาหลักที่บริษัทบังคับให้แนบสัญญาเพิ่มเติม', () => {
  L.forEach((m, i) => {
    const need = ctx.advMainNeedsRider(i);
    assert.equal(need, m.plan === '99_20' && m.capital < 1000000,
      `${m.label} ประเมินข้อบังคับผิด`);
  });
  // 99/99 ไม่มีข้อบังคับนี้ จึงใช้เป็นทางออกได้
  assert.ok(L.some(m => m.plan === '99_99'), 'ต้องมีแบบ 99/99 ไว้เป็นทางออก');
});

test('99/20 ทุนต่ำ แล้วไม่เหลืออะไรแนบ ต้องย้ายไป 99/99 ไม่ใช่ปล่อยผ่าน', () => {
  ctx.setCanPrice(() => true);
  const state = {mainLevel: idxOf(200000), ci: [], paPlan: null, input: {}};
  const msg = ctx.advFixMainRiderRule(state);
  assert.ok(msg, 'ต้องคืนข้อความอธิบายให้ตัวแทนเห็นว่าเปลี่ยนแบบเพราะอะไร');
  assert.equal(L[state.mainLevel].plan, '99_99');
  assert.equal(ctx.advMainNeedsRider(state.mainLevel), false);
});

test('ยังมีโรคร้ายแรงหรือ PA เหลืออยู่ ต้องไม่ย้ายแบบโดยไม่จำเป็น', () => {
  for(const s of [
    {mainLevel: idxOf(200000), ci: [{kind:'cipc', capital:500000}], paPlan: null, input: {}},
    {mainLevel: idxOf(200000), ci: [], paPlan: '3', input: {}},
    {mainLevel: idxOf(200000), ci: [{kind:'careplus', plan:'cackd'}], paPlan: null, input: {}},
  ]){
    const before = s.mainLevel;
    assert.equal(ctx.advFixMainRiderRule(s), null);
    assert.equal(s.mainLevel, before, 'ไม่ควรเปลี่ยนแบบสัญญาหลัก');
  }
});

test('ทุนหลักตั้งแต่ 1 ล้านขึ้นไป ไม่ติดข้อบังคับนี้', () => {
  const big = L.findIndex(m => m.plan === '99_20' && m.capital >= 1000000);
  if(big >= 0) assert.equal(ctx.advMainNeedsRider(big), false);
  // ขั้นที่มีอยู่ตอนนี้ทุกขั้นของ 99/20 ต่ำกว่า 1 ล้าน จึงต้องพึ่ง 99/99 เสมอ
  assert.ok(L.filter(m => m.plan === '99_20').every(m => m.capital < 1000000));
});

test('อายุที่ทำ 99/99 ไม่ได้ ต้องไม่ย้ายไปแบบที่ตีราคาไม่ได้', () => {
  ctx.setCanPrice(it => it.plan === '99_20');
  const state = {mainLevel: idxOf(200000), ci: [], paPlan: null, input: {}};
  assert.equal(ctx.advFixMainRiderRule(state), null, 'ไม่มีทางออกก็ต้องไม่แกล้งย้าย');
  assert.equal(L[state.mainLevel].capital, 200000);
  ctx.setCanPrice(() => true);
});

test('ทุกจุดที่บันไดตัดของออก ต้องเรียกกฎนี้ซ้ำ', () => {
  // ตัดโรคร้ายแรงออก 2 จุด และตัด PA ออก 2 จุด
  const ciHits = html.match(/state\.ci\.splice\(extraIdx, 1\)\[0\];\s*\n\s*const mv = advFixMainRiderRule\(state\);/g) || [];
  assert.equal(ciHits.length, 2, `จุดตัดโรคร้ายแรงเรียกกฎนี้ ${ciHits.length} จุด ควรมี 2`);
  const paHits = html.match(/state\.paPlan = null;\s*\n\s*const mvPa\d? = advFixMainRiderRule\(state\);/g) || [];
  assert.equal(paHits.length, 2, `จุดตัด PA เรียกกฎนี้ ${paHits.length} จุด ควรมี 2`);
  assert.match(html, /advFixMainRiderRule\(state\);\s+\/\/ ลูกค้าเลือกไม่เอาโรคร้ายแรงตั้งแต่ต้น/);
  // กฎเดียวกับหน้าคำนวณเบี้ย ตัวเลขต้องไม่หลุดไปคนละค่า
  assert.match(html, /inp\.mainPlan === '99_20' && inp\.mainCapital < 1000000/);
  assert.match(html, /ADV_MAIN_RIDER_REQUIRED_BELOW = 1000000/);
});

/* ---------- ประกันชีวิตแบบชั่วระยะเวลา ---------- */

const lifeCtx = vm.createContext({Math, Number, Array, Object, String, Set, Infinity});
vm.runInContext([
  /* ตัดบรรทัด premiumOf ทิ้งทั้งบรรทัด เพราะเรียกฟังก์ชันคิดเบี้ยตัวจริงที่ไม่ได้โหลดมา
     เทสต์นี้สนใจแค่การกรองตัวเลือก ไม่ได้ตรวจเบี้ย
     ห้ามใช้ regex ตัดแค่บางส่วน เพราะ arrow body มีวงเล็บและจุลภาคซ้อนอยู่ */
  grabArray('LIFE_PRODUCTS').split('\n').filter(l => !/^\s*premiumOf\s*:/.test(l)).join('\n'),
  'const LIFE_RETIRE_AGE = 60;',
  grab('function lifeBucket('),
  grab('function lifeCoverYears('),
  grab('function lifeDefaultDependencyYears('),
  grab('function lifeCandidates(st)'),
  'this.lifeCandidates = lifeCandidates;',
  'this.LIFE_PRODUCTS = LIFE_PRODUCTS;',
  'this.lifeCoverYears = lifeCoverYears;',
  'this.lifeBucket = lifeBucket;',
].join('\n'), lifeCtx);

const ids = st => lifeCtx.lifeCandidates(st).map(p => p.id);

test('คนที่ต้องดูแลครอบครัวอีกหลายปี ต้องไม่ได้แบบคุ้มครองปีเดียวมาเป็นตัวเลือก', () => {
  for(const age of [25, 30, 35, 40, 45]){
    const got = ids({age, purpose:'family'});
    assert.ok(!got.includes('easy_protection_1_1'),
      `อายุ ${age} ยังมีแบบ 1/1 หลุดมาเป็นตัวเลือก`);
  }
});

test('ภาระสั้นจริง ๆ แบบ 1/1 ต้องยังเลือกได้ ไม่ใช่ตัดทิ้งถาวร', () => {
  const got = ids({age:40, purpose:'family', dependencyYears:1});
  assert.ok(got.includes('easy_protection_1_1'),
    'ลูกค้าที่ต้องการคุ้มครองแค่ปีเดียว เช่นค้ำสินเชื่อระยะสั้น ต้องยังเลือกแบบนี้ได้');
});

test('ไม่มีแบบไหนคุ้มครองยาวพอ ต้องเก็บแบบที่ยาวที่สุดไว้ ไม่ใช่เหลือศูนย์ตัวเลือก', () => {
  const st = {age:25, purpose:'family'};   // ต้องการราว 35 ปี แต่แบบชั่วระยะเวลายาวสุด 15 ปี
  const got = lifeCtx.lifeCandidates(st).filter(p => lifeCtx.lifeBucket(p) === 'temporary');
  assert.ok(got.length > 0, 'ต้องเหลือแบบชั่วระยะเวลาอย่างน้อยหนึ่งแบบ');
  const longest = Math.max(...got.map(p => lifeCtx.lifeCoverYears(p, st.age)));
  got.forEach(p => assert.equal(lifeCtx.lifeCoverYears(p, st.age), longest,
    `${p.id} สั้นกว่าแบบที่ยาวที่สุด ไม่ควรถูกเก็บไว้`));
  assert.ok(longest > 1, 'แบบที่เก็บไว้ต้องไม่ใช่แบบปีเดียว');
});

test('แบบคุ้มครองถาวรต้องไม่ถูกกรองทิ้งไปด้วย', () => {
  const got = lifeCtx.lifeCandidates({age:35, purpose:'family'});
  const perm = got.filter(p => lifeCtx.lifeBucket(p) !== 'temporary');
  assert.ok(perm.length >= 3, `เหลือแบบถาวรแค่ ${perm.length} แบบ การกรองกินของที่ไม่ควรกิน`);
});

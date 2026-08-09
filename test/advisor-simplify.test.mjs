import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* หน้าผู้ช่วยจัดแผนคือประตูแรกที่ลูกค้าใช้จริง
   ถามเยอะเกินไปลูกค้าปิดหนี ถามน้อยแล้วอ่านค่าไม่ครบก็คำนวณผิด
   ไฟล์นี้กันทั้งสองทาง คือคุมจำนวนคำถามที่เห็น และกันไม่ให้ช่องที่ตั้งค่าอัตโนมัติหายจาก DOM

   รอบล่าสุดตัดคำถามออกสามข้อ คือวงเงินสวัสดิการ ความเสี่ยงส่วนแรก และทุนโรคร้ายแรง
   ทั้งสามไม่ได้หายไปเฉย ๆ แต่ถูกเดาแทนจากคำตอบที่ถามไปแล้ว เทสต์จึงต้องคุมว่าเดาถูก */

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function sliceTag(src, openMarker, tag = 'div'){
  const start = src.indexOf(openMarker);
  assert.notEqual(start, -1, `ไม่พบ ${openMarker}`);
  const re = new RegExp(`<(/?)(?:${tag})\\b`, 'g');
  re.lastIndex = start;
  let depth = 0, m;
  while((m = re.exec(src))){
    depth += m[1] ? -1 : 1;
    if(depth === 0) return src.slice(start, re.lastIndex + 8);
  }
  throw new Error(`แท็กไม่ครบสำหรับ ${openMarker}`);
}

const healthTab = html.slice(html.indexOf('<div id="advTab-health">'), html.indexOf('<div id="aiPlannerOutput">'));
const autoBox = sliceTag(healthTab, '<div hidden>', 'div');
const visible = healthTab.replace(autoBox, '');

const AUTO_FIELDS = ['ai_groupCoverage', 'ai_opdNeed', 'ai_riskChoice', 'ai_ciCapital'];

test('หน้าจอต้องเหลือเฉพาะคำถามที่เดาแทนลูกค้าไม่ได้', () => {
  const ids = [...new Set([...visible.matchAll(/id="(ai_[A-Za-z]+)"/g)].map(m => m[1]))]
    .filter(id => id !== 'ai_ciCapitalHint');
  assert.deepEqual(ids.sort(), [
    'ai_birthYear', 'ai_budget', 'ai_ciStyle', 'ai_gender', 'ai_hasGroup', 'ai_ipdNeed',
  ].sort(), `คำถามที่โชว์อยู่: ${ids.join(', ')}`);
  // ห้ามหลุดกลับมาถามลูกค้าอีก เพราะสามข้อนี้คือต้นเหตุที่ฟอร์มยาวจนคนไม่อยากตอบ
  for(const id of AUTO_FIELDS)
    assert.ok(!visible.includes(`id="${id}"`), `${id} กลับมาโผล่บนหน้าจอแล้ว`);
});

test('ช่องที่ตั้งค่าอัตโนมัติต้องยังอยู่ใน DOM ครบ ไม่งั้นตัวอ่านค่าจะพัง', () => {
  for(const id of AUTO_FIELDS)
    assert.ok(autoBox.includes(`id="${id}"`), `${id} หายจากกล่องค่าอัตโนมัติ`);
  for(const id of [...AUTO_FIELDS, 'ai_ciStyle', 'ai_gender'])
    assert.ok(html.includes(`getElementById('${id}')`), `โค้ดยังอ่าน ${id} อยู่`);
});

test('เพศต้องเป็นปุ่มการ์ดที่ผูกกับ select ไม่ใช่ radio ลอย ๆ', () => {
  assert.ok(!/name="ai_gender"/.test(html), 'ยังมี radio เพศเหลืออยู่');
  assert.match(visible, /<div class="tap-group tap-2col" data-for="ai_gender">/);
  assert.match(visible, /<label class="first">เพศกำเนิด<\/label>/, 'ต้องใช้คำว่าเพศกำเนิด');
  assert.match(html, /function aiGender\(\)\{ return document\.getElementById\('ai_gender'\)\.value; \}/);
});

test('ระดับ IPD ต้องไม่มีตัวเลือกที่ให้ผลซ้ำกับตัวอื่น', () => {
  const sel = sliceTag(healthTab, '<select id="ai_ipdNeed"', 'select');
  const vals = [...sel.matchAll(/value="([a-z0-9]+)"/g)].map(m => m[1]);
  assert.deepEqual(vals, ['basic', 'balanced', 'elite20', 'elite75']);
  /* 'high' เคยให้วงเงิน 5 ล้านเท่ากับ 'balanced' ทุกทาง ไม่มีโค้ดไหนแยกสองค่านี้เลย
     เป็นตัวเลือกหลอกที่ทำให้ลูกค้าลังเลโดยไม่ได้อะไรกลับมา */
  assert.ok(!vals.includes('high'), 'ตัวเลือกวงเงินสูงที่ซ้ำกับสมดุลกลับมาแล้ว');
  assert.ok(!/ai_ipdNeed'\)\.value = 'high'|advSetTap\('ai_ipdNeed', 'high'\)/.test(html),
    'ยังมีโค้ดตั้งค่า ipdNeed เป็น high ซึ่งไม่มีตัวเลือกนี้แล้ว');
});

test('ค่าตั้งต้นของช่องอัตโนมัติต้องเป็นแบบที่ปลอดภัยที่สุด', () => {
  const risk = sliceTag(autoBox, '<select id="ai_riskChoice"', 'select');
  assert.match(risk, /<option value="none" selected>/,
    'ยังไม่ได้ตอบว่ามีสวัสดิการ ต้องไม่แถม Deductible ให้ก่อน');
  const opd = sliceTag(autoBox, '<select id="ai_opdNeed"', 'select');
  assert.match(opd, /<option value="none" selected>/, 'OPD ต้องตั้งต้นที่ไม่เน้น');
  assert.match(autoBox, /id="ai_groupCoverage" value="0"/);
});

/* ---------- ยุบคำถามสวัสดิการกับความเสี่ยงส่วนแรกเข้าด้วยกัน ---------- */

function runSync(fnName, dom){
  const ctx = vm.createContext({
    document: {
      getElementById: id => dom[id] || null,
      querySelector: () => null,
      querySelectorAll: () => [],
    },
    fmt: n => String(n),
  });
  const start = html.indexOf('const ADV_CI_MAX_BY_STYLE = {');
  const end = html.indexOf('function advPricedItems(');
  assert.ok(start > -1 && end > start);
  vm.runInContext(
    html.slice(html.indexOf('const ADV_CI_CAPITAL_BY_STYLE = {'), html.indexOf('function advSetTap('))
    + html.slice(start, end)
    + `\nthis.run = ${fnName};`, ctx);
  ctx.run();
  return dom;
}

test('ตอบว่ามีสวัสดิการ ต้องตั้งวงเงินและเปิดทาง Deductible ให้เอง', () => {
  const yes = runSync('advSyncGroupField', {
    ai_hasGroup: {value: 'yes'}, ai_groupCoverage: {value: 0}, ai_riskChoice: {value: 'none'},
  });
  assert.equal(Number(yes.ai_groupCoverage.value), 30000,
    'ต้องเท่ากับเกณฑ์ที่ตรรกะเดิมใช้ตัดสินว่าคุ้มจะใช้ Deductible');
  assert.equal(yes.ai_riskChoice.value, 'auto');

  const no = runSync('advSyncGroupField', {
    ai_hasGroup: {value: 'no'}, ai_groupCoverage: {value: 30000}, ai_riskChoice: {value: 'auto'},
  });
  assert.equal(Number(no.ai_groupCoverage.value), 0, 'ต้องล้างค่าเดิม ไม่งั้นสลับกลับมาแล้วคำนวณผิด');
  assert.equal(no.ai_riskChoice.value, 'none',
    'ไม่มีอะไรมารับส่วนแรกให้ จึงห้ามปล่อยเป็น auto ซึ่งอาจแถม Deductible มา');
});

/* ---------- ทุนโรคร้ายแรงขยับตามงบ แต่ต้องไม่เกินเพดานผลิตภัณฑ์ ---------- */

function capitalFor(style, budget){
  const dom = {
    ai_ciStyle: {value: style}, ai_ciCapital: {value: 0},
    ai_budget: {value: budget}, ai_ciCapitalHint: {textContent: ''},
  };
  runSync('advSyncCiCapital', dom);
  return Number(dom.ai_ciCapital.value);
}

test('งบมากขึ้น ทุนโรคร้ายแรงต้องขยับขึ้นตาม', () => {
  assert.equal(capitalFor('balanced', 50000), 1000000);
  assert.equal(capitalFor('balanced', 60000), 2000000);
  assert.equal(capitalFor('balanced', 119999), 2000000);
  assert.equal(capitalFor('balanced', 120000), 3000000);
  assert.equal(capitalFor('broad', 300000), 3000000, 'เพดานของแบบนี้คือ 3 ล้าน ไม่ไต่ขึ้นไปเรื่อย ๆ');
});

test('งบเยอะแค่ไหน ก็ห้ามดันทุนเกินเพดานที่ผลิตภัณฑ์เปิดขายจริง', () => {
  // D Care โหมดสองระยะเพดาน 2.5 ล้าน · Multiple CI เปิดขายสูงสุด 2 ล้าน
  assert.equal(capitalFor('budget', 500000), 2500000);
  assert.equal(capitalFor('multi', 500000), 2000000);
  // งบน้อยก็ยังต้องได้ทุนฐานของแบบนั้น ไม่ใช่ถูกกดลงเหลือ 1 ล้าน
  assert.equal(capitalFor('budget', 20000), 2500000);
  assert.equal(capitalFor('multi', 20000), 2000000);
  assert.equal(capitalFor('none', 500000), 0, 'ไม่เอาโรคร้ายแรงแล้วยังตั้งทุน จะคิดเบี้ยเกิน');
});

test('ทุกสไตล์ที่เลือกได้บนหน้าจอ ต้องมีทั้งทุนฐานและเพดาน', () => {
  const ctx = vm.createContext({});
  vm.runInContext(
    html.slice(html.indexOf('const ADV_CI_CAPITAL_BY_STYLE = {'), html.indexOf('function advSetTap('))
    + html.slice(html.indexOf('const ADV_CI_MAX_BY_STYLE = {'), html.indexOf('function advCiTargetByBudget('))
    + '\nthis.base = ADV_CI_CAPITAL_BY_STYLE; this.max = ADV_CI_MAX_BY_STYLE;', ctx);
  const styles = [...sliceTag(healthTab, '<select id="ai_ciStyle"', 'select')
    .matchAll(/value="([a-z]+)"/g)].map(m => m[1]);
  for(const s of styles){
    assert.ok(Number.isFinite(ctx.base[s]), `สไตล์ ${s} ไม่มีทุนฐาน`);
    assert.ok(Number.isFinite(ctx.max[s]), `สไตล์ ${s} ไม่มีเพดาน`);
    assert.ok(ctx.max[s] >= ctx.base[s], `สไตล์ ${s} เพดานต่ำกว่าทุนฐาน`);
  }
  assert.ok(!styles.includes('cancerckd'), 'ตัวเลือกหลอกกลับมาอยู่บนหน้าจออีกแล้ว');
  assert.ok(Number.isFinite(ctx.base.cancerckd) && Number.isFinite(ctx.max.cancerckd),
    'ยังต้องรองรับค่าเก่า');
  assert.equal(ctx.base.none, 0);
  assert.equal(ctx.base.budget, 2500000, 'ต้องเท่ากับเพดานทุนของ D Care โหมดสองระยะ');
  assert.equal(ctx.base.multi, 2000000, 'ต้องเท่ากับเพดานทุนที่ Multiple CI เปิดขายจริง');
});

test('ป้ายตัวเลือกโรคร้ายแรงต้องบอกสิ่งที่จะได้ และทุนต้องคิดใหม่เมื่อแก้งบ', () => {
  const sel = sliceTag(healthTab, '<select id="ai_ciStyle"', 'select');
  // ป้ายห้ามพิมพ์ทุนค้างไว้แล้ว เพราะทุนคิดจากงบที่ลูกค้ากรอก ต้องบอกกลไกการจ่ายแทน
  assert.ok(sel.includes('3 ระยะ'), 'ป้ายหลักต้องบอกว่าจ่ายไล่เป็นระยะ');
  assert.ok(!/ทุน 1 ล้าน|ทุน 2 ล้าน/.test(sel), 'ห้ามพิมพ์ทุนค้างบนป้าย ทุนขึ้นกับงบแล้ว');
  assert.ok(sel.includes('D Care ครบ 5 หมวด'), 'ต้องบอกว่าได้ครบหมวด ไม่ใช่แค่กลุ่มยอดฮิต');
  assert.ok(sel.includes('200% ของทุน'), 'ต้องบอกเพดานจ่ายจริงของโหมดสองระยะ');
  assert.ok(sel.includes('Multiple CI'), 'ต้องมีตัวเลือกชั้นที่สาม');
  assert.ok(sel.includes('onchange="advSyncCiCapital();"'), 'เลือกสไตล์แล้วทุนต้องเปลี่ยนตาม');
  // ทุนผูกกับงบแล้ว ถ้าไม่คิดใหม่ตอนแก้งบ ลูกค้าจะได้ทุนของงบเดิมค้างไว้
  assert.match(visible, /id="ai_budget"[^>]*oninput="advSyncCiCapital\(\);"/,
    'แก้งบแล้วต้องคิดทุนใหม่');
  assert.match(html, /if\(name === 'ai'\)\{[\s\S]*?advSyncCiCapital\(\);/,
    'เปิดหน้ามาต้องตั้งทุนให้ตรงกับสไตล์และงบตั้งต้นทันที');
  assert.ok(healthTab.includes('onchange="advSyncGroupField();"'));
});

/* ---------- ลำดับบนหน้า ---------- */

test('กล่องคำถามต้องอยู่เหนือกล่องหลักที่ระบบใช้ตัดสินใจ', () => {
  const q = healthTab.indexOf('id="ai_birthYear"');
  const info = healthTab.indexOf('หลักที่ระบบใช้ตัดสินใจ');
  assert.ok(q > -1 && info > -1);
  assert.ok(q < info, 'คำถามต้องมาก่อน ลูกค้าเข้ามาเพื่อจัดแผน ไม่ได้เข้ามาอ่านทฤษฎี');
});

test('ลำดับการตัดเมื่อเบี้ยเกินงบต้องพับไว้ ไม่กางยาวรกหน้า', () => {
  assert.match(html, /<details class="ig-part ig-fold">/);
  assert.match(html, /<summary><span class="ig-h-n">2<\/span> ถ้าเบี้ยเกินงบ ระบบจะตัดตามลำดับนี้<\/summary>/);
  assert.match(html, /\.ig-fold > summary\{/);
  assert.match(html, /ADV_CUT_STEPS\.map\(s => `/);
  assert.ok(html.includes('ตัดจากบนลงล่าง หยุดทันทีที่เบี้ยเข้างบ'));
});

/* ---------- กันตัวเลือกหลอก ----------
   หน้านี้เคยมีตัวเลือกที่กดแล้วได้ผลเหมือนตัวอื่นเป๊ะ ๆ มาแล้วสามตัว
   'กังวลมะเร็งและไต' · 'วงเงินสูง' ของ IPD · และ 'กว้างที่สุด' ของโรคร้ายแรง
   ตัวหลังแย่ที่สุดเพราะป้ายเขียนต่างกันจนลูกค้าเข้าใจว่าคุ้มครองกว้างกว่า ทั้งที่เป็นแบบเดียวกัน
   เทสต์นี้รันเครื่องจัดแผนจริงกับทุกตัวเลือกบนหน้าจอ แล้วบังคับว่าผลต้องไม่ซ้ำกัน */

test('ทุกตัวเลือกโรคร้ายแรงบนหน้าจอ ต้องให้ชุดสัญญาที่ต่างกันจริง', () => {
  const ctx = vm.createContext({});
  const from = html.indexOf('const ADV_DCARE_STAGE');
  const to = html.indexOf('function advPricedItems(');
  vm.runInContext(
    html.slice(html.indexOf('const DCARE_STAGES = {'), html.indexOf('};', html.indexOf('const DCARE_STAGES = {')) + 2)
    + 'const RATES = {multiple_ci:{allowed_capitals:[500000,1000000,2000000]}};\n'
    + html.slice(html.indexOf('const MCI_CAPITAL_COL'), html.indexOf('function multipleCiPremium('))
    + html.slice(html.indexOf('function multipleCiNearestCapital('), html.indexOf('// คืนเบี้ยรายปีจริง'))
    + html.slice(html.indexOf('function advCiItems('), html.indexOf('/* ---------- ชั้นที่ 1'))
    + html.slice(from, to)
    + '\nthis.advCiItems = advCiItems;', ctx);

  const styles = [...sliceTag(healthTab, '<select id="ai_ciStyle"', 'select')
    .matchAll(/value="([a-z]+)"/g)].map(m => m[1]);
  const seen = new Map();
  for(const s of styles){
    const items = ctx.advCiItems({ciStyle: s, ciCapital: 1000000}, [], {});
    // ลายเซ็นของชุดสัญญา ใช้ชนิดกับทุนเป็นตัวเทียบ ไม่สนใจลำดับ
    const sig = items.map(i => `${i.kind}:${i.capital || i.plan || ''}`).sort().join('|');
    assert.ok(!seen.has(sig),
      `ตัวเลือก "${s}" ให้ผลเหมือน "${seen.get(sig)}" ทุกอย่าง เป็นตัวเลือกหลอกที่ต้องถอดออก`);
    seen.set(sig, s);
  }
  assert.equal(seen.size, styles.length);
});

/* ---------- กล่องบำนาญอ่านค่าจากไฟล์ภาษีได้จริง ----------
   เคยพังบน production เพราะเดาว่า deductions เป็น array ทั้งที่เป็น object ซ้อนหลายชั้น
   กล่องนี้อยู่กลางหน้าที่ลูกค้าใช้ ถ้าอ่านค่าไม่ได้จะพังทั้งบล็อกผลลัพธ์ */
test('กฎลดหย่อนบำนาญต้องอ่านจากไฟล์ภาษีได้จริง ไม่ใช่ค่าที่พิมพ์ค้าง', () => {
  const rules = JSON.parse(readFileSync(new URL('../data/tax-rules.json', import.meta.url), 'utf8'));
  const ctx = vm.createContext({TAX_RULES: rules});
  vm.runInContext(html.slice(html.indexOf('function pensionDeductRule()'),
                             html.indexOf('function pensionIncomeAtRate('))
    + '\nthis.r = pensionDeductRule();', ctx);
  const g = rules.deductions.retirementGroup;
  assert.equal(ctx.r.groupCap, g.cap, 'เพดานรวมกลุ่มเกษียณต้องมาจากไฟล์');
  assert.equal(ctx.r.cap, 200000);
  assert.equal(ctx.r.pct, 0.15);
  // ต้องไม่พังถ้าโครงสร้างหาย ต้องตกกลับไปใช้ค่าตามกฎหมายแทน
  const ctx2 = vm.createContext({TAX_RULES: {}});
  vm.runInContext(html.slice(html.indexOf('function pensionDeductRule()'),
                             html.indexOf('function pensionIncomeAtRate('))
    + '\nthis.r = pensionDeductRule();', ctx2);
  assert.equal(ctx2.r.cap, 200000);
  assert.equal(ctx2.r.groupCap, 500000);
});

test('เงินได้ที่ใช้คิด 15% ต้องออกมาเป็นตัวเลขจริง ไม่ใช่ศูนย์เงียบ ๆ', () => {
  const rules = JSON.parse(readFileSync(new URL('../data/tax-rules.json', import.meta.url), 'utf8'));
  const ctx = vm.createContext({TAX_RULES: rules});
  vm.runInContext(html.slice(html.indexOf('function pensionIncomeAtRate('),
                             html.indexOf('function pensionHowMuchBox('))
    + '\nthis.f = pensionIncomeAtRate;', ctx);
  // ฐาน 20% อยู่ช่วง 750,001-1,000,000 ค่ากลางต้องอยู่ในช่วงนั้น
  const v = ctx.f(0.2);
  assert.ok(v > 750000 && v < 1000000, `ฐาน 20% ได้เงินได้ ${v} ซึ่งหลุดช่วง`);
  assert.ok(ctx.f(0.35) > 5000000, 'ฐานสูงสุดต้องไม่เป็นศูนย์');
  for(const b of rules.brackets)
    if(b.rate > 0) assert.ok(ctx.f(b.rate) > 0, `ฐาน ${b.rate} คืนศูนย์`);
});

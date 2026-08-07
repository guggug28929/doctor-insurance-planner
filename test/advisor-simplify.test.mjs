import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* หน้าผู้ช่วยจัดแผนคือประตูแรกที่ลูกค้าใช้จริง
   ถามเยอะเกินไปลูกค้าปิดหนี ถามน้อยแล้วอ่านค่าไม่ครบก็คำนวณผิด
   ไฟล์นี้กันทั้งสองทาง คือคุมจำนวนคำถามที่เห็น และกันไม่ให้ช่องที่ถูกพับหายจาก DOM */

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
const advMore = sliceTag(healthTab, '<details class="adv-more">', 'details');
const visible = healthTab.replace(advMore, '');

test('หน้าจอหลักต้องเหลือคำถามที่ต้องตอบ 5 ข้อ ไม่ใช่ 9 ข้อเรียงยาว', () => {
  const ids = [...visible.matchAll(/id="(ai_[A-Za-z]+)"/g)].map(m => m[1]);
  const radios = /name="ai_gender"/.test(visible) ? ['ai_gender'] : [];
  const asked = [...new Set([...radios, ...ids])];
  assert.deepEqual(asked.sort(), [
    'ai_birthYear', 'ai_budget', 'ai_ciStyle', 'ai_gender', 'ai_hasGroup', 'ai_ipdNeed',
  ].sort(), `คำถามที่โชว์อยู่: ${asked.join(', ')}`);
});

test('ช่องที่ถูกพับต้องยังอยู่ใน DOM ครบ ไม่งั้นตัวอ่านค่าจะพัง', () => {
  for(const id of ['ai_groupCoverage', 'ai_opdNeed', 'ai_riskChoice', 'ai_ciCapital'])
    assert.ok(advMore.includes(`id="${id}"`), `${id} หายจากหัวข้อปรับละเอียด`);
  // ตัวอ่านค่าเดิมยังเรียกทุกตัวอยู่ ถ้าลบ element ทิ้งจะพังทันที
  for(const id of ['ai_groupCoverage', 'ai_opdNeed', 'ai_riskChoice', 'ai_ciCapital', 'ai_ciStyle'])
    assert.ok(html.includes(`getElementById('${id}')`), `โค้ดยังอ่าน ${id} อยู่`);
});

/* ---------- ทุนโรคร้ายแรงผูกกับสไตล์ ---------- */

const ctx = vm.createContext({});
/* const ที่ประกาศระดับบนสุดใน vm ไม่ได้ผูกกับ global object ต้องโยนออกมาเอง */
vm.runInContext(
  html.slice(html.indexOf('const ADV_CI_CAPITAL_BY_STYLE = {'),
             html.indexOf('function advSyncCiCapital()'))
  + '\nthis.ADV_CI_CAPITAL_BY_STYLE = ADV_CI_CAPITAL_BY_STYLE;', ctx);

test('ทุกสไตล์ที่เลือกได้ ต้องมีทุนกำหนดไว้ ไม่มีตัวไหนหลุดเป็นค่าว่าง', () => {
  const map = ctx.ADV_CI_CAPITAL_BY_STYLE;
  const styles = [...sliceTag(healthTab, '<select id="ai_ciStyle"', 'select')
    .matchAll(/value="([a-z]+)"/g)].map(m => m[1]);
  for(const s of styles)
    assert.ok(Number.isFinite(map[s]), `สไตล์ ${s} ที่เลือกได้บนหน้าจอ ไม่มีทุนกำหนดไว้`);
  for(const [k, v] of Object.entries(map))
    assert.ok(Number.isFinite(v) && v >= 0, `${k} ทุนไม่ใช่ตัวเลข`);
  /* cancerckd ถูกถอดออกจากตัวเลือกแล้วเพราะเป็นตัวเลือกหลอก แต่ยังคงคีย์ไว้ในทะเบียน
     เผื่อค่าเก่าที่ยังส่งเข้ามา จึงยอมให้ทะเบียนมีคีย์มากกว่าตัวเลือกบนจอได้ */
  assert.ok(!styles.includes('cancerckd'), 'ตัวเลือกหลอกกลับมาอยู่บนหน้าจออีกแล้ว');
  assert.ok(Number.isFinite(map.cancerckd), 'ยังต้องรองรับค่าเก่า');
});

test('ทุนต้องสมเหตุผลกับสไตล์ และไม่เอาโรคร้ายแรงต้องเป็นศูนย์', () => {
  const m = ctx.ADV_CI_CAPITAL_BY_STYLE;
  assert.equal(m.none, 0, 'เลือกไม่เอาโรคร้ายแรงแล้วยังตั้งทุนไว้ จะคิดเบี้ยเกิน');
  assert.equal(m.balanced, 1000000);
  assert.equal(m.broad, 1000000);
  assert.equal(m.cancerckd, 1000000);
  /* สไตล์คุมงบใช้ D Care ครบหมวด ซึ่งเบี้ยต่อบาทถูกที่สุด จึงตั้งทุนได้สูงกว่าแบบอื่น
     ทุนสูงในที่นี้ไม่ได้แปลว่าเบี้ยแพงกว่า ซึ่งกลับกับสัญชาตญาณ จึงต้องมีเทสต์ล็อกไว้ */
  assert.equal(m.budget, 2500000, 'ต้องเท่ากับเพดานทุนของ D Care โหมดสองระยะ');
  assert.equal(m.multi, 2000000, 'ต้องเท่ากับเพดานทุนที่ Multiple CI เปิดขายจริง');
});

test('ป้ายตัวเลือกต้องบอกสิ่งที่จะได้ ลูกค้าจะได้เห็นก่อนกด', () => {
  const sel = sliceTag(healthTab, '<select id="ai_ciStyle"', 'select');
  assert.ok(sel.includes('ทุน 1 ล้าน'), 'ขาดทุนบนป้ายตัวเลือกหลัก');
  // สไตล์คุมงบขายที่ "จ่ายได้ถึง 200%" ไม่ใช่ขายที่ทุน เพราะทุนอย่างเดียวสื่อไม่ครบ
  assert.ok(sel.includes('D Care ครบ 5 หมวด'), 'ต้องบอกว่าได้ครบหมวด ไม่ใช่แค่กลุ่มยอดฮิต');
  assert.ok(sel.includes('200% ของทุน'), 'ต้องบอกเพดานจ่ายจริงของโหมดสองระยะ');
  assert.ok(sel.includes('Multiple CI'), 'ต้องมีตัวเลือกชั้นที่สาม');
  assert.ok(sel.includes('onchange="advSyncCiCapital();"'), 'เลือกสไตล์แล้วทุนต้องเปลี่ยนตาม');
  assert.match(html, /if\(name === 'ai'\)\{[\s\S]*?advSyncCiCapital\(\);/,
    'เปิดหน้ามาต้องตั้งทุนให้ตรงกับสไตล์ตั้งต้นทันที');
});

/* ---------- ช่องวงเงินสวัสดิการ ---------- */

test('ไม่มีสวัสดิการเดิม ต้องซ่อนช่องวงเงินและล้างค่าเป็นศูนย์', () => {
  assert.match(html, /function advSyncGroupField\(\)\{/);
  assert.ok(healthTab.includes('onchange="advSyncGroupField();"'));
  assert.ok(advMore.includes('id="ai_groupCoverageBox" hidden'), 'ค่าตั้งต้นคือไม่มีสวัสดิการ จึงต้องซ่อนไว้ก่อน');
  // ถ้าไม่ล้างค่า เลือกมีแล้วกรอกไว้ พอสลับกลับเป็นไม่มี ค่าเดิมจะค้างและคำนวณผิด
  assert.match(html, /if\(!yes\) inp\.value = 0;/);
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
  // เนื้อหาต้องยังอยู่ครบ แค่ถูกพับ ไม่ใช่ถูกลบ
  assert.match(html, /ADV_CUT_STEPS\.map\(s => `/);
  assert.ok(html.includes('ตัดจากบนลงล่าง หยุดทันทีที่เบี้ยเข้างบ'));
});

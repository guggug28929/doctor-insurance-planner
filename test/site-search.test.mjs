import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* ลูกค้าที่ถือคำเดียวในหัว เช่น carcinoma in situ หรือ ระยะรอคอย
   ไม่มีทางเดาถูกว่าเนื้อหานั้นอยู่หน้าไหน ช่องค้นหาจึงต้องกวาดทุกทะเบียนข้อมูล
   ไม่ใช่ค้นเฉพาะหน้าที่เปิดอยู่ */

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('ต้องมีปุ่มค้นหาลอยมุมบนขวา และกล่องค้นหาที่เปิดได้จริง', () => {
  assert.match(html, /class="ss-btn" onclick="openSiteSearch\(\)"/);
  assert.match(html, /\.ss-btn\{position:fixed;top:14px;right:14px;/);
  assert.match(html, /id="siteSearch" class="ss-overlay" hidden/);
  assert.match(html, /id="ssInput"/);
  assert.match(html, /function openSiteSearch\(\)\{/);
  assert.match(html, /function closeSiteSearch\(\)\{/);
  // ซ่อนด้วย hidden อย่างเดียวไม่พอ เพราะ .ss-overlay ตั้ง display เป็น flex ไว้
  assert.match(html, /\.ss-overlay\[hidden\]\{display:none;\}/);
});

test('ดัชนีต้องกวาดครบทุกแหล่งเนื้อหา ไม่ใช่แค่ชื่อแบบประกัน', () => {
  const fn = html.slice(html.indexOf('function ssBuildIndex()'), html.indexOf('function ssScore'));
  assert.ok(fn.length > 500, 'ไม่พบตัวสร้างดัชนี');
  for(const src of ['#navbar button[data-page]', 'PLAN_DETAILS', 'FAQ_ITEMS', 'DCARE_DEF', 'CIPC_DEF'])
    assert.ok(fn.includes(src), `ดัชนียังไม่ได้กวาด ${src}`);
  // ต้องค้นเจอจากเนื้อหาข้างใน ไม่ใช่แค่ชื่อ ไม่งั้นพิมพ์ชื่อโรคย่อยแล้วไม่เจออะไรเลย
  for(const field of ['p.overview', 'p.notFit', 'it.lead', 'd.criteria', 'st.criteria'])
    assert.ok(fn.includes(field), `ดัชนีไม่ได้เก็บเนื้อหาจาก ${field}`);
});

test('ผลลัพธ์ต้องพาไปถึงจุดนั้นจริง ไม่ใช่แค่เปิดหน้าทิ้งไว้', () => {
  assert.match(html, /function ssOpenFaq\(item, topic\)\{/);
  assert.match(html, /function ssOpenDefinition\(planId, tabsId, setTab, groupKey, name\)\{/);
  // คำถามบางข้อไม่มีคีย์ประจำตัว จึงต้องเทียบจากข้อความหัวข้อที่แสดงจริง
  assert.match(html, /q\.textContent\.trim\(\) === ssStrip\(item\.q\)/);
  assert.match(html, /if\(document\.getElementById\(tabsId\) && typeof setTab === 'function'\) setTab\(groupKey\);/);
  assert.match(html, /function ssFlash\(el, cls\)\{/);
});

test('ข้อความที่ดึงมาแสดงต้องถูกถอดแท็กและ escape ก่อนเสมอ', () => {
  // เนื้อหาต้นทางมี <b> อยู่เต็มไปหมด ถ้าใส่ตรง ๆ หน้าค้นหาจะเพี้ยนและเสี่ยงต่อการฉีดโค้ด
  assert.match(html, /function ssStrip\(x\)\{/);
  assert.match(html, /replace\(\/<\[\^>\]\*>\/g, ' '\)/);
  assert.match(html, /function ssEsc\(x\)\{/);
  assert.match(html, /return ssStrip\(x\)\.replace\(\/&\/g,'&amp;'\)/);
  const mark = html.slice(html.indexOf('function ssMark('), html.indexOf('const SS_MAX'));
  assert.ok(mark.includes('const safe = ssEsc(text);'), 'ต้อง escape ก่อนไฮไลต์คำค้น');
});

test('ปุ่มลัดต้องไม่ไปแย่งการพิมพ์ในช่องกรอกอื่นของเว็บ', () => {
  // เว็บมีช่องกรอกทุนประกันและอายุอยู่หลายจุด ถ้าดักคีย์ทั้งหน้าจะพิมพ์เลขไม่ได้
  assert.match(html, /t\.tagName === 'INPUT' \|\| t\.tagName === 'TEXTAREA'/);
  assert.match(html, /if\(typing \|\| e\.metaKey \|\| e\.ctrlKey \|\| e\.altKey\) return;/);
  assert.match(html, /if\(e\.key === 'Escape'\)\{ closeSiteSearch\(\); return; \}/);
});

/* ตรวจตรรกะจริง ไม่ใช่แค่ว่ามีโค้ดอยู่
   ดึงฟังก์ชันออกมารันกับข้อมูลปลอม จะได้รู้ว่าอันดับผลลัพธ์ออกมาถูกไหม */
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
const ctx = vm.createContext({String, Math, Array, Object});
vm.runInContext([
  grab('function ssStrip(x)'), grab('function ssEsc(x)'),
  grab('function ssScore(item, whole, words)'), grab('function ssMark(text, whole)'),
].join('\n'), ctx);

const entry = (title, sub, body, alt) => ({
  title, sub: sub || '', alt: (alt || '').toLowerCase(),
  hay: (title + ' ' + (sub || '') + ' ' + (alt || '') + ' ' + (body || '')).toLowerCase(),
});
const rank = (items, q) => {
  const whole = q.toLowerCase();
  const words = whole.split(/\s+/).filter(w => w.length >= 2);
  return items.map(it => ({it, sc: ctx.ssScore(it, whole, words)}))
    .filter(x => x.sc > 0).sort((a, b) => b.sc - a.sc).map(x => x.it.title);
};

test('พิมพ์ชื่อโรคแล้วต้องได้โรคนั้นก่อน ไม่ใช่ย่อหน้ายาวที่บังเอิญมีคำนั้น', () => {
  const items = [
    entry('คำถามเรื่องเบี้ย', 'ประกันสุขภาพ', 'บางแผนคุ้มครองโรคมะเร็งด้วย แต่ต้องดูเงื่อนไข'),
    entry('โรคมะเร็งระยะไม่ลุกลาม', 'Non-invasive cancer', 'ไม่ลุกลามเกิน Basement Membrane'),
    entry('แผนบำนาญ', 'ประกันบำนาญ', 'รับเงินบำนาญทุกปีจนถึงอายุ 85'),
  ];
  const r = rank(items, 'มะเร็ง');
  assert.equal(r[0], 'โรคมะเร็งระยะไม่ลุกลาม');
  assert.equal(r.length, 2, 'แผนบำนาญไม่ควรติดมาด้วย');
});

test('ค้นด้วยคำอังกฤษที่อยู่ลึกในเนื้อหาก็ต้องเจอ', () => {
  const items = [
    entry('โรคมะเร็งระยะไม่ลุกลาม', 'Non-invasive cancer', 'carcinoma in situ เคลมได้ถ้าซื้อแบบระยะเริ่มต้น'),
    entry('แผนบำนาญ', '', 'ไม่เกี่ยวกับโรคร้ายแรง'),
  ];
  assert.deepEqual(rank(items, 'carcinoma in situ'), ['โรคมะเร็งระยะไม่ลุกลาม']);
});

test('พิมพ์หลายคำเว้นวรรค ต้องนับทุกคำ ไม่ใช่ต้องตรงทั้งประโยค', () => {
  const items = [
    entry('ดี เฮลท์ ไลท์', 'สัญญาสุขภาพเหมาจ่าย', 'มีค่าเสียหายส่วนแรก deductible'),
    entry('ดี แคร์', 'โรคร้ายแรง', 'เจอจ่ายจบ'),
  ];
  const r = rank(items, 'ดี deductible');
  assert.equal(r[0], 'ดี เฮลท์ ไลท์', 'ตัวที่ตรงสองคำต้องมาก่อน');
});

test('แท็กในเนื้อหาต้องถูกถอด และคำค้นต้องไฮไลต์โดยไม่ปล่อยโค้ดหลุด', () => {
  assert.equal(ctx.ssStrip('ไม่ลุกลามเกิน<b>ชั้นผิว</b> ครับ'), 'ไม่ลุกลามเกินชั้นผิว ครับ');
  assert.equal(ctx.ssEsc('<img src=x onerror=alert(1)>ทดสอบ'), 'ทดสอบ');
  assert.equal(ctx.ssMark('โรคมะเร็งปอด', 'มะเร็ง'), 'โรค<mark>มะเร็ง</mark>ปอด');
  // ข้อความที่มีอักขระพิเศษต้องถูก escape ก่อนแล้วค่อยไฮไลต์ ไม่ใช่ปล่อยผ่าน
  assert.ok(!ctx.ssMark('a & b <script>', 'b').includes('<script>'));
});

test('ปุ่มต้องสลับสีตอนเลื่อนพ้นหัวเว็บ ไม่งั้นกลืนพื้นหลังจนมองไม่เห็น', () => {
  assert.match(html, /function ssSyncBtnSkin\(\)\{/);
  assert.match(html, /classList\.toggle\('ss-solid', window\.scrollY > 60\)/);
  assert.match(html, /body\.ss-solid \.ss-btn\{/);
  assert.match(html, /body\.hnw\.ss-solid \.ss-btn\{/);
});

/* ปัญหาจริงที่เจอตอนลองบนเว็บ ไม่ใช่ปัญหาสมมติ */
test('ชื่อแบบประกันที่ตั้งเป็นภาษาอังกฤษ ต้องค้นด้วยคำไทยที่ลูกค้าพิมพ์จริงได้', () => {
  assert.match(html, /const SS_ALIAS = \{/);
  for(const [id, word] of [['dhl','ดีเฮลท์'], ['ehp','อีลิท'], ['dcare','ดีแคร์'],
                           ['cipc','ซีไอ'], ['careplus','แคร์พลัส'], ['hb','ชดเชยรายวัน']]){
    const i = html.indexOf(`  ${id}:`, html.indexOf('const SS_ALIAS'));
    assert.ok(i > -1 && html.slice(i, i + 200).includes(word), `${id} ยังไม่มีคำไทย ${word}`);
  }
  // ต้องถูกส่งเข้าดัชนีจริง ไม่ใช่ประกาศไว้เฉย ๆ
  assert.match(html, /\[SS_ALIAS\[id\], p\.overview\]/);
});

test('โรคเดียวกันที่อยู่หลายกลุ่ม ต้องไม่ขึ้นผลซ้ำ', () => {
  // เช่น มะเร็งระยะลุกลาม อยู่ทั้งกลุ่มมะเร็งและกลุ่มโรคยอดฮิต
  assert.match(html, /const id = kind \+ '\|' \+ t;/);
  assert.match(html, /if\(seen\.has\(id\)\) return;/);
});

test('คำถามที่ตอบเรื่องนั้นตรง ๆ ต้องมาก่อนแผนที่บังเอิญเอ่ยถึงคำนั้น', () => {
  const faq = entry('ทำประกันแล้วป่วยเลย เคลมได้ไหม', 'ประกันสุขภาพ',
    'ต้องพ้นกำหนดก่อน', 'ระยะรอคอย 30 วันสำหรับโรคทั่วไป และ 120 วันสำหรับบางโรค');
  const plan = entry('D Health Lite', 'สุขภาพเหมาจ่าย',
    'มีระยะรอคอยตามเงื่อนไขมาตรฐาน และมีรายละเอียดอื่นอีกมาก');
  const r = rank([plan, faq], 'ระยะรอคอย');
  assert.equal(r[0], 'ทำประกันแล้วป่วยเลย เคลมได้ไหม',
    'คำโปรยของคำถามต้องมีน้ำหนักมากกว่าเนื้อหาทั้งก้อนของแผน');
});

test('พิมพ์ชื่อไทยของแผนที่ตั้งชื่ออังกฤษ ต้องเจอแผนนั้น', () => {
  const dhl = entry('D Health Lite', 'สุขภาพเหมาจ่าย', 'เหมาจ่ายต่อครั้งการรักษา', 'ดีเฮลท์ ดี เฮลท์ ไลท์');
  const other = entry('Care Plus', 'สุขภาพ', 'ไม่เกี่ยวกัน');
  assert.deepEqual(rank([other, dhl], 'ดีเฮลท์'), ['D Health Lite']);
});

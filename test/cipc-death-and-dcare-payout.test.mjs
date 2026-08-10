import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* สองเรื่องที่ทำให้เว็บบอกความจริงไม่ครบ จนแบบประกันดูด้อยกว่าที่เป็น
   1) D Care โหมดสองระยะจ่ายได้ 200% ของทุน แต่เว็บบอกแค่เพดานทุน
      ลูกค้าอ่าน "ทุนสูงสุด 2.5 ล้าน" แล้วเข้าใจว่าได้ 2.5 ล้าน ทั้งที่จ่ายจริง 5 ล้าน
   2) CI Perfect Care จ่ายกรณีเสียชีวิตทุกกรณี และยกเว้นเงื่อนไขเวลาถ้าเสียชีวิตก่อนครบกำหนด
      เป็นจุดที่แบบโรคร้ายแรงอื่นไม่มี แต่หน้าเว็บไม่เคยอธิบายว่าทำไมถึงสำคัญ */

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const CIPC = JSON.parse(readFileSync(new URL('../data/cipc-definitions.json', import.meta.url), 'utf8'));

/* ---------- D Care เพดานจ่ายจริง ---------- */

const ctx = vm.createContext({});
const start = html.indexOf('const DCARE_STAGES = {');
assert.notEqual(start, -1);
vm.runInContext(html.slice(start, html.indexOf('};', start) + 2)
  + '\nthis.S = DCARE_STAGES;', ctx);
const S = ctx.S;

test('เพดานจ่ายจริงของแต่ละโหมดต้องคำนวณจากเพดานทุนคูณเปอร์เซ็นต์ที่จ่าย', () => {
  assert.equal(S.early_and_severe.payPct, 200);
  assert.equal(S.severe.payPct, 100);
  assert.equal(S.early_and_severe.maxSum * S.early_and_severe.payPct / 100, 5000000,
    'โหมดสองระยะ ทุนรวม 2.5 ล้าน ต้องจ่ายได้ 5 ล้าน');
  assert.equal(S.severe.maxSum * S.severe.payPct / 100, 10000000,
    'โหมดระยะรุนแรง ทุนรวม 10 ล้าน จ่ายได้ 10 ล้าน');
});

test('หน้าคำนวณเบี้ยต้องบอกเพดานจ่ายจริง ไม่ใช่บอกแค่เพดานทุน', () => {
  // ข้อความบอกแยกตามแบบที่ลูกค้าเลือกใช้จริง เพราะเพดานเป็นของแต่ละแบบ ไม่ใช่ของทั้งกรมธรรม์
  assert.match(html, /จ่ายสูงสุด \$\{def\.payPct\}% ของทุน/);
  assert.match(html, /def\.maxSum \* def\.payPct \/ 100/);
  assert.match(html, /const dcareUsedStages = Object\.keys\(DCARE_STAGES\)\.filter\(k => dcareStageSums\[k\] > 0\);/);
});

test('หน้าแผน D Care ต้องมีบรรทัดเพดานของแบบ และคิดจาก payPct ไม่ใช่พิมพ์ค้าง', () => {
  assert.match(html, /function dcareCeilingLine\(\)\{/);
  assert.match(html, /st\.maxSum \* st\.payPct \/ 100/);
  assert.match(html, /<p class="meta">\$\{dcareCeilingLine\(\)\}<\/p>/);
  const fn = html.slice(html.indexOf('function dcareCeilingLine()'),
                        html.indexOf('function dcareRateTableBlock'));
  assert.ok(!/2,?500,?000|5,?000,?000|10,?000,?000/.test(fn),
    'ห้ามพิมพ์ตัวเลขเพดานค้างไว้ ต้องอ่านจาก DCARE_STAGES ที่เดียว');
});

/* ---------- CI Perfect Care กรณีเสียชีวิต ---------- */

test('หน้าแผนต้องมีส่วนอธิบายตาข่ายกรณีเสียชีวิต', () => {
  assert.match(html, /function cipcDeathBenefitSection\(\)\{/);
  assert.match(html, /detailSections: \(\) => cipcDeathBenefitSection\(\)/);
  const sec = html.slice(html.indexOf('function cipcDeathBenefitSection()'),
                         html.indexOf('function cipcDefinitionsSection'));
  for(const s of ['เสียชีวิตทุกกรณี', 'หักเงินระยะเริ่มต้นและระยะกลาง',
                  'ไม่ได้จำกัดว่าต้องเสียชีวิตด้วยโรคร้ายแรง',
                  'ไม่เกิน 100% ของทุนตลอดสัญญา'])
    assert.ok(sec.includes(s), `ส่วนนี้ขาดประเด็น ${s}`);
});

test('ถ้อยคำยกเว้นเงื่อนไขเวลาต้องตรงกับที่อยู่ในไฟล์นิยามจริง ห้ามเขียนขึ้นเอง', () => {
  const sec = html.slice(html.indexOf('function cipcDeathBenefitSection()'),
                         html.indexOf('function cipcDefinitionsSection'));
  const quote = 'เว้นแต่ผู้เอาประกันภัยได้เสียชีวิตลงก่อนครบกำหนดระยะเวลาดังกล่าว'
              + 'ด้วยโรคร้ายแรงหรือเป็นผลสืบเนื่องโดยตรงจากโรคร้ายแรงในข้อนี้';
  assert.ok(sec.includes('เว้นแต่ผู้เอาประกันภัยได้เสียชีวิตลงก่อนครบกำหนดระยะเวลาดังกล่าว'),
    'ต้องยกถ้อยคำจริงมาแสดง');
  // ถ้อยคำเดียวกันต้องมีอยู่จริงในไฟล์นิยาม ไม่งั้นแปลว่าเราอ้างสิ่งที่กรมธรรม์ไม่ได้เขียน
  const all = JSON.stringify(CIPC);
  assert.ok(all.includes(quote), 'ไม่พบถ้อยคำนี้ในไฟล์นิยาม CI Perfect Care');
  // ต้องไม่ใช่ข้อเดียวโดด ๆ ถึงจะพูดได้ว่าเป็นลักษณะของแบบนี้
  const hits = (all.match(/เว้นแต่ผู้เอาประกันภัยได้เสียชีวิตลงก่อนครบกำหนด/g) || []).length;
  assert.ok(hits >= 8, `พบถ้อยคำนี้แค่ ${hits} ข้อ น้อยเกินกว่าจะอ้างว่าเป็นลักษณะของแบบนี้`);
});

test('ต้องไม่ขายเกินจริง บอกด้วยว่าผลประโยชน์นี้ไม่ได้แทนประกันชีวิต', () => {
  const sec = html.slice(html.indexOf('function cipcDeathBenefitSection()'),
                         html.indexOf('function cipcDefinitionsSection'));
  assert.ok(sec.includes('ไม่ได้มาแทนประกันชีวิต'), 'ต้องเตือนไม่ให้ตัวแทนขายเกินจริง');
  assert.ok(sec.includes('หักเงินที่เคยรับไปแล้ว'));
});

test('คีย์ detailSections ของแผนนี้ต้องมีอันเดียว ไม่ประกาศซ้ำจนทับกันเอง', () => {
  // มีคีย์ cipc อยู่สองที่ อีกที่คือทะเบียนภาพปกโบรชัวร์ ต้องเริ่มค้นหลัง PLAN_DETAILS เท่านั้น
  const from = html.indexOf('const PLAN_DETAILS = {');
  assert.notEqual(from, -1);
  const s = html.indexOf('\n  cipc: {', from);
  assert.notEqual(s, -1);
  /* ต้องนับวงเล็บจริง ไม่ใช่ตัดที่ '},' ตัวแรก เพราะข้างในมี object ซ้อนอยู่
     ถ้าตัดผิดช่วง เทสต์จะไม่เห็นคีย์แล้วเข้าใจผิดว่าของหาย */
  let depth = 0, end = s;
  for(let i = html.indexOf('{', s); i < html.length; i++){
    if(html[i] === '{') depth++;
    else if(html[i] === '}'){ depth--; if(depth === 0){ end = i + 1; break; } }
  }
  const block = html.slice(s, end);
  const n = (block.match(/detailSections:/g) || []).length;
  assert.equal(n, 1, `พบคีย์ detailSections ${n} ครั้งในแผน cipc อันหลังจะทับอันแรกจนไม่ทำงาน`);
  // ciPerfectCareDetailSections() (สรุปย่อ) ถูกตัดออกเพราะพูดซ้ำกับ cipcDefinitionsSection() (นิยามเต็ม)
  // เหลือสองส่วนที่ต้องเรียกครบคือตาข่ายเสียชีวิตกับนิยามเต็ม
  for(const f of ['cipcDeathBenefitSection()', 'cipcDefinitionsSection()'])
    assert.ok(block.includes(f), `แผน cipc ไม่ได้เรียก ${f}`);
  // เช็คว่าไม่ถูก "เรียก" จริง (มี + นำหน้า) ไม่ใช่แค่เช็คชื่อฟังก์ชัน เพราะคอมเมนต์อธิบายเหตุผลก็มีชื่อนี้อยู่
  assert.ok(!/\+\s*ciPerfectCareDetailSections\(\)/.test(block),
    'ชุดสรุปย่อถูกตัดออกแล้ว ไม่ควรถูกเรียกอีก เพราะเนื้อหาซ้ำกับนิยามเต็ม');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* ลิงก์ชุดเก่าเป็น path ภาษาไทยของเว็บรุ่นก่อน ที่ส่งให้ลูกค้าไปแล้วจริง
   ลูกค้าเก็บไว้ในแชตและกดเข้ามาได้ตลอด ถ้าพังคือลูกค้าเจอหน้าว่าง
   ตัวสะกดในตารางถูกตัดสระมาตั้งแต่รุ่นก่อน ห้ามแก้ให้ถูก */

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

function grab(sig){
  const i = html.indexOf(sig);
  let d = 0, started = false;
  for(let j = i; j < html.length; j++){
    if(html[j] === '{'){ d++; started = true; }
    else if(html[j] === '}'){ d--; if(started && d === 0) return html.slice(i, j + 1); }
  }
}

const LEGACY_PATHS = (() => {
  const c = vm.createContext({});
  vm.runInContext(grab('const LEGACY_PATHS = '), c);
  return vm.runInContext('LEGACY_PATHS', c);
})();

const OLD_LINKS = [
  ['/ประกนสขภาพ', 'knowledge'],
  ['/ประกนสขภาพ/รวมคำถามยอดฮต', 'faq'],
  ['/ประกนสขภาพ/รวมคำถามยอดฮต/ระยะรอคอย', 'faq'],
  ['/ประกนสขภาพ/รวมคำถามยอดฮต/ขอยกเวนประกนสขภาพ', 'faq'],
  ['/ประกนสขภาพ/รวมคำถามยอดฮต/การแฟกซเคลม', 'faq'],
  ['/ประกนสขภาพ/รวมคำถามยอดฮต/เงอนไข-copayment', 'faq'],
];

test('ลิงก์เก่าทุกอันที่ส่งลูกค้าไปแล้ว ต้องยังมีปลายทาง', () => {
  for(const [path, page] of OLD_LINKS){
    const dest = LEGACY_PATHS[path];
    assert.ok(dest, `ลิงก์ ${path} ไม่มีปลายทาง ลูกค้าที่กดจะเจอหน้าว่าง`);
    assert.equal(dest.page, page, `${path} ควรไปหน้า ${page}`);
  }
});

test('ลิงก์ที่ชี้หัวข้อเฉพาะ ต้องชี้ไปยังข้อที่มีอยู่จริง', () => {
  for(const [, dest] of Object.entries(LEGACY_PATHS)){
    if(!dest.key) continue;
    assert.ok(html.includes(`k:'${dest.key}'`), `ไม่มีข้อ FAQ ที่คีย์ ${dest.key} แล้ว ลิงก์เก่าจะเด้งไปหน้าเปล่า`);
    assert.ok(dest.group, `${dest.key} ต้องระบุกลุ่มด้วย ไม่งั้นข้อจะไม่ถูกแสดง`);
  }
});

/* เคยพลาดมาแล้วตอนแยกแท็บ คือแก้ตัวสะกดในโค้ดให้ถูกต้องตามหลักภาษา
   แล้วลิงก์ที่ส่งลูกค้าไปพังหมด เพราะสระในลิงก์จริงถูกตัดออกไปแล้ว */
test('ตัวสะกดในตารางต้องเป็นแบบสระตกเหมือนลิงก์จริง ห้ามแก้ให้ถูก', () => {
  const keys = Object.keys(LEGACY_PATHS);
  assert.ok(keys.some(k => k.includes('ประกนสขภาพ')), 'ต้องคงคำที่สระตกไว้');
  assert.ok(!keys.some(k => k.includes('ประกันสุขภาพ')), 'มีคนแก้ตัวสะกดให้ถูก ลิงก์เก่าจะพังทันที');
  assert.ok(keys.some(k => k.includes('รวมคำถามยอดฮต')), 'ต้องคงคำที่สระตกไว้');
});

/* ตัวรับทุก path ต้องไม่กลืนไฟล์จริง
   เคยพลาดมาแล้ว คือใส่ /:path* ไว้ท้ายสุด แล้วโบรชัวร์ทุกไฟล์กลายเป็นหน้าเว็บแทน PDF
   ลูกค้ากดดาวน์โหลดแล้วเด้งกลับหน้าแรก โดยไม่มีอะไรฟ้องว่าพัง */
test('ตัวรับทุก path ต้องไม่กลืนโบรชัวร์และไฟล์ข้อมูล', () => {
  const last = vercel.rewrites[vercel.rewrites.length - 1];
  assert.equal(last.destination, '/index.html');
  const rx = new RegExp('^' + last.source + '$');
  const goIn  = ['/faq', '/calculator', '/plans/d-care', '/ประกนสขภาพ/รวมคำถามยอดฮต/ระยะรอคอย'];
  const stay  = ['/brochures/d-care.pdf', '/brochures/elite-health-plus.pdf', '/brochures/ci-perfect-care.pdf',
                 '/data/premium-rates.json', '/api/brochure', '/favicon.ico', '/plan-covers/d-care.jpg'];
  for(const p of goIn) assert.ok(rx.test(p), `${p} ควรเข้าหน้าเว็บ`);
  for(const p of stay) assert.ok(!rx.test(p), `${p} เป็นไฟล์จริง ห้ามถูกเปลี่ยนเป็นหน้าเว็บ`);
});

test('ทุกโบรชัวร์ที่หน้าเว็บลิงก์ถึง ต้องมีไฟล์อยู่จริง', async () => {
  const { readdirSync } = await import('node:fs');
  const have = new Set(readdirSync(new URL('../public/brochures', import.meta.url)));
  const linked = [...html.matchAll(/\{file:'([^']+\.pdf)'/g)].map(m => m[1]);
  assert.ok(linked.length >= 10, `เจอลิงก์โบรชัวร์แค่ ${linked.length} ไฟล์`);
  const missing = [...new Set(linked)].filter(f => !have.has(f));
  assert.deepEqual(missing, [], 'ลิงก์ชี้ไปไฟล์ที่ไม่มีอยู่จริง');
});

test('ต้องถอดเปอร์เซ็นต์เอนโค้ดก่อนเทียบ ไม่งั้นภาษาไทยไม่มีวันตรง', () => {
  assert.match(html, /decodeURIComponent\(p\)/);
  assert.match(html, /if\(openLegacyPath\(\)\) return;/);
});

/* ---------- เนื้อหาเวชภัณฑ์และการส่งตรวจ ---------- */

test('ต้องมีข้อที่อธิบายเวชภัณฑ์ครบทั้งสามกลุ่ม', () => {
  assert.ok(html.includes(`k:'medical-supplies'`), 'ยังไม่มีข้อเรื่องเวชภัณฑ์');
  for(const g of ['เวชภัณฑ์ 1', 'เวชภัณฑ์ 2', 'เวชภัณฑ์ 3'])
    assert.ok(html.includes(g), `ขาดคำอธิบาย ${g}`);
});

test('ของที่ลูกค้าถามบ่อย ต้องมีชื่ออยู่ในเนื้อหาจริง', () => {
  const items = ['ไม้ค้ำยัน', 'รถเข็นผู้ป่วย', 'ฟันปลอม', 'เครื่องช่วยฟัง', 'ขาเทียม',
                 'เหล็กดามกระดูก', 'ข้อเข่าเทียม', 'เลนส์ตาเทียม',
                 'เข็มฉีดยา', 'สายน้ำเกลือ',
                 'ถ้วยตวงปัสสาวะ', 'ผ้ากันเปื้อน', 'ผ้าอ้อมผู้ใหญ่'];
  const missing = items.filter(i => !html.includes(i));
  assert.deepEqual(missing, [], 'ของพวกนี้ลูกค้าถามบ่อย ต้องหาเจอในเว็บ');
});

/* ห้ามเขียนให้ลูกค้าเข้าใจว่าเรารับประกันผลการเคลมแทนบริษัท
   เพราะเราไม่ใช่คนอนุมัติ และเงื่อนไขต่างกันรายฉบับ */
test('ต้องบอกว่าเงื่อนไขจริงอยู่ที่กรมธรรม์ ไม่ใช่รับประกันผลเอง', () => {
  assert.ok(html.includes('สิ่งที่ผูกพันจริงคือถ้อยคำในกรมธรรม์ฉบับที่ถืออยู่'));
  assert.ok(html.includes('เราจึงรับประกันล่วงหน้าไม่ได้ว่าชิ้นไหนจะผ่าน'));
  assert.ok(html.includes('ยังไม่มีบริษัทไหนประกาศเกณฑ์การจ่ายค่าตรวจกลุ่มนี้ไว้เป็นลายลักษณ์อักษร'),
    'เรื่องการตรวจยีนต้องบอกตรง ๆ ว่ายังไม่มีเกณฑ์ประกาศ');
});

test('ต้องมีแนวทางให้แพทย์เขียนใบเคลม และห้ามชวนเขียนเกินจริง', () => {
  assert.ok(html.includes(`k:'claim-form-note'`), 'ยังไม่มีข้อแนวทางเขียนใบเคลม');
  assert.ok(html.includes('อย่าขอให้แพทย์เขียนเกินจริงหรือเปลี่ยนวันที่เริ่มมีอาการ'),
    'ต้องเตือนไม่ให้ขอเอกสารเท็จ');
  assert.ok(html.includes('1186'), 'ควรบอกช่องทางร้องเรียนที่ถูกต้อง');
});

/* แหล่งอ้างอิงที่ห้ามโผล่ในหน้าเว็บเด็ดขาด รวมถึงในคอมเมนต์ เพราะดู source ได้ */
test('ห้ามมีชื่อแหล่งภายในหรือคู่แข่งหลุดเข้ามาพร้อมเนื้อหาใหม่', () => {
  for(const w of ['muangthai-agent', 'releaseyourrisk', 'ค่านายหน้า', 'wat9insure', 'prakan-untold'])
    assert.ok(!html.includes(w), `ห้ามมีคำว่า ${w} ในหน้าเว็บ`);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* สองเรื่องในไฟล์นี้
   1) ทุกแบบประกันต้องบอกได้ว่าเหมาะกับใคร และไม่เหมาะกับใคร
   2) D Care มีสองโหมดคนละอัตรา และร้อยละที่ระบุเป็นยอดสะสม ไม่ใช่ยอดที่จ่ายเพิ่ม
      จุดหลังนี้เคยเขียนผิดจนผลประโยชน์เกินจริงไปหนึ่งเท่าตัว */

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const RATES = JSON.parse(readFileSync(new URL('../data/premium-rates.json', import.meta.url), 'utf8'));

function grab(sig){
  const i = html.indexOf(sig);
  let d = 0, started = false;
  for(let j = i; j < html.length; j++){
    if(html[j] === '{'){ d++; started = true; }
    else if(html[j] === '}'){ d--; if(started && d === 0) return html.slice(i, j + 1); }
  }
}
const sb = vm.createContext({RATES, Math, Object, Number});
vm.runInContext([grab('function rateAtStart('), grab('function dcareRateArray('),
                 grab('function dcareRate('), grab('function dcarePremium(')].join('\n'), sb);
const premium = vm.runInContext('dcarePremium', sb);
const rate = vm.runInContext('dcareRate', sb);

const PLAN_KEYS = [...html.matchAll(/\n  ([a-zA-Z0-9_]+): \{\n    title: /g)].map(m => m[1]);

test('ทุกแบบต้องบอกได้ว่าเหมาะกับใคร', () => {
  assert.ok(PLAN_KEYS.length >= 35, `เจอแค่ ${PLAN_KEYS.length} แบบ`);
  const missing = PLAN_KEYS.filter(k =>
    !new RegExp(`\\n  ${k}: \\{\\n    title: [^\\n]*\\n    fit: \\[`).test(html));
  assert.deepEqual(missing, [], 'แบบเหล่านี้ยังไม่มีข้อความว่าเหมาะกับใคร');
});

/* การบอกว่าไม่เหมาะกับใครสำคัญพอ ๆ กับบอกว่าเหมาะกับใคร
   เพราะช่วยตัดลูกค้าที่ซื้อไปแล้วจะเสียใจออกตั้งแต่ต้น */
test('ทุกแบบต้องบอกด้วยว่ายังไม่ใช่คำตอบสำหรับใคร', () => {
  const missing = PLAN_KEYS.filter(k =>
    !new RegExp(`\\n  ${k}: \\{[\\s\\S]{0,4000}?\\n    notFit: '`).test(html));
  assert.deepEqual(missing, [], 'แบบเหล่านี้ยังไม่มีข้อความว่าไม่เหมาะกับใคร');
});

test('หน้าแผนต้องแสดงกล่องนี้จริง ไม่ใช่เก็บข้อมูลไว้เฉย ๆ', () => {
  assert.match(html, /function renderPlanFit\(p\)\{/);
  assert.match(html, /\$\{renderPlanFit\(p\)\}/);
  assert.match(html, /<h3>เหมาะกับใคร<\/h3>/);
});

test('เฟล็กซี่ 99/20 และ 99/5 ต้องพูดถึงคนที่หมดสวัสดิการตอนเกษียณ', () => {
  // ต้องยึดจากบล็อกใน PLAN_DETAILS เท่านั้น เพราะคีย์เดียวกันมีอยู่ในตารางรูปปกด้วย
  const detail = k => {
    const i = html.search(new RegExp(`\\n  ${k}: \\{\\n    title: `));
    assert.notEqual(i, -1, `ไม่พบบล็อกรายละเอียดของ ${k}`);
    return html.slice(i, i + 3000);
  };
  for(const k of ['flexi9920', 'flexi995'])
    assert.ok(/เกษียณ/.test(detail(k)), `${k} ควรพูดถึงช่วงเกษียณ`);
  assert.ok(/ประกันกลุ่ม|รัฐวิสาหกิจ/.test(detail('flexi9920')), 'ควรระบุกลุ่มลูกค้าที่ชัดเจน');
});

/* ---------- D Care ---------- */

test('ต้องมีสองโหมด และใช้อัตราคนละตาราง', () => {
  assert.match(html, /const DCARE_STAGES = \{/);
  const st = RATES.dcare.payment_schedules.stages;
  assert.ok(st.severe && st.early_and_severe, 'ไฟล์ข้อมูลต้องมีครบสองโหมด');
  // โหมดสองระยะจ่ายรวมสองเท่า เบี้ยจึงต้องแพงกว่าโหมดรุนแรงอย่างเดียวเสมอ
  for(const c of ['cancer','cardio','organ','neuro','other','popular'])
    for(const g of ['m','f'])
      for(const age of [0, 20, 35, 50, 65, 70]){
        const s = rate(c, g, age, 'annual', 'severe');
        const e = rate(c, g, age, 'annual', 'early_and_severe');
        assert.ok(e > s, `${c} ${g} อายุ ${age}: โหมดสองระยะ (${e}) ต้องแพงกว่าโหมดรุนแรงอย่างเดียว (${s})`);
      }
});

test('อัตราต้องเป็นทศนิยมตามต้นฉบับ ไม่ถูกปัดเป็นจำนวนเต็ม', () => {
  // เคยแสดงเป็น 1 เท่ากันทั้งคอลัมน์ เพราะเอาอัตราต่อทุน 1,000 ไปปัดเป็นบาท
  const vals = [30,31,32,33,34].map(a => rate('cancer','m',a,'annual','early_and_severe'));
  assert.equal(vals.join(','), '1.3,1.44,1.68,1.9,2.2');
  assert.ok(new Set(vals.map(Math.round)).size < vals.length, 'ถ้าปัดก่อนคูณ ค่าจะซ้ำกันจนแยกไม่ออก');
  // คูณทุนก่อนแล้วค่อยปัด ตัวเลขจึงต่างกันจริง
  const at = a => Math.round(premium('cancer', 500000, 'm', a, 'annual', 'early_and_severe'));
  assert.equal(at(30), 650);
  assert.equal(at(31), 720);
  assert.equal(at(32), 840);
});

test('หน้าแผนต้องให้กรอกทุน และตั้งต้นที่ 500,000', () => {
  assert.match(html, /let dcareTableSum = 500000;/);
  assert.match(html, /id="dcareTableSum"/);
  assert.match(html, /id="dcareTableStage"/);
  assert.ok(!html.includes('อัตราเบี้ยต่อทุนประกัน 1,000 บาท (โหมดระยะเริ่มต้น+รุนแรง)'),
    'ต้องเลิกโชว์อัตราต่อทุน 1,000 แล้ว');
});

/* ผลประโยชน์ที่บอกลูกค้าต้องเป็นยอดสะสม ไม่ใช่ยอดที่จ่ายเพิ่มในงวดนั้น
   ทุน 500,000 โหมดสองระยะ รับรวมทั้งสัญญา 1,000,000 ไม่ใช่ 1,500,000 */
test('ข้อความผลประโยชน์ต้องไม่ทำให้เข้าใจเกินจริง', () => {
  assert.ok(!html.includes('ระยะรุนแรง 200% = ${fmt(d.capital*2)} บาท'),
    'ข้อความเดิมทำให้เข้าใจว่าได้เพิ่มอีกสองเท่า ซึ่งเกินจริงไปหนึ่งเท่าตัว');
  assert.match(html, /รับเพิ่มอีก \$\{fmt\(d\.capital\)\} บาท รวมทั้งสัญญา \$\{fmt\(d\.capital\*2\)\} บาท/);
  assert.match(html, /function dcareBenefitLine\(\)\{/);
  assert.match(html, /รับ \$\{fmt\(sum\)\} บาท \(100% ของทุน\) แล้วสัญญาจบ/);
});

test('ทางเลือกเรื่องเบี้ยหลังเกษียณต้องมีครบสี่ทาง และมียูนิเวอร์แซลไลฟ์', () => {
  assert.match(html, /ถ้ากลัวเบี้ยหลังเกษียณ มีสี่ทางให้เลือก/);
  assert.match(html, /<b>ทางที่สี่<\/b>/);
  assert.match(html, /ยูนิเวอร์แซลไลฟ์ ซึ่งต่างจากแบบควบการลงทุน/);
  // จุดที่ลูกค้าเข้าใจผิดบ่อยที่สุดเรื่องการเปลี่ยนความรับผิดส่วนแรกตอนเกษียณ
  assert.match(html, /เบี้ยจะคิดตามอัตราของแบบไม่มีความรับผิดส่วนแรก ณ อายุนั้น/);
});

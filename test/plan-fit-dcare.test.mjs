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

/* เพดานทุนของสองแบบไม่เท่ากัน และเป็นเพดานรวมทุกกลุ่มโรค ไม่ใช่ต่อกลุ่ม
   เฉพาะระยะรุนแรง 10 ล้าน · ระยะเริ่มต้นและรุนแรง 2.5 ล้าน
   ถ้าปล่อยให้กรอกเกินโดยไม่เตือน ลูกค้าจะได้ตัวเลขเบี้ยของทุนที่ซื้อไม่ได้จริง */
test('เพดานทุน D Care ต้องตรงตามกรมธรรม์ทั้งสองแบบ', () => {
  const i = html.indexOf('const DCARE_STAGES = {');
  assert.notEqual(i, -1);
  const seg = html.slice(i, i + 400);
  assert.match(seg, /early_and_severe: \{label:'[^']*', minSum: 250000, maxSum: 2500000/);
  assert.match(seg, /severe: *\{label:'[^']*', *minSum: 500000, maxSum: 10000000/);
});

test('หน้าแผนต้องเตือนสีแดงเมื่อกรอกทุนเกินเพดานของแบบที่เลือก', () => {
  assert.match(html, /const warn = sum > st\.maxSum/);
  assert.match(html, /ทุนรวมทุกกลุ่มโรคสูงสุด \$\{fmt\(st\.maxSum\)\} บาท/);
  assert.match(html, /\.dcare-cap-warn\{color:var\(--danger\)/);
  // ช่องกรอกต้องแดงด้วย ไม่ใช่มีแต่ข้อความใต้ตาราง
  assert.match(html, /class="\$\{sum > st\.maxSum \|\| sum < st\.minSum \? 'field-error' : ''\}"/);
  assert.match(html, /max="\$\{st\.maxSum\}"/);
});

test('D Care ในหน้าคำนวณเบี้ยต้องเป็นรายการที่เพิ่มเองได้ และซ้ำกลุ่มโรคได้', () => {
  /* กติกาจริงสองข้อที่โครงเดิมทำไม่ได้
       1) แบบความคุ้มครองเป็นของแต่ละความคุ้มครอง คละกันได้ในกรมธรรม์เดียว
       2) กลุ่มโรคเดียวกันซื้อได้ทั้งสองแบบพร้อมกัน
          เช่น มะเร็งเฉพาะระยะรุนแรง 1 ล้าน คู่กับมะเร็งระยะเริ่มต้นและรุนแรง 5 แสน
     โครงติ๊กกลุ่มละครั้งทำชุดข้อ 2 ไม่ได้เลย ไม่ว่าจะจัดหน้าอย่างไร */
  assert.ok(!html.includes('<select id="dcare_stage">'), 'ตัวเลือกแบบรวมอันเดียวต้องถูกถอดออก');
  assert.ok(!html.includes('class="dcare-chk"'), 'ต้องไม่เหลือโครงติ๊กกลุ่มละครั้ง');
  assert.match(html, /function dcareAddRow\(catKey, stage, capital\)\{/);
  assert.match(html, /function dcareRemoveRow\(id\)\{/);
  assert.match(html, /onclick="dcareAddRow\(\)"/);
  assert.match(html, /<select class="dcare-cat"/);
  assert.match(html, /<select class="dcare-stage"/);
  assert.match(html, /<input type="number" class="dcare-cap"/);

  /* คีย์ของคอลัมน์ต้องผูกกับรายการ ไม่ใช่ผูกกับกลุ่มโรค
     ถ้าใช้ชื่อกลุ่มเป็นคีย์ รายการที่สองของกลุ่มเดิมจะไปทับค่าของรายการแรกทั้งตาราง */
  assert.match(html, /colKey:'dcare_'\+i/);
  assert.ok(!html.includes("cols.push({key:'dcare_'+d.key"), 'คอลัมน์ยังผูกกับกลุ่มโรคอยู่');
  assert.match(html, /cols\.push\(\{key:d\.colKey, label:d\.itemName\}\)/);
  assert.match(html, /row\.values\[d\.colKey\]/);
  // ชื่อรายการต้องบอกแบบด้วย ไม่งั้นสองรายการของกลุ่มเดียวกันจะอ่านไม่ออกว่าอันไหนคืออันไหน
  assert.match(html, /itemName:`D Care - \$\{shortLabel\} \(\$\{DCARE_STAGES\[stage\]\.label\}\)`/);

  // เพดานนับแยกตามแบบ รายการคนละแบบต้องไม่ดึงกันจนเกินเพดาน
  assert.match(html, /function dcareSumByStage\(selections, stageKey\)\{/);
  assert.match(html, /const sum = dcareSumByStage\(inp\.dcareSelections, stageKey\);/);
  assert.ok(!html.includes('if(dcareTotal > 2500000){'), 'ยังเหลือเพดานตายตัวในการตรวจก่อนคำนวณ');
  assert.match(html, /const rowOverCap = dcareOverStages\.some\(o => o\.k === d\.stage\);/);

  /* โรคยอดฮิตยังต้องซื้อเดี่ยว แต่ต้องนับว่ามี "กลุ่มอื่น" ปนไหม
     ไม่ใช่นับจำนวนรายการ ไม่งั้นโรคยอดฮิตสองแบบจะโดนเตือนทั้งที่ยังเป็นกลุ่มเดียว */
  assert.match(html, /if\(hasPopular && inp\.dcareSelections\.some\(d=>d\.key!=='popular'\)\)\{/);
});

test('เลือกแบบแล้ว เบี้ยที่คำนวณต้องเปลี่ยนตามแบบของรายการนั้น ไม่ใช่เตือนอย่างเดียว', () => {
  // เคยพลาดได้ง่าย คือเตือนเพดานถูกแต่ยังคิดเบี้ยด้วยแบบเดิม ลูกค้าเลยเห็นเบี้ยผิด
  for(const call of [
    "dcarePremium(d.key, d.capital, gender, age, freq, d.stage)",
    "dcarePremium(d.key, d.capital, gender, entryAge, 'annual', d.stage)",
    "dcarePremium(d.key, d.capital, gender, age, 'annual', d.stage)",
  ]) assert.ok(html.includes(call), `ยังไม่ได้ส่งแบบของรายการนั้นเข้าไปที่ ${call}`);
  assert.ok(!html.includes('inp.dcareStage'), 'ยังเหลือการอ่านแบบรวมอันเดียว');
  // ชุดที่กดมาจากผู้ช่วยจัดแผนต้องสร้างรายการตามที่เสนอ ไม่งั้นเบี้ยที่เห็นสองหน้าจะไม่ตรงกัน
  assert.match(html, /dcareAddRow\(it\.cat \|\| 'popular', it\.stage \|\| 'early_and_severe', it\.capital\);/);
  assert.match(html, /function dcareClearRows\(\)\{/);
  assert.match(html, /\n  dcareClearRows\(\);/);
});


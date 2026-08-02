import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const RATES = JSON.parse(readFileSync(new URL('../data/premium-rates.json', import.meta.url), 'utf8'));

/* บัคที่เจอจริงบน production เมื่อ 2 ส.ค.
   mainPremiumAtEntry ลงท้ายด้วย else เปล่า ๆ แผนที่ยังไม่มีสาขาเป็นของตัวเอง
   จึงตกลงมาได้ "เบี้ยของ 99/99" ไปแบบเงียบ ๆ หน้าเทียบเลยโชว์ตัวเลขที่ดูสมเหตุสมผล
   แต่เป็นของแบบอื่น เฟล็กซี่ 99/20 โชว์ 17,330 ทั้งที่ตารางจริงคือ 35,500
   เทสต์ชุดนี้เทียบกับตารางดิบตรง ๆ ไม่ผ่านโค้ดคำนวณ จึงจับได้แม้ตรรกะเปลี่ยน */

test('ท้าย mainPremiumAtEntry ต้องไม่เป็น catch-all ที่กลืนแผนแปลกปลอม', () => {
  const fn = html.slice(html.indexOf('function mainPremiumAtEntry('));
  const body = fn.slice(0, fn.indexOf('\n}\n') + 3);
  assert.match(body, /\} else if\(plan === '99_99'\)\{/,
    'บล็อกสุดท้ายต้องผูกกับ 99_99 ชัดเจน ไม่ใช่ else เปล่า');
  assert.match(body, /\n  return null;\n\}/,
    'แผนที่ไม่รู้จักต้องคืน null ให้หน้าเว็บขึ้นว่าคำนวณไม่ได้ ดีกว่าโชว์เลขของแบบอื่น');
});

test('เฟล็กซี่ 99/20 ต้องมีสาขาของตัวเอง และห้ามเทียบบัญญัติไตรยางศ์', () => {
  assert.match(html, /if\(plan === 'flexi_99_20'\)\{/,
    'ไม่มีสาขาของ flexi_99_20 จะตกไปใช้ตารางแบบอื่น');
  // ตารางนี้เป็นเบี้ยจริงรายระดับทุน ไม่ใช่อัตราต่อ 1,000 จึงคูณหารไม่ได้
  // ต้องตัดด้วยวงเล็บปีกกาด้วย เพราะ flexi_99_5 โผล่ในฟังก์ชันชื่อแผนก่อนหน้าอีกที่
  const from = html.indexOf("if(plan === 'flexi_99_20'){");
  const seg = html.slice(from, html.indexOf("if(plan === 'flexi_99_5'){", from));
  assert.ok(seg.length > 0 && seg.length < 800, 'ตัดช่วงโค้ดของ flexi_99_20 ไม่ได้');
  assert.ok(!/capital \/ 1000/.test(seg), 'ห้ามคูณหารทุนกับตารางที่เป็นเบี้ยจริง');
  assert.match(seg, /if\(!key\) return null;/, 'ทุนที่ไม่มีในตารางต้องคืน null ไม่ใช่เดา');
});

test('คีย์แผนสะสมทรัพย์ต้องรับได้ทั้งชื่อสั้นและชื่อเต็ม', () => {
  // หน้าคำนวณส่ง 15_3 แต่หน้าเทียบส่ง smart_link_15_3 เดิมไม่ match เลยตกไป catch-all
  assert.match(html, /SAVINGS_MAIN_PLANS = new Set\(\['15_3','15_6','smart_link_15_3','smart_link_15_6'\]\)/);
  assert.match(html, /plan === '15_3' \|\| plan === 'smart_link_15_3'/);
});

/* ระดับทุนที่หน้าเทียบเปิดให้เลือก ต้องมีอยู่จริงในตารางของแบบนั้น
   ไม่งั้นเลือกแล้วได้ null หรือได้เลขจากตารางอื่น */
function tiersOf(id){
  const i = html.indexOf(`  ${id}: {title:`);
  const seg = html.slice(i, i + 700);
  return [...seg.matchAll(/\{value:'(\d+)'/g)].map(m => Number(m[1]));
}

test('ระดับทุนของแบบสะสมทรัพย์ต้องตรงกับตารางจริง', () => {
  const cases = [
    ['smartlink153', 'smart_link_15_3'],
    ['smartlink156', 'smart_link_15_6'],
  ];
  for (const [id, key] of cases) {
    const real = RATES[key].capitals;
    for (const t of tiersOf(id)) {
      assert.ok(real.includes(t),
        `${id} เปิดให้เลือกทุน ${t.toLocaleString()} แต่ตาราง ${key} มีแค่ ${real.join(', ')}`);
    }
  }
});

test('ระดับทุนของ เฟล็กซี่ 99/20 ต้องตรงกับ allowed_capitals', () => {
  const real = RATES.flexi_99_20.allowed_capitals;
  for (const t of tiersOf('flexi9920')) {
    assert.ok(real.includes(t),
      `flexi9920 เปิดให้เลือกทุน ${t.toLocaleString()} แต่ตารางมีแค่ ${real.join(', ')}`);
  }
});

/* ค่าอ้างอิงที่อ่านจากตารางดิบด้วยมือ ใช้เป็นหมุดกันเลขเพี้ยน
   ถ้าวันไหนตัวเลขพวกนี้เปลี่ยน แปลว่าตารางเปลี่ยนหรือโค้ดอ่านผิด ต้องมาดูทุกครั้ง */
test('หมุดตรวจ เฟล็กซี่ 99/20 ชาย อายุ 35', () => {
  const g = RATES.flexi_99_20;
  assert.equal(g.m_1m[35 - g.age_start], 35500);
  assert.equal(g.payment_schedules.annual.m_1m[35], 35500,
    'ตารางรายปีใน payment_schedules ต้องตรงกับตารางหลัก');
  // เลขเดิมที่ผิดคือ 17330 ซึ่งเป็นของ 99/99 ห้ามกลับมาอีก
  assert.notEqual(g.m_1m[35 - g.age_start], 17330);
});

test('หมุดตรวจ สมาร์ท ลิงค์ ชาย อายุ 35', () => {
  for (const key of ['smart_link_15_3', 'smart_link_15_6']) {
    const g = RATES[key];
    const band = g.bands.find(([f, t]) => 35 >= f && 35 <= t);
    assert.ok(band, `${key} ไม่มีแบนด์ที่ครอบคลุมอายุ 35`);
    const i1m = g.capitals.indexOf(1000000);
    assert.equal(band[i1m + 2], 945000, `${key} ทุน 1 ล้าน ควรได้ 945,000`);
  }
  // สองแบบนี้มีระดับทุนไม่เหมือนกัน ห้ามใช้ชุด tier ร่วมกัน
  assert.notDeepEqual(RATES.smart_link_15_3.capitals, RATES.smart_link_15_6.capitals);
});

test('ทุกแบบในหน้าเทียบต้องมีจำนวนปีชำระเบี้ยระบุไว้', () => {
  // เคยพลาด: 4 แบบตกหล่นจากตาราง payYears แล้วไปขึ้นว่า "ชำระจนครบสัญญา"
  // ขัดกับแถว "ระยะเวลาชำระเบี้ย" ในหน้าเดียวกันที่บอกว่า 20 ปี
  const py = html.slice(html.indexOf('const payYears = {'));
  const block = py.slice(0, py.indexOf('};'));
  const inMap = [...block.matchAll(/'([a-z0-9_]+)'\s*:/g)].map(m => m[1]);
  const lb = html.slice(html.indexOf('const LIFE_COMPARE_PRODUCTS = {'));
  const plans = [...new Set([...lb.matchAll(/plan:'([a-z0-9_]+)'/g)].map(m => m[1]))];
  for (const p of plans) {
    assert.ok(inMap.includes(p), `แบบ ${p} ไม่มีในตาราง payYears จะขึ้นเบี้ยรวมผิด`);
  }
});

test('แบบที่ไม่รู้จำนวนปีชำระ ต้องขึ้น "-" ไม่ใช่เดาว่าจ่ายจนตาย', () => {
  assert.match(html, /if\(!\(plan in payYears\)\) return '<span class="compare-na">-<\/span>';/);
});

test('จำนวนปีชำระต้องตรงกับข้อมูลในตารางเบี้ย', () => {
  const py = html.slice(html.indexOf('const payYears = {'));
  const block = py.slice(0, py.indexOf('};'));
  const get = k => {
    const m = block.match(new RegExp(`'${k}'\\s*:\\s*(\\d+|null)`));
    return m ? (m[1] === 'null' ? null : Number(m[1])) : undefined;
  };
  // แต่ละตารางเก็บชื่อฟิลด์ต่างกัน แบบชำระครั้งเดียวใช้ premium_paying_years
  for (const key of ['smart_link_15_3', 'smart_link_15_6', 'whole_life_99_1_cashback']) {
    const fromData = RATES[key].pay_years ?? RATES[key].premium_paying_years;
    assert.ok(fromData != null, `${key} ไม่มีข้อมูลจำนวนปีชำระในตารางเบี้ย`);
    assert.equal(get(key), fromData, `${key} ระบุปีชำระไม่ตรงกับตารางเบี้ย`);
  }
  assert.equal(get('flexi_99_20'), 20, 'เฟล็กซี่ 99/20 ชำระ 20 ปี ตามชื่อแบบ');
});

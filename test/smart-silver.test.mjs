import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

/* สมาร์ท ซิลเวอร์ / สมาร์ท ซิลเวอร์ พลัส (สัญญาเพิ่มเติมสมาร์ท แคร์ / สมาร์ท แคร์ พลัส)
   อัตราจากเอกสารอัตราเบี้ยของบริษัท Update 07.05.67 มีเฉพาะรายปี อายุ 40-80 */

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const RATES = JSON.parse(readFileSync(new URL('data/premium-rates.json', root), 'utf8'));
const T = RATES.smart_care;

function slice(from, to){
  const i = html.indexOf(from); assert.notEqual(i, -1, from);
  const j = html.indexOf(to, i); assert.notEqual(j, -1, to);
  return html.slice(i, j);
}
const ctx = vm.createContext({ RATES, Math, Number, Array, String });
vm.runInContext(slice('const SMART_SILVER_CAPS = ', 'function smartSilverBenefitTable(){')
  + '\nglobalThis.R = {smartSilverPartPremium, smartSilverPremium};', ctx);
const { smartSilverPartPremium: part, smartSilverPremium: total } = ctx.R;

test('ตารางครบอายุ 40-80 ทุกตาราง', () => {
  for(const g of ['m','f']){
    assert.equal(T.alz_stroke[g].length, 41);
    assert.equal(T.tpd[g].length, 41);
  }
  assert.equal(T.fracture.occ_1_2.length, 41);
  assert.equal(T.fracture.occ_3.length, 41);
});

test('ตัวเลขตรงกับเอกสารของบริษัท (สุ่มตรวจ)', () => {
  assert.equal(part('alz', 1000000, 'm', 40, '1'), 1090);
  assert.equal(part('alz', 5000000, 'f', 80, '1'), 405450);
  assert.equal(part('tpd', 1000000, 'm', 80, '2'), 12400);
  assert.equal(part('tpd', 3000000, 'f', 50, '3'), 1080);
  assert.equal(part('fx', 250000, 'm', 40, '1'), 7097);
  assert.equal(part('fx', 500000, 'f', 80, '3'), 22176);
  assert.equal(part('fx', 250000, 'm', 56, '2'), 7277);
});

test('ทุกช่องโรคสมอง/ทุพพลภาพ แผน N ล้าน = N × แผน 1 ล้าน (ยกเว้นช่องที่เอกสารพิมพ์ผิด)', () => {
  for(const tbl of [T.alz_stroke, T.tpd]) for(const g of ['m','f']) tbl[g].forEach((r, i) => {
    for(let k = 1; k < 5; k++){
      if(r[k] === null){ assert.ok(tbl === T.alz_stroke && g === 'f' && i === 35 && k === 1, 'มีช่องว่างที่ไม่ได้บันทึกเหตุผล'); continue; }
      assert.equal(r[k], r[0]*(k+1), `อายุ ${40+i} ${g} แผน ${k+1}`);
    }
  });
  assert.equal(T.data_issues.length, 1);
  assert.equal(T.data_issues[0].printed, 61880);
});

test('ช่องที่เอกสารพิมพ์ผิดต้องคืน null ไม่เดาเบี้ย', () => {
  assert.equal(part('alz', 2000000, 'f', 75, '1'), null);
  assert.equal(total({alz:2000000}, 'f', 75, '1', 'annual'), null);
});

test('เบี้ยรวม = ผลรวมของข้อที่เลือก · งวดอื่นและอายุนอกช่วงคืน null', () => {
  assert.equal(total({alz:1000000, tpd:1000000, fx:250000}, 'f', 50, '1', 'annual'), 3020 + 360 + 7251);
  assert.equal(total({alz:1000000}, 'm', 50, '1', 'monthly'), null);
  assert.equal(total({alz:1000000}, 'm', 39, '1', 'annual'), null);
  assert.equal(total({alz:1000000}, 'm', 81, '1', 'annual'), null);
  assert.equal(total({fx:250000}, 'm', 50, '4', 'annual'), null);
  assert.equal(total({}, 'm', 50, '1', 'annual'), null);
});

test('มีหน้าแผน รูปหน้าปก โบรชัวร์ และอยู่ในเครื่องคำนวณ', () => {
  assert.match(html, /smartsilver: \{\s*\n\s*title: 'สมาร์ท ซิลเวอร์ \/ สมาร์ท ซิลเวอร์ พลัส'/);
  assert.match(html, /smartsilver: '\/plans\/smart-silver'/);
  assert.match(html, /showPlanDetail\('smartsilver'\)/);
  assert.match(html, /id="use_smart_silver"/);
  assert.ok(existsSync(new URL('public/brochures/smart-silver.pdf', root)));
  assert.ok(existsSync(new URL('public/plan-covers/smart-silver.jpg', root)));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* บัคที่เจอตอนกวาดหน้าวางแผนภาษี
   หน้าเว็บเสนอว่า "ลงมาฐาน 0% ต้องหาค่าลดหย่อนเพิ่มอีก 1,581,000 บาท"
   ทั้งที่สิทธิลดหย่อนที่กฎหมายให้ซื้อเพิ่มได้จริงเหลือแค่ 800,000
   ต่อให้มีเงินเป็นสิบล้านก็ทำไม่ได้ เป็นการให้ความหวังผิดกับลูกค้า
   และถ้าลูกค้าเชื่อแล้วโอนเงินไปซื้อกองทุนเกินสิทธิ ส่วนที่เกินจะลดหย่อนไม่ได้เลย */

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const RULES = JSON.parse(readFileSync(new URL('../data/tax-rules.json', import.meta.url), 'utf8'));

function grab(sig){
  const i = html.indexOf(sig);
  let d = 0, started = false;
  for(let j = i; j < html.length; j++){
    if(html[j] === '{'){ d++; started = true; }
    else if(html[j] === '}'){ d--; if(started && d === 0) return html.slice(i, j + 1); }
  }
}
const sb = vm.createContext({});
vm.runInContext(['taxExpenseFor','taxIncomeSummary','taxDeductions','taxDonation',
                 'taxOf','taxCompute','taxPlanOptions','taxHeadroom']
  .map(n => grab('function ' + n + '(')).join('\n'), sb);
const C = (n, ...a) => vm.runInContext(n, sb)(...a);

// เคสจริงที่จับบัคได้ หมอเงินเดือน 1.2 ล้าน + คลินิก 2 ล้าน ใช้สิทธิประกันเต็มแล้ว
const CASE = {
  income: { s40_1:{amount:1200000}, s40_6:{amount:2000000, option:'medical'} },
  deductions: { life:100000, socialSecurity:9000 },
};

test('สิทธิที่เหลือต้องคิดจากเพดานจริง ไม่ใช่บวกทุกช่องดื้อ ๆ', () => {
  const r = C('taxCompute', CASE, RULES);
  const h = C('taxHeadroom', CASE, r, RULES);
  // ประกันชีวิตใช้เต็ม 100,000 แล้ว ต้องเหลือ 0 ไม่ใช่ยังนับให้อีก
  assert.equal(h.buy.find(x => /ประกันชีวิต/.test(x.label)).room, 0);
  assert.equal(h.buy.find(x => /RMF/.test(x.label)).room, 500000);
  assert.equal(h.buy.find(x => /Thai ESG/.test(x.label)).room, 300000);
  assert.equal(h.buyable, 800000);
  // ของที่ต้องเข้าเงื่อนไขก่อน ห้ามนับรวมในยอดที่บอกว่าซื้อเพิ่มได้ทันที
  assert.ok(h.withConditions > h.buyable);
});

test('RMF กับประกันบำนาญใช้เพดานกลุ่มร่วมกัน ห้ามบวกตรง ๆ', () => {
  // รายได้สูงมาก เพดาน % ของทั้งสองตัวรวมกันจะเกิน 500,000 ไปไกล
  // ถ้าโค้ดบวกตรง ๆ จะได้เลขเกินเพดานกลุ่ม
  const big = { income: { s40_1:{amount:20000000} }, deductions: {} };
  const r = C('taxCompute', big, RULES);
  const h = C('taxHeadroom', big, r, RULES);
  assert.equal(h.buy.find(x => /RMF/.test(x.label)).room, RULES.deductions.retirementGroup.cap);
});

test('ขั้นที่สิทธิไปไม่ถึง ต้องติดธงว่าทำไม่ได้ พร้อมบอกว่าขาดอีกเท่าไร', () => {
  const r = C('taxCompute', CASE, RULES);
  const h = C('taxHeadroom', CASE, r, RULES);
  const opts = C('taxPlanOptions', r.netIncome, RULES, h);
  assert.ok(opts.length > 1);
  for(const o of opts){
    assert.equal(o.reachable, o.extraDeduction <= h.buyable + 0.5);
    assert.equal(o.shortfall, o.reachable ? 0 : o.extraDeduction - h.buyable);
  }
  // เคสนี้เหลือ 800,000 จึงลงได้แค่ฐาน 20% ฐานที่ต่ำกว่านั้นต้องขึ้นว่าทำไม่ได้
  assert.equal(opts.filter(o => o.reachable).length, 1);
  assert.equal(opts.find(o => o.reachable).targetRate, 0.20);
});

test('ไม่ส่งสิทธิที่เหลือเข้าไป ต้องถือว่าทำได้หมด เพื่อไม่ให้ค่าเริ่มต้นเปลี่ยนพฤติกรรมเดิม', () => {
  const r = C('taxCompute', CASE, RULES);
  for(const o of C('taxPlanOptions', r.netIncome, RULES)){
    assert.equal(o.reachable, true);
    assert.equal(o.shortfall, 0);
  }
});

/* เคสค้าขาย 5 ล้าน สิทธิเหลือ 900,000 แต่ต้องใช้ 940,000 จึงจะข้ามฐาน
   ขาดแค่ 40,000 ทุกขั้นเลยขึ้นว่าทำไม่ได้หมด หน้าเว็บจึงไม่เหลือคำแนะนำสักอัน
   ทั้งที่ใส่ค่าลดหย่อนเต็มสิทธิยังประหยัดภาษีได้ 225,000 บาท */
test('ถึงข้ามฐานไม่ได้ ก็ต้องบอกว่าใส่เต็มสิทธิแล้วประหยัดเท่าไร', () => {
  assert.match(html, /const fullTaxAfter = taxOf\(Math\.max\(0, r\.netIncome - headroom\.buyable\), TAX_RULES\)\.tax;/);
  assert.match(html, /const fullSaved = r\.tax - fullTaxAfter;/);
  // ต้องขึ้นเมื่อยังมีสิทธิเหลือและประหยัดได้จริงเท่านั้น ไม่ใช่ขึ้นตลอด
  assert.match(html, /\(headroom\.buyable > 0 && fullSaved > 0\) \? `<div class="tx-full">/);
  assert.match(html, /ค่าลดหย่อนช่วยประหยัดภาษีเสมอ ถึงจะยังไม่ข้ามไปฐานถัดไปก็ตาม/);
  // ต้องอยู่เหนือการ์ดขั้นภาษี เพราะเป็นสิ่งที่ทำได้จริง
  assert.ok(html.indexOf('${fullBox}') < html.indexOf('<div class="tx-opts">${plan}</div>'));
});

test('ตัวเลขในกล่องใส่เต็มสิทธิ ต้องตรงกับที่คำนวณย้อนกลับได้', () => {
  const CASES = [
    { income:{ s40_8:{amount:5000000, option:'rate60'} }, deductions:{} },
    { income:{ s40_1:{amount:1000000} }, deductions:{ life:50000 } },
    CASE,
  ];
  for(const c of CASES){
    const r = C('taxCompute', c, RULES);
    const h = C('taxHeadroom', c, r, RULES);
    const after = C('taxOf', Math.max(0, r.netIncome - h.buyable), RULES).tax;
    assert.ok(after <= r.tax + 0.01, 'ใส่ลดหย่อนเพิ่มแล้วภาษีต้องไม่เพิ่ม');
    // เงินคืนต่อบาทห้ามเกินอัตราสูงสุด 35%
    if(h.buyable > 0) assert.ok((r.tax - after) / h.buyable <= 0.351);
  }
});

test('หน้าเว็บต้องติดป้ายแนะนำเฉพาะขั้นที่ทำได้จริง', () => {
  assert.match(html, /const bestIdx = opts\.findIndex\(o => o\.reachable && o\.targetRate <= comfort\);/);
  assert.match(html, /tx-tag-off">สิทธิลดหย่อนไม่พอ/);
  assert.match(html, /const headroom = taxHeadroom\(taxState, r, TAX_RULES\);/);
  assert.match(html, /taxPlanOptions\(r\.netIncome, TAX_RULES, headroom\)/);
  // ยอดรวมที่ซื้อเพิ่มได้ ต้องโชว์ให้เห็น ไม่งั้นลูกค้าไม่รู้ว่ากำแพงอยู่ตรงไหน
  assert.match(html, /<div class="tx-room-k">รวมแล้วซื้อเพิ่มได้อีก<\/div>/);
  assert.match(html, /fmt\(Math\.round\(headroom\.buyable\)\)/);
  // ต้องไม่แยกเป็นการ์ดใหม่ที่ไปซ้ำกับแถบเพดานสามก้อน
  assert.ok(!html.includes('<h2>สิทธิลดหย่อนที่ยังเหลืออยู่</h2>'),
    'อย่าทำการ์ดแยกที่บอกข้อมูลซ้ำกับแถบเพดานด้านบน');
});

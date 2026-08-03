import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* หน้าวางแผนภาษีเดิมตอบได้แค่ "ลงฐานไหนได้บ้าง" ซึ่งไม่ใช่คำถามจริงของลูกค้า
   คำถามจริงคือ "ปีนี้ควรควักเท่าไร" และคำตอบต้องดูกระแสเงินสดด้วย
   ลดหย่อนเยอะแล้วเงินไม่พอใช้ ไม่ใช่แผนที่ดี ต่อให้ประหยัดภาษีได้มากก็ตาม */

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
vm.runInContext(['taxExpenseFor','taxIncomeSummary','taxDeductions','taxDonation','taxOf','taxCompute',
                 'taxPlanOptions','taxHeadroom','taxEfficientCeiling','taxAllocate','taxPackages',
                 'taxNoPackReason']
  .map(n => grab('function ' + n + '(')).join('\n'), sb);
const C = (n, ...a) => vm.runInContext(n, sb)(...a);

const run = (input, budget) => {
  const r = C('taxCompute', input, RULES);
  const h = C('taxHeadroom', input, r, RULES);
  return { r, h, packs: C('taxPackages', r, h, RULES, budget ?? null) };
};

const DOCTOR = {
  income: { s40_1:{amount:1200000}, s40_6:{amount:2000000, option:'medical'} },
  deductions: { life:100000, socialSecurity:9000 },
};

test('ค่ากติกาของผู้วางแผนต้องอยู่ในไฟล์ข้อมูล ไม่ใช่ฝังในโค้ด', () => {
  const P = RULES.planner;
  for(const k of ['comfortRateMax','efficiencyFloorRate','defaultBudgetPctOfIncome',
                  'tierPct','cashflowWarnPctOfIncome'])
    assert.ok(P[k] != null, `ขาดค่า planner.${k}`);
  assert.deepEqual(Object.keys(P.tierPct), ['light','balanced','max']);
  assert.ok(P.tierPct.light < P.tierPct.balanced && P.tierPct.balanced < P.tierPct.max);
});

test('เส้นความคุ้ม ต้องหยุดตรงที่บาทถัดไปได้คืนต่ำกว่าเกณฑ์', () => {
  // เกณฑ์ 15% ขอบบนของฐาน 10% คือ 500,000 จึงไม่ควรลดหย่อนลงต่ำกว่านั้น
  assert.equal(C('taxEfficientCeiling', 1731000, RULES), 1231000);
  assert.equal(C('taxEfficientCeiling', 600000, RULES), 100000);
  // อยู่ในฐานที่ต่ำกว่าเกณฑ์อยู่แล้ว ต้องได้ 0 ไม่ใช่ติดลบ
  assert.equal(C('taxEfficientCeiling', 440000, RULES), 0);
  assert.equal(C('taxEfficientCeiling', 0, RULES), 0);
});

test('แพ็กเกจสามระดับ ต้องเรียงจากเบาไปเต็มที่ และไม่หลุดกรอบทั้งสามอย่าง', () => {
  const { r, h, packs } = run(DOCTOR);
  // อาเรย์มาจาก vm คนละ realm เทียบ deepStrictEqual ไม่ผ่านเพราะ prototype ไม่ใช่ตัวเดียวกัน
  assert.equal(packs.map(p => p.id).join(','), 'light,balanced,max');
  const limit = Math.min(h.buyable, C('taxEfficientCeiling', r.netIncome, RULES),
                         r.income.gross * RULES.planner.defaultBudgetPctOfIncome);
  let prev = 0;
  for(const p of packs){
    assert.ok(p.amount > prev); prev = p.amount;
    assert.ok(p.amount <= limit + 0.5, `${p.label} เกินกรอบ`);
  }
  assert.equal(packs.at(-1).amount, Math.round(limit));
});

test('ต้องบอกเงินสดที่ควักจริง ไม่ใช่บอกแต่ภาษีที่ประหยัด', () => {
  const { r, packs } = run(DOCTOR);
  for(const p of packs){
    // เงินที่หายจากกระเป๋า = เงินที่จ่าย ลบ ภาษีที่ได้คืน
    assert.equal(Math.round(p.netCash), Math.round(p.amount - p.saved));
    assert.ok(p.netCash > 0, 'ลดหย่อนไม่เคยได้เงินคืนเกินที่จ่าย ห้ามทำให้ดูเหมือนได้กำไร');
    assert.equal(Math.round(p.perMonth), Math.round(p.amount / 12));
    assert.equal(Math.round(r.tax - p.saved), Math.round(C('taxOf', r.netIncome - p.amount, RULES).tax));
  }
});

test('กรอกงบเท่าไร ต้องไม่เสนอเกินงบนั้น', () => {
  for(const budget of [30000, 100000, 250000]){
    const { packs } = run(DOCTOR, budget);
    for(const p of packs) assert.ok(p.amount <= budget + 0.5,
      `งบ ${budget} แต่เสนอ ${p.amount}`);
    assert.equal(packs.at(-1).amount, budget);
  }
});

test('ทุกบาทที่แนะนำ ต้องได้คืนไม่ต่ำกว่าเกณฑ์ที่ตั้งไว้', () => {
  const CASES = [DOCTOR,
    { income:{ s40_1:{amount:1200000} }, deductions:{} },
    { income:{ s40_8:{amount:10000000, option:'rate60'} }, deductions:{} },
  ];
  for(const c of CASES)
    for(const p of run(c).packs)
      assert.ok(p.perBaht >= RULES.planner.efficiencyFloorRate - 1e-9,
        `ได้คืน ${(p.perBaht*100).toFixed(1)} สตางค์ ต่ำกว่าเกณฑ์`);
});

test('การแบ่งเงินลงช่อง ต้องรวมได้เท่ายอดแพ็กเกจ และประกันมาก่อน', () => {
  const fresh = { income:{ s40_1:{amount:5000000} }, deductions:{} };
  const { packs } = run(fresh, 900000);
  for(const p of packs)
    assert.equal(Math.round(p.allocation.reduce((s,a)=>s+a.amount,0)), Math.round(p.amount));
  // ยังไม่ได้ซื้อประกันเลย ก้อนแรกต้องลงประกันก่อน เพราะได้ความคุ้มครองติดมาด้วย
  assert.match(packs[0].allocation[0].label, /ประกันชีวิต/);
});

test('ฐานภาษีต่ำ ต้องไม่เชียร์ให้ซื้อ และต้องบอกเหตุผลตรง ๆ', () => {
  const low = { income:{ s40_1:{amount:600000} }, deductions:{} };
  const { r, h, packs } = run(low);
  assert.equal(packs.length, 0, 'ฐาน 10% ไม่ควรเชียร์ให้ล็อกเงินหลายปี');
  const why = C('taxNoPackReason', r, h, RULES);
  assert.match(why, /ควรซื้อเพราะต้องการความคุ้มครอง ไม่ใช่เพราะเรื่องภาษี/);

  // ไม่ต้องเสียภาษีอยู่แล้ว ต้องบอกแบบนั้น ไม่ใช่บอกว่าไม่คุ้ม
  const none = { income:{ s40_1:{amount:300000} }, deductions:{} };
  const n = run(none);
  assert.equal(n.r.tax, 0);
  assert.match(C('taxNoPackReason', n.r, n.h, RULES), /ไม่ต้องเสียภาษีอยู่แล้ว/);

  // ใช้สิทธิเต็มแล้ว ต้องบอกว่าเต็มแล้ว
  const full = { income:{ s40_1:{amount:5000000} },
    deductions:{ life:100000, rmf:500000, thaiEsg:300000 } };
  const f = run(full);
  assert.equal(f.h.buyable, 0);
  assert.match(C('taxNoPackReason', f.r, f.h, RULES), /ใช้สิทธิลดหย่อนเต็มทุกช่องแล้ว/);
});

test('ก้อนที่กินสัดส่วนรายได้สูง ต้องติดคำเตือนเรื่องสภาพคล่อง', () => {
  const { packs } = run(DOCTOR, 2000000);   // งบสูงกว่าสิทธิที่เหลือ จะถูกตัดด้วยสิทธิ
  const heavy = packs.filter(p => p.pctOfIncome > RULES.planner.cashflowWarnPctOfIncome);
  for(const p of heavy) assert.equal(p.heavy, true);
  assert.match(html, /ก้อนนี้กินสัดส่วนรายได้สูง ต้องมั่นใจว่าเงินสดหมุนไหวจริงก่อนตัดสินใจ/);
});

test('หน้าเว็บต้องโชว์แพ็กเกจเป็นหลัก และย้ายบันไดฐานภาษีไปเป็นข้อมูลประกอบ', () => {
  assert.match(html, /<h2>ปีนี้ควรลดหย่อนเพิ่มเท่าไร<\/h2>/);
  assert.match(html, /<div class="tx-packs">\$\{packHtml\}<\/div>/);
  assert.match(html, /id="taxBudget"[\s\S]{0,200}oninput="setTaxBudget\(this\.value\)"/);
  assert.match(html, /<details class="content-card tx-ladder">/);
  // บันไดต้องอยู่หลังแพ็กเกจ
  assert.ok(html.indexOf('<div class="tx-packs">') < html.indexOf('class="content-card tx-ladder"'));
  // แถวเงินสดที่ควักจริงต้องมีอยู่จริงบนการ์ด
  assert.match(html, /<tr><td>เงินที่หายจากกระเป๋าจริง<\/td>/);
  assert.match(html, /เฉลี่ยเดือนละ \$\{fmt\(Math\.round\(p\.perMonth\)\)\} บาท/);
});

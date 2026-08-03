import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const RULES = JSON.parse(readFileSync(new URL('../data/tax-rules.json', import.meta.url), 'utf8'));

/* ดึงฟังก์ชันคำนวณภาษีออกมาจาก index.html มาทดสอบตรง ๆ
   ตัวเลขภาษีผิดไม่ได้ จึงต้องทดสอบตรรกะจริงที่หน้าเว็บใช้ ไม่ใช่ทดสอบสำเนา */
function grab(sig){
  const i = html.indexOf(sig);
  assert.notEqual(i, -1, `หาไม่เจอ: ${sig}`);
  let depth = 0, started = false;
  for(let j = i; j < html.length; j++){
    if(html[j] === '{'){ depth++; started = true; }
    else if(html[j] === '}'){ depth--; if(started && depth === 0) return html.slice(i, j + 1); }
  }
  throw new Error(`ตัดฟังก์ชันไม่จบ: ${sig}`);
}
const sandbox = vm.createContext({});
vm.runInContext([
  grab('function taxExpenseFor('),
  grab('function taxIncomeSummary('),
  grab('function taxDeductions('),
  grab('function taxDonation('),
  grab('function taxOf('),
  grab('function taxCompute('),
  grab('function taxPlanOptions('),
].join('\n'), sandbox);
const call = (name, ...a) => vm.runInContext(name, sandbox)(...a);

/* ---------- อัตราภาษีขั้นบันได ---------- */
test('ภาษีตรงกับตารางภาษีสะสมของกรมสรรพากรทุกขอบขั้น', () => {
  // ตัวเลขคอลัมน์ "ภาษีสะสมสูงสุดของขั้น" จาก rd.go.th/59670.html
  const pins = [
    [150000, 0], [300000, 7500], [500000, 27500], [750000, 65000],
    [1000000, 115000], [2000000, 365000], [5000000, 1265000],
  ];
  for (const [net, expected] of pins) {
    assert.equal(call('taxOf', net, RULES).tax, expected, `เงินได้สุทธิ ${net} ควรเสียภาษี ${expected}`);
  }
  // เกิน 5 ล้านเสีย 35% ของส่วนที่เกิน
  assert.equal(call('taxOf', 6000000, RULES).tax, 1265000 + 1000000 * 0.35);
});

test('เงินได้สุทธิไม่เกิน 150,000 ไม่เสียภาษี และค่าติดลบต้องไม่พัง', () => {
  assert.equal(call('taxOf', 150000, RULES).tax, 0);
  assert.equal(call('taxOf', 0, RULES).tax, 0);
  assert.equal(call('taxOf', -500000, RULES).tax, 0);
});

test('อัตราขั้นสูงสุดที่โดน ต้องรายงานให้ถูก', () => {
  assert.equal(call('taxOf', 400000, RULES).topRate, 0.10);
  assert.equal(call('taxOf', 900000, RULES).topRate, 0.20);
  assert.equal(call('taxOf', 100000, RULES).topRate, 0);
});

/* ---------- การหักค่าใช้จ่าย ---------- */
test('40(1) กับ 40(2) ต้องแชร์เพดาน 100,000 ไม่ใช่หักแยกกันคนละแสน', () => {
  const rows = { s40_1: { amount: 1000000 }, s40_2: { amount: 1000000 } };
  const a = call('taxExpenseFor', 's40_1', rows, RULES).expense;
  const b = call('taxExpenseFor', 's40_2', rows, RULES).expense;
  assert.equal(Math.round(a + b), 100000, 'รวมกันต้องไม่เกิน 100,000');
  // มีแค่ประเภทเดียวก็ยังได้เต็มเพดาน
  assert.equal(call('taxExpenseFor', 's40_1', { s40_1: { amount: 1000000 } }, RULES).expense, 100000);
});

test('40(4) หักค่าใช้จ่ายไม่ได้เลย', () => {
  assert.equal(call('taxExpenseFor', 's40_4', { s40_4: { amount: 500000 } }, RULES).expense, 0);
});

test('40(6) ประกอบโรคศิลปะหัก 60% วิชาชีพอื่นหัก 30%', () => {
  const med = call('taxExpenseFor', 's40_6', { s40_6: { amount: 1000000, option: 'medical' } }, RULES);
  const oth = call('taxExpenseFor', 's40_6', { s40_6: { amount: 1000000, option: 'other_pro' } }, RULES);
  assert.equal(med.expense, 600000);
  assert.equal(oth.expense, 300000);
});

test('40(5) อัตราเหมาต่างกันตามชนิดทรัพย์สิน ไม่ใช่ค่าเดียว', () => {
  const at = opt => call('taxExpenseFor', 's40_5', { s40_5: { amount: 1000000, option: opt } }, RULES).expense;
  assert.equal(at('building'), 300000);
  assert.equal(at('farmland'), 200000);
  assert.equal(at('land'), 150000);
  assert.equal(at('vehicle'), 300000);
  assert.equal(at('other'), 100000);
});

test('เลือกหักตามจริงได้ แต่ห้ามเกินยอดเงินได้', () => {
  const r = call('taxExpenseFor', 's40_8',
    { s40_8: { amount: 500000, useActual: true, actual: 900000 } }, RULES);
  assert.equal(r.expense, 500000, 'หักตามจริงต้องไม่เกินเงินได้');
});

/* ---------- ค่าลดหย่อน ---------- */
const base = { assessableIncome: 2000000, salaryIncome: 2000000 };
const ded = extra => call('taxDeductions', Object.assign({}, base, extra), RULES);
const groupUsed = (res, id) => res.groups.find(g => g.id === id).used;

test('ประกันชีวิตกับสุขภาพตนเองรวมกันต้องไม่เกิน 100,000', () => {
  const r = ded({ life: 100000, healthSelf: 25000 });
  assert.equal(groupUsed(r, 'insurance'), 100000, 'ชนเพดานรวมต้องได้แค่ 100,000');
  // สุขภาพตนเองมีเพดานย่อย 25,000
  const r2 = ded({ life: 0, healthSelf: 40000 });
  assert.equal(groupUsed(r2, 'insurance'), 25000);
});

test('ประกันสุขภาพบิดามารดาเป็นก้อนแยก ไม่กินเพดาน 100,000', () => {
  const r = ded({ life: 100000, parentHealth: 15000 });
  assert.equal(groupUsed(r, 'insurance'), 100000);
  const pm = r.lines.find(l => l.label.includes('บิดามารดา'));
  assert.equal(pm.amount, 15000, 'ต้องได้เต็ม 15,000 แม้เพดานประกันเต็มแล้ว');
});

test('กลุ่มเกษียณรวมกันต้องไม่เกิน 500,000 แม้แต่ละตัวยังไม่ชนเพดานตัวเอง', () => {
  const r = ded({ rmf: 500000, pensionInsurance: 200000, gpf: 300000, pvd: 200000, nsf: 30000 });
  assert.equal(groupUsed(r, 'retirement'), 500000);
});

test('เพดานย่อยของแต่ละตัวในกลุ่มเกษียณต้องทำงานก่อนเพดานกลุ่ม', () => {
  // RMF ไม่เกิน 30% ของเงินได้
  assert.equal(groupUsed(ded({ rmf: 999999, assessableIncome: 1000000 }), 'retirement'), 300000);
  // ประกันบำนาญ ไม่เกิน 15% ของเงินได้ และไม่เกิน 200,000
  assert.equal(groupUsed(ded({ pensionInsurance: 999999, assessableIncome: 1000000 }), 'retirement'), 150000);
  assert.equal(groupUsed(ded({ pensionInsurance: 999999, assessableIncome: 9000000 }), 'retirement'), 200000);
  // กอช. เพดาน 30,000
  assert.equal(groupUsed(ded({ nsf: 99999 }), 'retirement'), 30000);
  // PVD ไม่เกิน 15% ของค่าจ้าง
  assert.equal(groupUsed(ded({ pvd: 999999, salaryIncome: 1000000 }), 'retirement'), 150000);
});

test('กบข. PVD ประกันสังคม ต้องมีอยู่จริงและมีเพดานถูกต้อง', () => {
  // กบข. เพดานตัวเอง 500,000 เมื่อไม่มีตัวอื่นในกลุ่มมาแย่งโควตา
  assert.equal(ded({ gpf: 600000 }).lines.find(l => l.label.includes('กบข')).amount, 500000);
  // ประกันสังคมอยู่นอกกลุ่มเกษียณ จึงไม่โดนโควตากลุ่มแย่ง
  assert.equal(ded({ socialSecurity: 20000 }).lines.find(l => l.label.includes('ประกันสังคม')).amount, 9000);
  // PVD ไม่เกิน 15% ของค่าจ้าง
  assert.equal(ded({ pvd: 100000, salaryIncome: 400000 }).lines
    .find(l => l.label.includes('สำรองเลี้ยงชีพ')).amount, 60000);
});

test('เมื่อหลายตัวในกลุ่มเกษียณมาพร้อมกัน ต้องตัดตัวท้ายแถว ไม่ใช่ตัดมั่ว', () => {
  // เงินสะสมภาคบังคับ (PVD กบข.) ถูกจัดก่อน แล้ว RMF กับบำนาญที่เลือกซื้อเองค่อยรับส่วนที่เหลือ
  const r = ded({ pvd: 100000, gpf: 600000, rmf: 300000, pensionInsurance: 200000 });
  assert.equal(groupUsed(r, 'retirement'), 500000, 'รวมทั้งกลุ่มต้องไม่เกินเพดาน');
  assert.equal(r.lines.find(l => l.label.includes('สำรองเลี้ยงชีพ')).amount, 100000);
  assert.equal(r.lines.find(l => l.label.includes('กบข')).amount, 400000, 'ตัวที่ชนเพดานกลุ่มต้องถูกตัด');
  assert.ok(!r.lines.find(l => l.label.includes('RMF')), 'โควตาหมดแล้ว RMF ต้องไม่ขึ้นบรรทัด');
  // บรรทัดที่ถูกตัดต้องบอกเหตุผลให้ผู้ใช้รู้ ไม่ใช่หายเงียบ
  assert.match(r.lines.find(l => l.label.includes('กบข')).note, /ชนเพดานกลุ่ม/);
});

test('Thai ESG เพดานแยกจากกลุ่มเกษียณ', () => {
  const r = ded({ rmf: 500000, thaiEsg: 300000, assessableIncome: 5000000 });
  assert.equal(groupUsed(r, 'retirement'), 500000);
  assert.equal(groupUsed(r, 'thaiEsg'), 300000, 'Thai ESG ต้องไม่ถูกกลุ่มเกษียณกิน');
  // แต่ยังติดเพดาน 30% ของเงินได้
  assert.equal(groupUsed(ded({ thaiEsg: 300000, assessableIncome: 500000 }), 'thaiEsg'), 150000);
});

test('บุตรคนที่ 2 ที่เกิดตั้งแต่ปี 2561 ได้ 60,000 ไม่ใช่ 30,000', () => {
  const r = ded({ childFirst: 1, childSecondFrom2561: 1 });
  assert.equal(r.lines.find(l => l.label.includes('บุตรคนแรก')).amount, 30000);
  assert.equal(r.lines.find(l => l.label.includes('คนที่ 2')).amount, 60000);
});

test('อุปการะบิดามารดา นับได้สูงสุด 4 คน', () => {
  assert.equal(ded({ parentCount: 9 }).lines.find(l => l.label.includes('อุปการะบิดามารดา')).amount,
    4 * 30000);
});

/* ---------- เงินบริจาค ---------- */
test('เพดานบริจาค 10% ต้องคิดจากยอดหลังหักค่าใช้จ่ายและลดหย่อนอื่นแล้ว', () => {
  const r = call('taxDonation', { generalDonation: 999999 }, 1000000, RULES);
  assert.equal(r.cap, 100000);
  assert.equal(r.total, 100000);
});

test('e-Donation หักได้ 2 เท่า แต่ยังติดเพดาน 10% เดิม', () => {
  const r = call('taxDonation', { eDonation: 30000 }, 1000000, RULES);
  assert.equal(r.eDonation, 60000, 'จ่าย 30,000 ต้องหักได้ 60,000');
  const r2 = call('taxDonation', { eDonation: 80000 }, 1000000, RULES);
  assert.equal(r2.total, 100000, 'คูณสองแล้วยังห้ามเกิน 10%');
});

test('บริจาคทั่วไปต้องใช้สิทธิที่เหลือหลัง e-Donation', () => {
  const r = call('taxDonation', { eDonation: 30000, generalDonation: 999999 }, 1000000, RULES);
  assert.equal(r.eDonation, 60000);
  assert.equal(r.general, 40000);
  assert.equal(r.total, 100000);
});

/* ---------- คำนวณทั้งกระบวน ---------- */
test('เคสหมอเปิดคลินิก ตรวจทีละขั้นจนถึงภาษีที่ต้องจ่าย', () => {
  const res = call('taxCompute', {
    income: { s40_1: { amount: 1200000 }, s40_6: { amount: 2000000, option: 'medical' } },
    deductions: { life: 100000, pensionInsurance: 200000, rmf: 300000, socialSecurity: 9000 },
  }, RULES);
  assert.equal(res.income.gross, 3200000);
  assert.equal(res.income.expense, 100000 + 1200000, '40(1) เพดานแสน + 40(6) หกสิบเปอร์เซ็นต์');
  assert.equal(res.income.afterExpense, 1900000);
  // ลดหย่อน: ส่วนตัว 60,000 + ประกันชีวิต 100,000 + บำนาญ 200,000 + RMF 300,000 + ประกันสังคม 9,000
  assert.equal(res.deductions.total, 669000);
  assert.equal(res.netIncome, 1231000);
  assert.equal(res.tax, call('taxOf', 1231000, RULES).tax);
  assert.equal(res.topRate, 0.25);
});

test('ลดหย่อนมากกว่าเงินได้ ต้องไม่ทำให้เงินได้สุทธิติดลบ', () => {
  const res = call('taxCompute', {
    income: { s40_1: { amount: 300000 } },
    deductions: { rmf: 90000, life: 100000, thaiEsg: 90000 },
  }, RULES);
  assert.ok(res.netIncome >= 0);
  assert.equal(res.tax, 0);
});

/* ---------- ตัวช่วยวางแผน ---------- */
test('บอกได้ว่าต้องลดหย่อนเพิ่มอีกเท่าไรจึงจะลงมาแต่ละขั้น', () => {
  const opts = call('taxPlanOptions', 1200000, RULES);
  const to20 = opts.find(o => o.targetRate === 0.20);
  assert.equal(to20.extraDeduction, 200000, 'จาก 1,200,000 ลงมา 1,000,000 ต้องลดหย่อนเพิ่ม 200,000');
  assert.equal(to20.taxAfter, 115000);
  assert.equal(to20.saved, call('taxOf', 1200000, RULES).tax - 115000);
  // เรียงจากที่ต้องใช้เงินน้อยไปมาก จะได้เสนอทางที่ทำได้ง่ายที่สุดก่อน
  for (let i = 1; i < opts.length; i++) {
    assert.ok(opts[i].extraDeduction >= opts[i - 1].extraDeduction);
  }
});

test('ทางเลือกต้องเป็นขั้นที่ต่ำกว่าปัจจุบันเท่านั้น ไม่เสนอขั้นที่อยู่แล้ว', () => {
  const opts = call('taxPlanOptions', 400000, RULES);
  assert.ok(opts.every(o => o.targetRate < 0.10));
  assert.ok(opts.every(o => o.extraDeduction > 0));
  // อยู่ขั้นยกเว้นแล้วต้องไม่มีอะไรให้เสนอ
  assert.equal(call('taxPlanOptions', 120000, RULES).length, 0);
});

test('ทุกทางเลือกต้องบอกความคุ้มค่าต่อเงินหนึ่งบาทที่ใช้ลดหย่อน', () => {
  for (const o of call('taxPlanOptions', 3000000, RULES)) {
    assert.ok(o.savedPerBaht > 0 && o.savedPerBaht < 1,
      'ประหยัดภาษีต่อบาทต้องมากกว่า 0 และไม่มีทางเกิน 1 บาท');
  }
});

/* ---------- กฎที่ต้องไม่หลุด ---------- */
test('รายการที่เลิกใช้แล้ว ต้องไม่มีช่องให้กรอก', () => {
  assert.ok(!RULES.deductions.retirementGroup.items.ssf, 'SSF จบไปแล้ว ห้ามมีช่อง');
  const ids = RULES.removedThisYear.map(r => r.id);
  for (const id of ['ssf', 'easy_e_receipt', 'thai_esgx_special']) {
    assert.ok(ids.includes(id), `ต้องบันทึกเหตุผลที่ตัด ${id} ออก`);
  }
});

test('กฎทุกชุดต้องมีปีภาษี วันที่ตรวจ และแหล่งอ้างอิงกำกับ', () => {
  assert.equal(RULES.taxYear, 2569);
  assert.match(RULES.verifiedAt, /^\d{4}-\d{2}-\d{2}$/);
  for (const k of ['brackets', 'expenses', 'deductions']) {
    assert.match(RULES.sources[k], /^https:\/\/www\.rd\.go\.th\//, `${k} ต้องอ้างอิงกรมสรรพากร`);
  }
});

test('ห้ามฝังตัวเลขเพดานลงในโค้ดคำนวณ ต้องอ่านจากไฟล์กฎเท่านั้น', () => {
  const engine = [grab('function taxDeductions('), grab('function taxOf('),
                  grab('function taxDonation(')].join('\n');
  for (const magic of ['100000', '500000', '300000', '60000', '9000', '0.35', '0.30']) {
    assert.ok(!engine.includes(magic),
      `พบเลข ${magic} ฝังในโค้ด ต้องย้ายไป data/tax-rules.json ไม่งั้นปีหน้าแก้ไม่ครบ`);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* กวาดเครื่องคำนวณภาษีแบบ property-based ไม่ได้เช็คค่าเป้าทีละค่า
   แต่เช็คว่า "กฎที่ต้องจริงเสมอ" ไม่เคยหลุด ในทุกอาชีพ ทุกฐานรายได้ ทุกชุดลดหย่อน
   บัคทุกตัวที่เจอในโปรเจกต์นี้เป็นแบบโชว์เลขผิดเงียบ ๆ ซึ่งเทสต์ค่าเป้าจับไม่ได้ */

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const RULES = JSON.parse(readFileSync(new URL('../data/tax-rules.json', import.meta.url), 'utf8'));
function grab(sig){ const i=html.indexOf(sig); let d=0,st=false;
  for(let j=i;j<html.length;j++){ if(html[j]==='{'){d++;st=true;} else if(html[j]==='}'){d--; if(st&&d===0) return html.slice(i,j+1);} } }
const sb = vm.createContext({});
vm.runInContext(['taxExpenseFor','taxIncomeSummary','taxDeductions','taxDonation','taxOf','taxCompute','taxPlanOptions','taxHeadroom','taxEfficientCeiling','taxAllocate','taxPackages']
  .map(n=>grab('function '+n+'(')).join('\n'), sb);
const C = (n,...a)=>vm.runInContext(n,sb)(...a);

const bugs = [];
const bug = (m,ctx) => { if(bugs.length<40) bugs.push(m+'  ['+JSON.stringify(ctx)+']'); };
const num = v => typeof v==='number' && Number.isFinite(v);

// เคสอาชีพจริงหลายแบบ
const JOBS = {
  'มนุษย์เงินเดือน':        s => ({ s40_1:{amount:s} }),
  'หมอมีเงินเดือน+คลินิก':  s => ({ s40_1:{amount:s*0.4}, s40_6:{amount:s*0.6, option:'medical'} }),
  'หมอคลินิกล้วน':          s => ({ s40_6:{amount:s, option:'medical'} }),
  'วิศวกรฟรีแลนซ์':         s => ({ s40_6:{amount:s, option:'other_pro'} }),
  'นายหน้า/ตัวแทน':         s => ({ s40_2:{amount:s} }),
  'เงินเดือน+คอมมิชชัน':    s => ({ s40_1:{amount:s*0.6}, s40_2:{amount:s*0.4} }),
  'ค้าขาย':                s => ({ s40_8:{amount:s, option:'rate60'} }),
  'ปล่อยเช่าคอนโด':        s => ({ s40_5:{amount:s, option:'building'} }),
  'รับเหมาก่อสร้าง':        s => ({ s40_7:{amount:s} }),
  'ปันผลล้วน':             s => ({ s40_4:{amount:s} }),
  'มีทุกทาง':              s => ({ s40_1:{amount:s*.2}, s40_2:{amount:s*.1}, s40_3:{amount:s*.1},
                                   s40_4:{amount:s*.1}, s40_5:{amount:s*.1, option:'land'},
                                   s40_6:{amount:s*.2, option:'medical'}, s40_7:{amount:s*.1},
                                   s40_8:{amount:s*.1, option:'rate40'} }),
};
const SALARIES = [0,50000,150000,200000,300000,400000,500000,600000,750000,900000,1000000,
                  1200000,1500000,2000000,3000000,5000000,8000000,20000000];
const DEDS = [
  {},
  { life:100000, healthSelf:25000, socialSecurity:9000 },
  { life:200000, healthSelf:60000, parentHealth:30000 },
  { pvd:500000, gpf:500000, rmf:500000, pensionInsurance:500000, nsf:100000 },
  { rmf:9999999, pensionInsurance:9999999, thaiEsg:9999999 },
  { hasSpouseNoIncome:true, childFirst:3, childSecondFrom2561:2, parentCount:9, disabledCount:2, maternity:200000 },
  { eDonation:500000, generalDonation:500000 },
  { life:100000, rmf:300000, pensionInsurance:200000, thaiEsg:300000, mortgageInterest:200000,
    socialSecurity:9000, socialEnterprise:200000, politicalParty:50000, eDonation:100000 },
];

let n=0;
let CTX=null;
function chk(cond,msg){ if(!cond) bug(msg,CTX); }

for(const [job,mk] of Object.entries(JOBS))
for(const sal of SALARIES)
for(const d of DEDS){
  n++;
  const ctx = {job, sal, d:Object.keys(d).join(',')||'ไม่มี'}; CTX = ctx;
  // อายุสลับไปมาด้วย เพราะเป็นตัวจัดลำดับ RMF กับ Thai ESG
  const input = {income: mk(sal), deductions: {...d}, age: [0,25,49,50,70][n % 5]};
  let r; try { r = C('taxCompute', input, RULES); }
  catch(e){ bug('ระเบิด: '+e.message, ctx); continue; }

  for(const [k,v] of [['gross',r.income.gross],['expense',r.income.expense],['ded',r.deductions.total],
                      ['don',r.donation.total],['net',r.netIncome],['tax',r.tax],['eff',r.effectiveRate]])
    if(!num(v)) bug('ค่าไม่ใช่ตัวเลข: '+k+'='+v, ctx);

  if(r.netIncome < 0) bug('เงินได้สุทธิติดลบ '+r.netIncome, ctx);
  if(r.tax < 0) bug('ภาษีติดลบ '+r.tax, ctx);
  if(r.tax > r.netIncome + 0.01) bug('ภาษีมากกว่าเงินได้สุทธิ', ctx);
  if(r.income.expense > r.income.gross + 0.01) bug('ค่าใช้จ่ายมากกว่าเงินได้', ctx);
  if(r.effectiveRate > 0.351) bug('ภาระภาษีจริงเกิน 35% = '+r.effectiveRate, ctx);
  if(r.effectiveRate > r.topRate + 1e-9) bug('ภาระจริงมากกว่าฐานสูงสุด', ctx);

  // เพดานกลุ่มห้ามเกิน
  for(const g of r.deductions.groups)
    if(g.used > g.cap + 0.01) bug('กลุ่ม '+g.label+' เกินเพดาน '+g.used+'>'+g.cap, ctx);
  // ผลรวมบรรทัดต้องเท่ากับ total
  const sum = r.deductions.lines.reduce((s,l)=>s+l.amount,0);
  if(Math.abs(sum - r.deductions.total) > 0.01) bug('ผลรวมบรรทัดลดหย่อนไม่ตรง total', ctx);
  // บริจาคห้ามเกินเพดาน 10%
  if(r.donation.total > r.donation.cap + 0.01) bug('บริจาคเกินเพดาน', ctx);

  // ทางเลือกวางแผนต้องคำนวณย้อนกลับได้จริง
  const h = C('taxHeadroom', input, r, RULES);
  for(const [k,v] of Object.entries({buyable:h.buyable, withConditions:h.withConditions}))
    chk(Number.isFinite(v) && v >= 0, `headroom.${k} เพี้ยน: ${v}`);
  chk(h.buyable <= h.withConditions, 'ยอดซื้อเพิ่มได้ทันที ต้องไม่เกินยอดรวมของมีเงื่อนไข');
  for(const x of h.buy.concat(h.cond)) chk(Number.isFinite(x.room) && x.room >= 0, `สิทธิเหลือ ${x.label} เพี้ยน`);
  chk(Math.abs(h.buy.reduce((s,x)=>s+x.room,0) - h.buyable) < 0.5, 'ผลรวมสิทธิเหลือไม่ตรงกับยอดรวม');
  // สองบรรทัดของกลุ่มเกษียณรวมกันห้ามทะลุเพดานกลุ่ม
  const grp = h.buy.filter(x => x.id === 'pensionInsurance' || x.id === 'rmf')
                   .reduce((s,x)=>s+x.room, 0);
  chk(grp <= RULES.deductions.retirementGroup.cap + 0.5, 'กลุ่มเกษียณสองบรรทัดรวมกันทะลุเพดาน');
  const ids = h.buy.map(x => x.id);
  chk(ids.indexOf('pensionInsurance') < ids.indexOf('rmf'), 'ประกันบำนาญต้องมาก่อน RMF เสมอ');
  chk(ids[0] === 'insurance', 'ประกันต้องเป็นช่องแรกเสมอ');
  for(const o of C('taxPlanOptions', r.netIncome, RULES, h)){
    chk(o.reachable === (o.extraDeduction <= h.buyable + 0.5), 'ธง reachable ไม่ตรงกับสิทธิที่เหลือ');
    chk(o.shortfall >= 0 && (o.reachable ? o.shortfall === 0 : o.shortfall > 0), 'ยอดที่ยังขาดเพี้ยน');
    // ขั้นที่บอกว่าทำได้ ต้องใส่สิทธิที่เหลือแล้วลงถึงจริง
    if(o.reachable) chk(C('taxOf', Math.max(0, r.netIncome - h.buyable), RULES).topRate <= o.targetRate,
      'บอกว่าทำได้ แต่ใส่สิทธิที่เหลือทั้งหมดแล้วยังลงไม่ถึงฐานนั้น');
  }
  // แพ็กเกจตามงบ ต้องไม่หลุดกรอบทั้งสามอย่าง และตัวเลขต้องสอดคล้องกันเอง
  for(const budget of [null, 50000, 300000, 99999999]){
    const packs = C('taxPackages', r, h, RULES, budget);
    const ceil = C('taxEfficientCeiling', r.netIncome, RULES);
    const limit = Math.min(h.buyable, ceil, budget || r.income.gross * RULES.planner.defaultBudgetPctOfIncome);
    let prev = 0;
    for(const p of packs){
      chk(Number.isFinite(p.amount) && p.amount > 0, 'ยอดแพ็กเกจเพี้ยน');
      chk(p.amount <= limit + 0.5, `แพ็กเกจ ${p.label} เกินกรอบ ${p.amount} > ${limit}`);
      chk(p.amount > prev, 'แพ็กเกจต้องเรียงจากน้อยไปมาก'); prev = p.amount;
      const after = C('taxOf', Math.max(0, r.netIncome - p.amount), RULES).tax;
      chk(Math.abs(after + p.saved - r.tax) < 0.01, 'ภาษีที่ประหยัดคำนวณย้อนกลับไม่ตรง');
      chk(p.saved >= 0, 'ประหยัดติดลบ');
      chk(Math.abs(p.netCash - (p.amount - p.saved)) < 0.01, 'เงินที่หายจากกระเป๋าคำนวณผิด');
      chk(p.netCash >= 0, 'เงินที่หายจากกระเป๋าติดลบ');
      // ตัดที่เส้นความคุ้มแล้ว ทุกบาทจึงต้องได้คืนไม่ต่ำกว่าเกณฑ์
      chk(p.perBaht >= RULES.planner.efficiencyFloorRate - 1e-9,
        `ได้คืนต่อบาท ${p.perBaht} ต่ำกว่าเกณฑ์ ${RULES.planner.efficiencyFloorRate}`);
      chk(p.perBaht <= 0.351, 'ได้คืนต่อบาทเกินอัตราสูงสุด');
      const alloc = p.allocation.reduce((s,a)=>s+a.amount, 0);
      chk(Math.abs(alloc - p.amount) < 0.5, 'ผลรวมการแบ่งเงินไม่เท่ากับยอดแพ็กเกจ');
      for(const a of p.allocation){
        chk(a.amount > 0, 'ช่องที่แบ่งเงินได้ 0 ไม่ควรแสดง');
        chk(!!a.lock && !!a.invest, 'ทุกช่องต้องบอกเงื่อนไขปลดล็อกและขอบเขตการลงทุน');
      }
    }
    chk(packs.filter(x => x.id === 'balanced').length <= 1, 'ป้ายสมดุลต้องมีได้อันเดียว');
  }

  for(const o of C('taxPlanOptions', r.netIncome, RULES)){
    const actual = C('taxOf', r.netIncome - o.extraDeduction, RULES).tax;
    if(Math.abs(actual - o.taxAfter) > 0.01) bug('ทางเลือกคำนวณผิด ควร '+actual+' บอก '+o.taxAfter, ctx);
    if(o.saved <= 0) bug('ทางเลือกบอกว่าประหยัด <= 0', ctx);
    if(o.savedPerBaht > 0.36) bug('ประหยัดต่อบาทเกินอัตราสูงสุด '+o.savedPerBaht, ctx);
  }
}

// เพิ่มลดหย่อนแล้วภาษีต้องไม่เพิ่ม และเพิ่มรายได้แล้วภาษีต้องไม่ลด
for(const [job,mk] of Object.entries(JOBS)){
  let prevTax = -1;
  for(const sal of SALARIES){
    const t = C('taxCompute', {income: mk(sal), deductions:{}}, RULES).tax;
    if(t < prevTax - 0.01) bug('รายได้เพิ่มแต่ภาษีลด', {job, sal});
    prevTax = t;
  }
  let prevT = Infinity;
  for(const life of [0,25000,50000,75000,100000]){
    const t = C('taxCompute', {income: mk(3000000), deductions:{life}}, RULES).tax;
    if(t > prevT + 0.01) bug('ลดหย่อนเพิ่มแต่ภาษีเพิ่ม', {job, life});
    prevT = t;
  }
}

test('กวาดเครื่องคำนวณภาษีทุกอาชีพ ทุกฐานรายได้ ทุกชุดลดหย่อน', () => {
  assert.ok(n >= 1500, `กวาดได้แค่ ${n} เคส น้อยกว่าที่ตั้งใจ อาจตัดโค้ดออกมาไม่ครบ`);
  assert.equal(bugs.length, 0, '\n' + bugs.join('\n'));
});

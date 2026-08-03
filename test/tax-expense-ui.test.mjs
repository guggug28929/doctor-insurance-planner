import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* เจ้าของเว็บทักว่า "ไม่แน่ใจว่าหักค่าใช้จ่าย 1 แสนให้ 40(1) 40(2) หรือยัง"
   ตรวจแล้วตัวคำนวณถูก แต่หน้าเว็บไม่ได้แสดงให้เห็น จึงตรวจสอบด้วยตาไม่ได้
   และยังไม่มีทางเลือก "หักตามจริง" ทั้งที่กฎหมายให้ทำได้หลายประเภท */

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
vm.runInContext(['taxExpenseFor','taxIncomeSummary'].map(n => grab('function ' + n + '(')).join('\n'), sb);
const C = (n, ...a) => vm.runInContext(n, sb)(...a);
const sum = rows => C('taxIncomeSummary', rows, RULES);

test('40(1) กับ 40(2) ต้องแชร์เพดาน 100,000 ไม่ใช่ได้คนละแสน', () => {
  assert.equal(sum({ s40_1:{amount:1000000} }).expense, 100000);
  assert.equal(sum({ s40_2:{amount:1000000} }).expense, 100000);
  // จุดที่พลาดกันบ่อย กรอกสองช่องแล้วได้ 200,000
  const both = sum({ s40_1:{amount:600000}, s40_2:{amount:400000} });
  assert.equal(both.expense, 100000, 'สองประเภทรวมกันต้องไม่เกิน 100,000');
  // ปันตามสัดส่วน ไม่ใช่ยัดให้ประเภทเดียว
  assert.equal(Math.round(both.lines.find(l => l.id === 's40_1').expense), 60000);
  assert.equal(Math.round(both.lines.find(l => l.id === 's40_2').expense), 40000);
  // ยังไม่ชนเพดาน ต้องได้ 50% เต็ม
  assert.equal(sum({ s40_1:{amount:100000}, s40_2:{amount:100000} }).expense, 100000);
  assert.equal(sum({ s40_1:{amount:50000} }).expense, 25000);
});

test('ทุกประเภทเงินได้ต้องมีกติกาหักค่าใช้จ่ายครบ ไม่ตกหล่น', () => {
  assert.equal(RULES.incomeTypes.length, 8);
  for(const t of RULES.incomeTypes){
    assert.ok(t.expense, `${t.id} ไม่มีกติกาหักค่าใช้จ่าย`);
    assert.ok(['none','percent','percentCap','choice'].includes(t.expense.kind),
      `${t.id} kind ไม่รู้จัก: ${t.expense.kind}`);
    if(t.expense.kind === 'choice')
      assert.ok(t.expense.options.length >= 2, `${t.id} เป็น choice แต่มีตัวเลือกเดียว`);
  }
  // อัตราสำคัญที่ลูกค้าถามบ่อย ตรึงไว้กันแก้ผิด
  const opt = (id, oid) => RULES.incomeTypes.find(t => t.id === id).expense.options.find(o => o.id === oid).percent;
  assert.equal(opt('s40_6','medical'), 0.6, 'ประกอบโรคศิลปะหักได้ 60%');
  assert.equal(opt('s40_6','other_pro'), 0.3, 'วิชาชีพอิสระอื่นหักได้ 30%');
  assert.equal(opt('s40_8','rate60'), 0.6);
  assert.equal(opt('s40_8','rate40'), 0.4);
  assert.equal(RULES.incomeTypes.find(t => t.id === 's40_7').expense.percent, 0.6);
  assert.equal(RULES.incomeTypes.find(t => t.id === 's40_4').expense.kind, 'none');
});

test('เลือกอัตราหักได้จริง และมีผลกับตัวเลข', () => {
  const inc = a => ({ s40_6:{amount:2000000, option:a} });
  assert.equal(sum(inc('medical')).expense, 1200000);
  assert.equal(sum(inc('other_pro')).expense, 600000);
  // 40(8) และ 40(5) ก็ต้องเลือกได้
  assert.equal(sum({ s40_8:{amount:1000000, option:'rate60'} }).expense, 600000);
  assert.equal(sum({ s40_8:{amount:1000000, option:'rate40'} }).expense, 400000);
  assert.equal(sum({ s40_5:{amount:1000000, option:'building'} }).expense, 300000);
  assert.equal(sum({ s40_5:{amount:1000000, option:'land'} }).expense, 150000);
});

test('หักตามจริงต้องใช้ได้ และห้ามหักเกินเงินได้ของประเภทนั้น', () => {
  const r = sum({ s40_6:{amount:2000000, option:'medical', useActual:true, actual:500000} });
  assert.equal(r.expense, 500000);
  assert.equal(r.lines[0].note, 'หักตามจริง');
  // กรอกเกินเงินได้ ต้องถูกตัดที่เงินได้ ไม่ใช่ทำให้ติดลบ
  assert.equal(sum({ s40_6:{amount:100000, useActual:true, actual:9999999} }).expense, 100000);
  assert.equal(sum({ s40_6:{amount:100000, useActual:true, actual:-5} }).expense, 0);
  // ประเภทที่กฎหมายไม่ให้หักตามจริง ต้องไม่หลุด
  for(const id of ['s40_1','s40_2','s40_4'])
    assert.ok(!RULES.incomeTypes.find(t => t.id === id).expense.actualAllowed,
      `${id} ไม่ควรเปิดให้หักตามจริง`);
});

test('โหมดกรอกเร็วต้องมี 40(2) ด้วย เพราะแชร์เพดานกับ 40(1)', () => {
  const m = html.match(/const TAX_QUICK_INCOME = \[([^\]]+)\]/);
  assert.ok(m, 'ไม่พบรายการเงินได้ของโหมดกรอกเร็ว');
  for(const id of ['s40_1','s40_2','s40_6','s40_8'])
    assert.ok(m[1].includes(`'${id}'`), `โหมดกรอกเร็วขาด ${id}`);
});

test('หน้าเว็บต้องให้เลือกวิธีหัก และบอกทันทีว่าหักได้เท่าไร', () => {
  assert.match(html, /function taxExpenseControl\(t, row\)/);
  assert.match(html, /function taxExpensePreview\(t\)/);
  assert.match(html, /function setTaxExpenseMode\(id, val\)/);
  // ตัวเลือกหักตามจริงต้องโผล่เฉพาะประเภทที่กฎหมายให้
  assert.match(html, /if\(e\.actualAllowed\) opts\.push\(\['__actual'/);
  // เลือกหักตามจริงแล้วต้องมีช่องกรอกยอด
  assert.match(html, /row\.useActual[\s\S]{0,120}ค่าใช้จ่ายจริงทั้งปี/);
  // ประเภทที่หักไม่ได้เลย ต้องบอก ไม่ใช่ปล่อยว่าง
  assert.match(html, /if\(e\.kind === 'none'\)/);
  // บรรทัดยืนยันยอดที่หักได้ ต้องอยู่ติดช่องกรอก
  assert.match(html, /หักค่าใช้จ่ายได้ <b>\$\{fmt\(Math\.round\(r\.expense\)\)\}<\/b> บาท/);
  // และต้องมีตารางแจงรายประเภทในหน้าผลลัพธ์
  assert.match(html, /<summary>ดูว่าหักค่าใช้จ่ายแต่ละประเภทไปเท่าไร<\/summary>/);
});

test('พิมพ์ตัวเลขแล้วต้องไม่วาดฟอร์มใหม่ทั้งก้อน ไม่งั้นเคอร์เซอร์หลุด', () => {
  assert.match(html, /function taxRefreshExpenseLines\(\)/);
  assert.match(html, /taxDebounce\(\); taxRefreshExpenseLines\(\);/);
  // เปลี่ยนวิธีหักถึงจะวาดใหม่ เพราะต้องมีช่องกรอกยอดจริงโผล่มา
  assert.match(html, /function setTaxExpenseMode\(id, val\)\{[\s\S]{0,260}renderTaxPage\(\);/);
  assert.match(html, /id="taxIncomeForm"/);
});

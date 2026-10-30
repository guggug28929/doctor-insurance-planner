import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* เดิมไฟล์นี้ล็อกกฎ "CI Perfect Care / Multiple CI ทำทุนได้ไม่เกิน 10 เท่าของทุนสัญญาหลัก"
   ตัวแทนแจ้งว่าบริษัทเลิกกฎนี้แล้ว: CI Perfect Care ทำทุนได้สูงสุด 10 ล้านบาท
   ส่วน Multiple CI สูงสุด 20 ล้านบาท โดยไม่ผูกกับทุนสัญญาหลัก
   ไฟล์นี้จึงล็อกกลับด้าน: ผู้ช่วยจัดแผนต้องไม่หั่นทุน CI ตามทุนสัญญาหลัก
   และไม่ดันทุนสัญญาหลักขึ้นเพียงเพราะทุน CI สูง */

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function grab(marker){
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, `ไม่พบ ${marker}`);
  let depth = 0;
  for(let i = html.indexOf('{', start); i < html.length; i++){
    if(html[i] === '{') depth++;
    else if(html[i] === '}'){ depth--; if(depth === 0) return html.slice(start, i + 1); }
  }
  throw new Error(`วงเล็บไม่ครบสำหรับ ${marker}`);
}
function grabConst(name){
  const start = html.indexOf(`const ${name} = [`);
  assert.notEqual(start, -1, `ไม่พบ const ${name}`);
  let depth = 0;
  for(let i = html.indexOf('[', start); i < html.length; i++){
    if(html[i] === '[') depth++;
    else if(html[i] === ']'){ depth--; if(depth === 0) return html.slice(start, i + 1) + ';'; }
  }
  throw new Error(`วงเล็บไม่ครบสำหรับ ${name}`);
}

const ctx = vm.createContext({Math, Number, Array, Object, String, JSON});
vm.runInContext([
  grabConst('ADV_MAIN_LEVELS'),
  'const ADV_CIPC_MAIN_RATIO = 10;',
  html.match(/const ADV_MAIN_RATIO_KINDS = \[[^\]]*\];/)[0],
  'function multipleCiNearestCapital(want){ const caps=[500000,1000000,2000000]; let best=null; for(const c of caps) if(c<=want && (best===null||c>best)) best=c; return best; }',
  "const fmt = n => String(n);",
  'let CAN_PRICE = () => true;',
  'function advCanPrice(it, input){ return CAN_PRICE(it, input); }',
  grab('function advRequiredMainCapital(ciItems)'),
  grab('function advMainLevelFor(input, ciItems)'),
  grab('function advClampCiToMain(state)'),
  'this.ADV_MAIN_LEVELS = ADV_MAIN_LEVELS;',
  'this.advRequiredMainCapital = advRequiredMainCapital;',
  'this.advMainLevelFor = advMainLevelFor;',
  'this.advClampCiToMain = advClampCiToMain;',
  'this.KINDS = ADV_MAIN_RATIO_KINDS;',
].join('\n'), ctx);

const LEVELS = ctx.ADV_MAIN_LEVELS;

test('ไม่มีสัญญาใดในผู้ช่วยจัดแผนที่ถูกผูกกับทุนสัญญาหลักแบบ 10 เท่าอีกแล้ว', () => {
  assert.deepEqual([...ctx.KINDS], []);
});

test('ทุน CI สูงแค่ไหนก็ไม่บังคับทุนสัญญาหลักขั้นต่ำ', () => {
  for(const kind of ['cipc', 'mci'])
    for(const cap of [500000, 1000000, 5000000, 10000000, 20000000])
      assert.equal(ctx.advRequiredMainCapital([{kind, capital:cap}]), 0, `${kind} ${cap}`);
  // ไม่มีข้อกำหนดทุนหลัก จึงเลือกขั้นต่ำสุดของบันไดเสมอ ไม่ดันทุนชีวิตให้ลูกค้าโดยไม่จำเป็น
  const lv = ctx.advMainLevelFor({}, [{kind:'cipc', capital:5000000}]);
  assert.equal(LEVELS[lv].capital, LEVELS[LEVELS.length - 1].capital);
});

test('ลดทุนสัญญาหลักแล้ว ทุน CI ต้องไม่ถูกหั่นตาม', () => {
  const state = {
    mainLevel: LEVELS.findIndex(l => l.capital === 50000),
    ci: [{kind:'cipc', capital:1000000}, {kind:'mci', capital:2000000}, {kind:'careplus', plan:'cackd'}],
  };
  assert.equal(ctx.advClampCiToMain(state), null, 'ต้องไม่มีข้อความลดทุน');
  assert.equal(state.ci[0].capital, 1000000);
  assert.equal(state.ci[1].capital, 2000000);
  assert.equal(state.ci.length, 3);
});

test('ตัวสร้างแพ็กเกจและหน้าคำนวณใช้เพดานใหม่ ไม่ใช่ 10 เท่าของทุนหลัก', () => {
  assert.doesNotMatch(html, /inp\.cipcCapital > inp\.mainCapital\*10/);
  assert.match(html, /inp\.cipcCapital > CIPC_MAX_CAPITAL/);
  assert.match(html, /const CIPC_MAX_CAPITAL = 10000000;/);
  assert.match(html, /const MCI_LIMITS = \{min: 500000, max: 20000000, step: 500000\};/);
});

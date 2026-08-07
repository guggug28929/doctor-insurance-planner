import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* CI Perfect Care ทำทุนได้ไม่เกิน 10 เท่าของทุนสัญญาหลัก
   หน้าคำนวณเบี้ยบังคับกฎนี้มานานแล้ว แต่ผู้ช่วยจัดแผนไม่รู้จักกฎนี้
   จึงเสนอ CI 1-5 ล้านคู่กับทุนหลัก 200,000 และเมื่อบันไดตัดลดทุนหลักเหลือ 50,000
   ทุน CI ยังค้างที่ 1 ล้าน กลายเป็น 20 เท่า ตัวแทนเอาไปยื่นแล้วโดนตีกลับ
   ไฟล์นี้ล็อกไว้ว่าทุกเส้นทางที่ระบบเสนอ ต้องผ่านกฎเดียวกับหน้าคำนวณ */

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
  "const fmt = n => String(n);",
  // อายุปกติตีราคาได้ทุกขั้น เทสต์นี้สนใจกฎ 10 เท่า ไม่ได้ทดสอบตารางเบี้ย
  'let CAN_PRICE = () => true;',
  'function advCanPrice(it, input){ return CAN_PRICE(it, input); }',
  grab('function advRequiredMainCapital(ciItems)'),
  grab('function advMainLevelFor(input, ciItems)'),
  grab('function advClampCiToMain(state)'),
  'this.ADV_MAIN_LEVELS = ADV_MAIN_LEVELS;',
  'this.advRequiredMainCapital = advRequiredMainCapital;',
  'this.advMainLevelFor = advMainLevelFor;',
  'this.advClampCiToMain = advClampCiToMain;',
  'this.setCanPrice = f => { CAN_PRICE = f; };',
].join('\n'), ctx);

const LEVELS = ctx.ADV_MAIN_LEVELS;
const RATIO = 10;

test('บันไดทุนสัญญาหลักต้องเรียงจากมากไปน้อย และมีขั้นที่รองรับ CI ทุนสูงได้', () => {
  for(let i = 1; i < LEVELS.length; i++)
    assert.ok(LEVELS[i].capital < LEVELS[i - 1].capital,
      `ขั้นที่ ${i} ทุนไม่ได้น้อยกว่าขั้นก่อนหน้า บันไดการตัดจะเดินผิดทาง`);
  // ทุน CI 5 ล้านคือเพดานที่ advCiItems เสนอได้ ต้องมีขั้นสัญญาหลักรองรับอย่างน้อย 500,000
  assert.ok(LEVELS[0].capital >= 5000000 / RATIO,
    `ขั้นสูงสุด ${LEVELS[0].capital} รองรับ CI 5 ล้านไม่ได้`);
});

test('คำนวณทุนสัญญาหลักขั้นต่ำที่ชุด CI ต้องการได้ถูกต้อง', () => {
  assert.equal(ctx.advRequiredMainCapital([]), 0);
  assert.equal(ctx.advRequiredMainCapital([{kind:'careplus'}]), 0, 'Care Plus ไม่ผูกกับทุนสัญญาหลัก');
  assert.equal(ctx.advRequiredMainCapital([{kind:'dcare', capital:2000000}]), 0, 'D Care ไม่ผูกกับทุนสัญญาหลัก');
  assert.equal(ctx.advRequiredMainCapital([{kind:'cipc', capital:1000000}]), 100000);
  assert.equal(ctx.advRequiredMainCapital([{kind:'cipc', capital:5000000}]), 500000);
  // เศษต้องปัดขึ้น ไม่ใช่ปัดลง ไม่งั้นจะได้ทุนหลักที่ยังไม่พอ
  assert.equal(ctx.advRequiredMainCapital([{kind:'cipc', capital:1050000}]), 105000);
});

test('เลือกขั้นสัญญาหลักที่ต่ำที่สุดซึ่งยังรองรับทุน CI ได้ ไม่ใช่ขั้นสูงสุดเสมอ', () => {
  ctx.setCanPrice(() => true);
  const lvFor = cap => LEVELS[ctx.advMainLevelFor({}, [{kind:'cipc', capital:cap}])].capital;
  assert.equal(lvFor(500000), 50000, 'CI 5 แสน ต้องการทุนหลักแค่ 50,000');
  assert.equal(lvFor(1000000), 100000);
  assert.equal(lvFor(2000000), 200000);
  assert.equal(lvFor(5000000), 500000);
  // ไม่มี CI เลย ต้องได้ขั้นต่ำสุด ไม่ดันทุนชีวิตให้ลูกค้าโดยไม่จำเป็น
  assert.equal(LEVELS[ctx.advMainLevelFor({}, [])].capital, LEVELS[LEVELS.length - 1].capital);
});

test('ขั้นที่บริษัทไม่รับอายุนี้ ต้องถูกข้าม ไม่ใช่เสนอไปแล้วตีราคาไม่ได้', () => {
  // จำลองว่าอายุนี้ทำได้เฉพาะ 99/99 เท่านั้น
  ctx.setCanPrice(it => it.plan === '99_99');
  const lv = ctx.advMainLevelFor({}, [{kind:'cipc', capital:1000000}]);
  assert.ok(lv >= 0);
  assert.equal(LEVELS[lv].plan, '99_99');
  assert.ok(LEVELS[lv].capital >= 100000);
  // ต้องการทุนหลัก 500,000 แต่มีแต่ 99/99 ซึ่งสูงสุด 100,000 จึงต้องคืน -1 ให้ผู้เรียกถอยไปลดทุน CI
  assert.equal(ctx.advMainLevelFor({}, [{kind:'cipc', capital:5000000}]), -1);
  ctx.setCanPrice(() => true);
});

test('ลดทุนสัญญาหลักแล้ว ทุน CI ต้องถูกหั่นตามทันที ห้ามค้างเกิน 10 เท่า', () => {
  const state = {
    mainLevel: LEVELS.findIndex(l => l.capital === 50000),
    ci: [{kind:'cipc', capital:1000000}, {kind:'careplus', plan:'cackd'}],
  };
  const msg = ctx.advClampCiToMain(state);
  assert.equal(state.ci[0].capital, 500000, 'ทุนหลัก 50,000 ทำ CI ได้สูงสุด 500,000');
  assert.equal(state.ci[1].plan, 'cackd', 'Care Plus ต้องไม่ถูกแตะ');
  assert.ok(msg && msg.includes('500000'), 'ต้องคืนข้อความอธิบายให้ตัวแทนเห็นว่าระบบลดอะไร');
});

test('ทุน CI ที่ยังอยู่ในเพดาน ต้องไม่ถูกลดโดยไม่จำเป็น', () => {
  const state = {
    mainLevel: LEVELS.findIndex(l => l.capital === 200000),
    ci: [{kind:'cipc', capital:1000000}],
  };
  assert.equal(ctx.advClampCiToMain(state), null, 'ไม่ควรมีข้อความเปลี่ยนแปลง');
  assert.equal(state.ci[0].capital, 1000000);
});

/* ---------- เดินทุกเส้นทางของบันไดการตัด ---------- */

test('ทุกขั้นของบันได ทุน CI ต้องไม่เกิน 10 เท่าของทุนหลักเสมอ', () => {
  for(const startCap of [500000, 1000000, 2000000, 5000000]){
    const state = {
      mainLevel: ctx.advMainLevelFor({}, [{kind:'cipc', capital:startCap}]),
      ci: [{kind:'cipc', capital:startCap}],
    };
    assert.ok(state.mainLevel >= 0, `ทุน CI ${startCap} หาขั้นสัญญาหลักไม่ได้`);
    ctx.advClampCiToMain(state);
    // ไล่ลดทุนหลักทีละขั้นจนสุดบันได เหมือนที่ advNextConcession ทำเมื่อเบี้ยเกินงบ
    for(let lv = state.mainLevel; lv < LEVELS.length; lv++){
      state.mainLevel = lv;
      ctx.advClampCiToMain(state);
      const cap = LEVELS[lv].capital * RATIO;
      assert.ok(state.ci[0].capital <= cap,
        `ทุนหลัก ${LEVELS[lv].capital} ทุน CI ${state.ci[0].capital} เกิน ${cap}`);
      assert.ok(state.ci[0].capital > 0, 'ทุน CI ต้องไม่ถูกหั่นจนเหลือศูนย์');
    }
  }
});

/* ---------- ต้องต่อเข้าของจริง ไม่ใช่มีฟังก์ชันลอย ---------- */

test('ตัวสร้างแพ็กเกจต้องเรียกใช้กฎนี้จริง ทั้งตอนตั้งต้นและตอนลดทุนหลัก', () => {
  assert.match(html, /const lv = advMainLevelFor\(input, ci\);/);
  assert.match(html, /advClampCiToMain\(state\);\s*\n\s*advFixMainRiderRule\(state\);/);
  // บันไดการตัดมีสองจุดที่ลดทุนสัญญาหลัก ต้องหั่นทุน CI ตามทั้งสองจุด
  const hits = html.match(/state\.mainLevel = i;\s*\n(?:\s*\/\/[^\n]*\n)?\s*const cut\d? = advClampCiToMain\(state\);/g) || [];
  assert.equal(hits.length, 2, `พบการหั่นทุน CI หลังลดทุนหลัก ${hits.length} จุด ควรมี 2 จุด`);
  // หน้าคำนวณเบี้ยต้องยังใช้กฎเดียวกัน ตัวเลขต้องไม่หลุดไปคนละค่ากับผู้ช่วยจัดแผน
  assert.match(html, /inp\.cipcCapital > inp\.mainCapital\*10/);
  assert.match(html, /const ADV_CIPC_MAIN_RATIO = 10;/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* มัลติเพิล ซีไอ เป็นแบบที่ลูกค้าเข้าใจผิดง่ายที่สุด เพราะโฆษณาว่า 400%
   ความจริงคือจ่ายกลุ่มละครั้ง และกลุ่มที่เหลือมีนาฬิกา 10 ปีเดินอยู่
   ไฟล์นี้ล็อกทั้งความถูกต้องของนิยาม ตัวเลขเงื่อนไข และตรรกะสามชั้นของผู้ช่วยจัดแผน */

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const RATES = JSON.parse(readFileSync(new URL('../data/premium-rates.json', import.meta.url), 'utf8'));
const MCI = JSON.parse(readFileSync(new URL('../data/mci-definitions.json', import.meta.url), 'utf8'));

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

/* ---------- ไฟล์นิยาม ---------- */

test('ต้องคัดครบ 35 โรค เลขข้อไม่ซ้ำไม่ขาด และแบ่งกลุ่มตรงกับกรมธรรม์', () => {
  assert.equal(MCI.diseases.length, 35);
  assert.equal(MCI._meta.total_diseases, 35);
  assert.deepEqual(MCI.diseases.map(d => d.n).sort((a, b) => a - b),
    Array.from({length: 35}, (_, i) => i + 1));
  const count = k => MCI.diseases.filter(d => d.group === k).length;
  assert.equal(count('cardio'), 8, 'กลุ่ม 1 หลอดเลือดและหัวใจ');
  assert.equal(count('cancer'), 2, 'กลุ่ม 2 มะเร็ง');
  assert.equal(count('organ'), 6, 'กลุ่ม 3 เปลี่ยนอวัยวะและระยะสุดท้าย');
  assert.equal(count('other'), 19, 'กลุ่ม 4 อื่น ๆ');
});

test('รายชื่อโรคต้องตรงกับทะเบียนกลุ่มที่หน้าเว็บใช้อยู่เดิม', () => {
  const i = html.indexOf('const MCI_GROUPS');
  let d = 0, end = i;
  for(let j = html.indexOf('[', i); j < html.length; j++){
    if(html[j] === '[') d++;
    else if(html[j] === ']'){ d--; if(!d){ end = j + 1; break; } }
  }
  const groups = vm.runInNewContext(html.slice(html.indexOf('[', i), end));
  const total = groups.reduce((n, g) => n + g.list.length, 0);
  assert.equal(total, MCI.diseases.length, 'จำนวนโรคสองที่ไม่ตรงกัน');
  const byN = [8, 2, 6, 19];
  groups.forEach((g, k) => assert.equal(g.list.length, byN[k], `กลุ่มที่ ${g.n} จำนวนไม่ตรง`));
});

test('ทุกโรคต้องมีเนื้อความจริง ไม่ปล่อยว่างหรือย่อจนไม่ได้สาระ', () => {
  for(const d of MCI.diseases){
    assert.ok(d.th && d.en, `โรคที่ ${d.n} ขาดชื่อ`);
    assert.ok(['cardio','cancer','organ','other'].includes(d.group), `${d.en} กลุ่มไม่ถูกต้อง`);
    const full = (d.body || '') + (d.criteria || []).join('') + (d.extra || '') + (d.exclusions || []).join('');
    assert.ok(full.length > 100, `${d.en} เนื้อความสั้นเกินไป น่าจะถูกย่อ`);
    if(d.criteria) assert.ok(d.criteriaTitle, `${d.en} มีเกณฑ์แต่ไม่มีหัวข้อ`);
    if(d.exclusions) assert.ok(d.exclusionsTitle, `${d.en} มีข้อยกเว้นแต่ไม่มีหัวข้อ`);
  }
});

test('ตัวเลขเกณฑ์สำคัญต้องตรงกับกรมธรรม์', () => {
  const byEn = en => MCI.diseases.find(d => d.en === en);
  const pairs = [
    ['Stroke', ['อย่างน้อย 180 วัน', 'CT Scan', 'MRI Scan']],
    ['Coma', ['96 ชั่วโมง', 'นานกว่า 30 วัน']],
    ['Major Burns', ['ระดับ 3', '20% ตามพื้นที่ผิวร่างกาย']],
    ['Multiple Sclerosis', ['6 เดือน']],
    ['Loss of speech', ['น้อย 12 เดือน']],
    ['Major Head Trauma', ['อย่างน้อย 3 เดือน', '3 อย่างขึ้นไป']],
    ['Apallic Syndrome', ['อย่างน้อย 1 เดือน']],
    ['Chronic lung disease', ['ต่ำกว่า 1 ลิตร', '55 mmHg']],
    ['Cardiomyopathy', ['ระดับ 3', 'New York Heart Association']],
    ['Heart Attack', ['CPK-MB', 'Troponin']],
    ['Systemic Lupus Erythematosus with Lupus Nephritis', ['ระดับที่ 3 ถึงระดับที่ 5']],
  ];
  for(const [en, keys] of pairs){
    const s = JSON.stringify(byEn(en));
    assert.ok(s, `ไม่พบโรค ${en}`);
    for(const k of keys) assert.ok(s.includes(k), `${en} ขาดเกณฑ์ "${k}"`);
  }
});

test('ข้อจำกัดอายุเฉพาะข้อของไวรัสตับอักเสบต้องไม่หาย', () => {
  const d = MCI.diseases.find(x => x.en === 'Fulminant Viral Hepatitis');
  assert.match(d.extra || '', /อายุ 60 ปีเท่านั้น/,
    'ข้อนี้เป็นข้อเดียวที่มีเพดานอายุใช้สิทธิของตัวเอง ห้ามตกหล่น');
  assert.ok(d.doc && d.doc.includes('ตอนเสนอ'));
});

test('กติกาเคลมซ้ำและวันสำคัญต้องตรงกับกรมธรรม์', () => {
  const r = MCI._meta.reclaim;
  assert.equal(r.max_times, 4);
  assert.equal(r.max_multiple, 4);
  assert.equal(r.per_group_multiple, 1);
  assert.equal(r.window_years, 10);
  assert.equal(r.premium_waived_after_first, true);
  assert.match(MCI._meta.waiting, /90 วัน/);
  assert.match(MCI._meta.notify, /60 วัน/);
  assert.match(MCI._meta.notify, /180 วัน/);
  assert.equal(MCI._meta.renew_to, 79);
  assert.equal(MCI._meta.terminate_age, 80);
  // สามข้อของความคุ้มครองหลังเคลมครั้งแรก ต้องอยู่ครบ
  const cov = MCI.coverage.join(' ');
  assert.ok(cov.includes('ไม่ต้องจ่ายเบี้ยประกันภัยของสัญญาเพิ่มเติมนี้อีก'));
  assert.ok(cov.includes('จะสิ้นสุดลง'));
  assert.ok(cov.includes('ไม่เกิน 10 ปี'));
});

test('ข้อยกเว้นที่ต้องพูดตอนเสนอต้องอยู่ครบ', () => {
  const ex = MCI.exclusions.join(' ');
  for(const s of ['สภาพที่เป็นมาก่อน', 'ระยะรอคอย 90 วัน', 'นอกเหนือจากที่ได้ให้คำจำกัดความไว้', 'AIDS and HIV'])
    assert.ok(ex.includes(s), `ขาดข้อยกเว้น ${s}`);
  // สิ้นผลบังคับด้วยนาฬิกา 10 ปี เป็นข้อที่ลูกค้าไม่รู้มากที่สุด
  assert.ok(MCI.terminate.join(' ').includes('ครบรอบ 10 ปี'));
});

/* ---------- หน้าเว็บ ---------- */

test('หน้าแผนต้องแสดงนิยามจริง พร้อมป้ายสีแยก 4 กลุ่ม', () => {
  assert.match(html, /detailSections: \(\) => multipleCiReclaimSection\(\) \+ mciDefinitionsSection\(\)/);
  assert.match(html, /function mciDefinitionsSection\(\)\{/);
  assert.match(html, /function setMciDefTab\(key\)\{/);
  assert.match(html, /const MCI_BADGE = \{/);
  for(const k of ['mb-cardio','mb-cancer','mb-organ','mb-other'])
    assert.ok(html.includes(`.${k}{background:`), `ขาดสีป้าย ${k}`);
  assert.match(html, /mci-definitions\.json\?v=' \+ DATA_VERSION/);
  // โหลดไม่ได้ต้องไม่แสดงอะไรเลย ดีกว่าแสดงนิยามที่ไม่ครบ
  assert.match(html, /if\(!MCI_DEF \|\| !MCI_DEF\.diseases \|\| !MCI_DEF\.diseases\.length\) return '';/);
  // ต้องอธิบายว่าสีบอกกลุ่ม ไม่ได้บอกจำนวนเงิน ไม่งั้นลูกค้าเข้าใจว่าจ่ายไม่เท่ากัน
  assert.ok(html.includes('ทุกโรคจ่าย 100% ของทุนเท่ากัน'));
});

/* ---------- ฟังก์ชันคิดเบี้ย ---------- */

const ctx = vm.createContext({RATES, Math, Number, Object});
vm.runInContext([
  grab('const MCI_CAPITAL_COL = '),
  grab('function multipleCiPremium('),
  grab('function multipleCiNearestCapital('),
  'this.p = multipleCiPremium; this.near = multipleCiNearestCapital;',
].join('\n'), ctx);

test('เบี้ยต้องตรงกับตารางของบริษัททุกงวดชำระ', () => {
  const g = RATES.multiple_ci;
  const col = {500000:2, 1000000:3, 2000000:4};
  for(const freq of ['annual','semiannual','quarterly','monthly']){
    const table = freq === 'annual' ? g : g.payment_schedules[freq];
    for(const sex of ['m','f']){
      for(const band of table[sex]){
        for(const [cap, c] of Object.entries(col)){
          const got = ctx.p(Number(cap), sex, band[0], freq);
          assert.equal(got, band[c], `${freq}/${sex}/อายุ ${band[0]}/ทุน ${cap}`);
        }
      }
    }
  }
});

test('ทุนที่บริษัทไม่เปิดขาย ต้องคืนค่าว่าง ห้ามเทียบบัญญัติไตรยางศ์', () => {
  for(const cap of [300000, 750000, 1500000, 3000000, 5000000])
    assert.equal(ctx.p(cap, 'm', 35, 'annual'), null, `ทุน ${cap} ไม่มีในตาราง ต้องคืน null`);
  assert.deepEqual(RATES.multiple_ci.allowed_capitals, [500000, 1000000, 2000000]);
});

test('อายุนอกตารางต้องจัดการให้ถูก ไม่ใช่คืนค่ามั่ว', () => {
  const g = RATES.multiple_ci;
  const first = g.m[0], last = g.m[g.m.length - 1];
  assert.equal(ctx.p(1000000, 'm', first[0] - 1, 'annual'), null, 'อายุต่ำกว่าตารางคือยังทำไม่ได้');
  assert.equal(ctx.p(1000000, 'm', last[1], 'annual'), last[3]);
  assert.equal(ctx.p(1000000, 'm', last[1] + 5, 'annual'), last[3], 'อายุเกินตารางให้หยุดที่ช่วงสุดท้าย');
  assert.equal(ctx.p(1000000, 'm', NaN, 'annual'), null);
});

test('เบี้ยต้องแพงขึ้นตามอายุ และทุนสองเท่าต้องเบี้ยสองเท่า', () => {
  let prev = 0;
  for(const band of RATES.multiple_ci.m){
    const v = ctx.p(1000000, 'm', band[0], 'annual');
    assert.ok(v >= prev, `อายุ ${band[0]} เบี้ยลดลงจากช่วงก่อนหน้า`);
    prev = v;
    assert.equal(ctx.p(2000000, 'm', band[0], 'annual'), v * 2, `อายุ ${band[0]} ทุนสองเท่าเบี้ยไม่เป็นสองเท่า`);
  }
});

test('ปัดทุนลงหาระดับที่ขายได้จริง ไม่ปัดขึ้นจนลูกค้าจ่ายเกินที่ตั้งใจ', () => {
  assert.equal(ctx.near(2000000), 2000000);
  assert.equal(ctx.near(1500000), 1000000);
  assert.equal(ctx.near(999999), 500000);
  assert.equal(ctx.near(100000), 500000, 'ต่ำกว่าทุนต่ำสุด ให้ใช้ทุนต่ำสุดที่มีจริง');
});

/* ---------- ตรรกะสามชั้นในผู้ช่วยจัดแผน ---------- */

/* ประกาศ DCARE_STAGES เข้าไปในบริบทตรง ๆ ด้วยตัวช่วยตัดวงเล็บตัวเดียวกับที่ใช้ทั้งไฟล์
   เคยพลาดมาแล้วจากการนับ index เอง ซึ่งได้ช่วงผิดจนโค้ดพังแบบเงียบ ๆ */
const advCtx = vm.createContext({Math, Number, Array, Object, RATES});
vm.runInContext(grab('const DCARE_STAGES = ') + ';', advCtx);
/* สองบรรทัดนี้ไม่มีวงเล็บปีกกา จึงใช้ grab ไม่ได้ ต้องดึงทั้งบรรทัดตรง ๆ
   ถ้าใช้ grab มันจะวิ่งไปเจอปีกกาของฟังก์ชันถัดไปแล้วคว้ามาเกิน */
const line = re => {
  const m = html.match(re);
  assert.ok(m, `ไม่พบบรรทัด ${re}`);
  return m[0];
};
vm.runInContext([
  line(/var ADV_DCARE_STAGE = '[a-z_]+';|const ADV_DCARE_STAGE = '[a-z_]+';/),
  line(/const ADV_DCARE_FULL_CATS = \[[^\]]*\];/),
  grab('function advDcareItems(target)'),
  grab('const MCI_CAPITAL_COL = '),
  grab('function multipleCiNearestCapital('),
  grab('function advPushMci(out, target)'),
  'this.dcare = advDcareItems; this.push = advPushMci; this.CATS = ADV_DCARE_FULL_CATS;',
].join('\n').replace("const ADV_DCARE_STAGE = 'early_and_severe';", "var ADV_DCARE_STAGE = 'early_and_severe';"), advCtx);

test('ชั้นที่ 1 ต้องกระจายทุนครบ 5 หมวด และไม่เกินเพดานรวม', () => {
  const items = advCtx.dcare(2500000);
  assert.equal(items.length, 5, 'ต้องได้ครบ 5 หมวด');
  assert.deepEqual(items.map(x => x.cat).sort(), advCtx.CATS.slice().sort());
  const total = items.reduce((n, x) => n + x.capital, 0);
  assert.ok(total <= 2500000, `ทุนรวม ${total} เกินเพดานโหมดสองระยะ`);
  items.forEach(x => {
    assert.equal(x.stage, 'early_and_severe');
    assert.equal(x.capital % 50000, 0, 'ทุนต้องเป็นขั้นละ 50,000');
  });
});

test('กลุ่มยอดฮิตต้องซื้อเดี่ยว ห้ามโผล่มาปนกับหมวดอื่นเด็ดขาด', () => {
  assert.ok(!advCtx.CATS.includes('popular'), 'ยอดฮิตต้องไม่อยู่ในชุดครบหมวด');
  for(const target of [2500000, 1000000, 500000, 250000, 100000]){
    const items = advCtx.dcare(target);
    const hasPopular = items.some(x => x.cat === 'popular');
    if(hasPopular) assert.equal(items.length, 1,
      `ทุน ${target} มียอดฮิตปนกับกลุ่มอื่น ${items.length} รายการ ซึ่งบริษัทไม่รับ`);
  }
});

test('งบน้อยจนซื้อครบหมวดไม่ได้ ต้องถอยไปยอดฮิตเดี่ยว ไม่ใช่คืนรายการว่าง', () => {
  const items = advCtx.dcare(100000);
  assert.equal(items.length, 1);
  assert.equal(items[0].cat, 'popular');
  assert.ok(items[0].capital >= 250000, 'ต้องดันขึ้นถึงทุนขั้นต่ำที่บริษัทรับ');
});

test('ชั้นที่ 3 ต้องใส่ทุนที่ขายได้จริงเท่านั้น', () => {
  const out = [];
  advCtx.push(out, 5000000);
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'mci');
  assert.equal(out[0].capital, 2000000, 'ต้องไม่เกินเพดานที่เปิดขาย');
  const out2 = [];
  advCtx.push(out2, 1500000);
  assert.equal(out2[0].capital, 1000000);
});

test('ตัวคิดเบี้ยของแพ็กเกจต้องรู้จักรายการใหม่ทั้งสองแบบ', () => {
  assert.match(html, /if\(item\.kind==='mci'\) return multipleCiPremium\(item\.capital, gender, age, 'annual'\)/);
  // D Care ต้องส่งกลุ่มโรคและโหมดต่อไปด้วย ไม่ใช่ล็อกไว้ที่ยอดฮิตเหมือนเดิม
  assert.match(html, /dcarePremium\(item\.cat \|\| 'popular', item\.capital, gender, age, 'annual', item\.stage \|\| 'early_and_severe'\)/);
  // ป้ายชื่อรายการต้องบอกเพดานจ่ายจริง ไม่ใช่บอกแค่ทุน
  assert.match(html, /จ่ายได้ถึง \$\{fmt\(item\.capital \* st\.payPct \/ 100\)\}/);
  assert.match(html, /เคลมได้กลุ่มละครั้ง สูงสุด 4 กลุ่ม/);
});

test('Care Plus ต้องไม่เป็นตัวเลือกหลอก และยังใส่ให้ทุกแพ็กเกจที่ไม่ใช่ Elite', () => {
  const sel = html.slice(html.indexOf('<select id="ai_ciStyle"'), html.indexOf('</select>', html.indexOf('<select id="ai_ciStyle"')));
  assert.ok(!sel.includes('Care Plus'), 'Care Plus ถูกใส่ให้อยู่แล้ว ไม่ควรทำเป็นตัวเลือกให้กด');
  assert.match(html, /const out = \[\{kind:'careplus', plan:'cackd'\}\];/);
  assert.ok(html.includes('Care Plus ไม่ใช่โรคร้ายแรงแบบเจอจ่ายจบ'),
    'ต้องมีคอมเมนต์อธิบายว่าทำไมถึงไม่ใช่ตัวเลือก');
});

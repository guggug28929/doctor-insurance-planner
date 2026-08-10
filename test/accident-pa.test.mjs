import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* หน้าประกันอุบัติเหตุแบบซื้อเดี่ยว /accident

   ความเสี่ยงของงานนี้มีสามข้อ และสองข้อแรกเป็นเรื่องที่ทำให้เสียหายจริง
     1) ตัวเลขฝั่งตัวแทน (ผลตอบแทนการขาย) ปนอยู่ในหน้าต้นทางของบริษัท 4 แบบ
        ถ้าคัดลอกมาทั้งหน้าโดยไม่กรอง ข้อมูลภายในจะขึ้นเว็บสาธารณะทันที
     2) ตารางเบี้ยของหลายแบบมีช่องว่างจริง เพราะบริษัทไม่เปิดขายแผนนั้นในช่วงอายุนั้น
        ถ้าเผลอเติมตัวเลขให้เต็ม ลูกค้าจะเห็นราคาของแผนที่ซื้อไม่ได้
     3) กลุ่มนี้ซื้อเดี่ยวได้โดยไม่ต้องมีสัญญาหลัก ซึ่งต่างจากทุกแผนในเว็บ ต้องสื่อให้ชัด */

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const PA = JSON.parse(readFileSync(new URL('data/pa-plans.json', root), 'utf8'));
const rawJson = readFileSync(new URL('data/pa-plans.json', root), 'utf8');

const planKeys = Object.keys(PA).filter(k => !k.startsWith('_'));

test('ห้ามมีตัวเลขผลตอบแทนฝั่งตัวแทนในไฟล์ข้อมูลหรือหน้าเว็บ', () => {
  const banned = ['นายหน้า', 'คอมมิชชั่น', 'commission', 'Commission', 'ผลประโยชน์สำหรับการขาย', 'ค่าส่งเสริมการขาย'];
  for(const w of banned){
    assert.ok(!rawJson.includes(w), `data/pa-plans.json มีคำต้องห้าม: ${w}`);
  }
  // หน้าเว็บก็ต้องสะอาด เพราะข้อมูลชุดนี้ถูกดึงมาจากหน้าเดียวกับตารางความคุ้มครอง
  const page = html.slice(html.indexOf('id="page-accident"'), html.indexOf('id="page-pension-compare"'));
  for(const w of banned) assert.ok(!page.includes(w), `หน้า /accident มีคำต้องห้าม: ${w}`);
});

test('ต้องมีครบ 8 แบบ และทุกแบบมีข้อมูลที่ใช้ขายได้จริง', () => {
  assert.equal(planKeys.length, 8);
  for(const k of planKeys){
    const p = PA[k];
    assert.ok(p.name, `${k} ไม่มีชื่อ`);
    assert.ok(p.tagline, `${k} ไม่มีคำอธิบายสั้น`);
    assert.ok(Array.isArray(p.plans) && p.plans.length, `${k} ไม่มีรายการแผน`);
    assert.ok(p.entryAge && Object.keys(p.entryAge).length, `${k} ไม่มีอายุรับประกัน`);
    assert.ok(Array.isArray(p.occupations) && p.occupations.length, `${k} ไม่ระบุกลุ่มอาชีพที่รับ`);
    assert.ok(Array.isArray(p.benefits) && p.benefits.length, `${k} ไม่มีตารางความคุ้มครอง`);
    assert.ok(p.rates && Object.keys(p.rates).length > 1, `${k} ไม่มีตารางเบี้ย`);
    assert.ok(['อบ.1', 'อบ.2'].includes(p.form), `${k} ต้องระบุว่าเป็น อบ.1 หรือ อบ.2`);
  }
});

test('ทุกแถวของตารางต้องมีจำนวนช่องเท่ากับจำนวนแผน ไม่งั้นตัวเลขจะเลื่อนคอลัมน์', () => {
  // เคยเจอกับ Elite มาแล้วว่าคอลัมน์เลื่อนหนึ่งช่อง ทำให้ลูกค้าเห็นวงเงินของแผนอื่น
  for(const k of planKeys){
    const p = PA[k], n = p.plans.length;
    for(const b of p.benefits)
      assert.equal(b.values.length, n, `${k} · แถว "${b.label}" มี ${b.values.length} ช่อง แต่แผนมี ${n}`);
    if(p.sumInsured) assert.equal(p.sumInsured.length, n, `${k} · ทุนประกันไม่ครบทุกแผน`);
    for(const [rk, rows] of Object.entries(p.rates)){
      if(rk === 'unit') continue;
      for(const row of rows){
        if(row.v) assert.equal(row.v.length, n, `${k} · เบี้ย ${rk} อายุ ${row.age} มี ${row.v.length} ช่อง แต่แผนมี ${n}`);
        if(row.male) assert.equal(row.male.length, row.female.length, `${k} · เบี้ยชายหญิงไม่เท่ากันที่อายุ ${row.age}`);
      }
    }
  }
});

test('ช่องที่บริษัทไม่เปิดขายต้องเป็น null ห้ามเป็น 0 หรือเดาตัวเลขให้เต็ม', () => {
  for(const k of planKeys){
    for(const [rk, rows] of Object.entries(PA[k].rates)){
      if(rk === 'unit') continue;
      for(const row of rows) for(const v of (row.v || []))
        assert.ok(v === null || (typeof v === 'number' && v > 0),
          `${k} · ${rk} อายุ ${row.age} มีค่า ${v} ซึ่งไม่ใช่ทั้งเบี้ยจริงและช่องว่างที่บริษัทไม่ขาย`);
    }
  }
});

test('ตั้งแต่อายุ 26 ปีขึ้นไป เบี้ยต้องไม่ลดลงเมื่ออายุมากขึ้น', () => {
  /* ประกันอุบัติเหตุคิดเบี้ยตามความเสี่ยงอุบัติเหตุ ไม่ใช่ความเสี่ยงเสียชีวิตตามอายุแบบประกันชีวิต
     ช่วง 16-25 ปีจึงแพงกว่า 26-30 ปีในหลายแบบ เพราะวัยนั้นเกิดอุบัติเหตุบ่อยที่สุด
     (ตรวจยืนยันกับตารางต้นทางของ PA Takaful Safety แล้วว่าเป็นอัตราจริง ไม่ใช่อ่านผิดแถว)
     กฎนี้จึงเริ่มตรวจที่อายุ 26 ขึ้นไป ซึ่งเป็นช่วงที่เบี้ยควรไต่ขึ้นตามอายุจริง ๆ
     ประโยชน์คือถ้าวันหน้าอ่านตัวเลขจากรูปสลับแถว จะโดนจับตรงนี้ */
  const startAge = row => parseInt(String(row.age).replace(/[^\d]/g, ' ').trim().split(/\s+/)[0], 10) || 0;
  for(const k of planKeys){
    for(const [rk, rows] of Object.entries(PA[k].rates)){
      if(rk === 'unit' || rows.length < 2) continue;
      const later = rows.filter(r => startAge(r) >= 26);
      const cols = (rows[0].v || []).length;
      for(let c = 0; c < cols; c++){
        let prev = null;
        for(const row of later){
          const v = (row.v || [])[c];
          if(typeof v !== 'number') continue;
          if(prev !== null) assert.ok(v >= prev,
            `${k} · ${rk} คอลัมน์ที่ ${c+1} เบี้ยลดลงเมื่ออายุมากขึ้น (${prev} -> ${v} ที่อายุ ${row.age})`);
          prev = v;
        }
      }
    }
  }
});

test('หน้าเว็บต้องอ่านตัวเลขจากไฟล์ข้อมูล ไม่ใช่พิมพ์ค้างไว้', () => {
  assert.match(html, /var PA_PLANS = \(function\(\)\{/, 'ไม่มีตัวโหลดไฟล์ข้อมูล');
  assert.match(html, /'pa-plans\.json\?v=' \+ DATA_VERSION/, 'ไม่ได้ใส่ cache busting');
  for(const fn of ['paCardsHtml', 'paBenefitTableHtml', 'paRateTablesHtml', 'paCompareTableHtml', 'showPaDetail']){
    assert.ok(html.includes('function ' + fn + '('), `ไม่พบฟังก์ชัน ${fn}`);
  }
  // เบี้ยเริ่มต้นต้องหาจากตารางจริง ไม่ใช่เขียนตัวเลขไว้ในโค้ด
  const min = html.slice(html.indexOf('function paMinPremium('), html.indexOf('function paPremiumText('));
  assert.match(min, /typeof x === 'number' && x > 0/, 'ต้องข้ามช่องที่บริษัทไม่เปิดขาย');
  assert.ok(!/[0-9]{3,}/.test(min.replace(/[0-9]+\s*\*/g, '')), 'มีตัวเลขเบี้ยพิมพ์ค้างในตัวหาเบี้ยเริ่มต้น');
});

test('ต้องบอกให้ชัดว่ากลุ่มนี้ซื้อเดี่ยวได้ ไม่ต้องมีสัญญาหลัก', () => {
  const page = html.slice(html.indexOf('id="page-accident"'), html.indexOf('id="page-pension-compare"'));
  assert.match(page, /ซื้อเดี่ยวได้|ไม่ต้องมีประกันชีวิต|ไม่ต้องมีสัญญาหลัก/);
  assert.match(page, /อบ\.1/);
  assert.match(page, /อบ\.2/);
});

test('หน้าอุบัติเหตุต้องรวมทั้งซื้อเดี่ยวและแบบแนบกรมธรรม์ไว้ที่เดียว', () => {
  /* คำว่า "อุบัติเหตุ" โผล่สองที่บนเว็บ คือเมนูหลักกับกลุ่มในหน้าแผนทั้งหมด
     ถ้าสองที่นี้ให้ผลไม่เหมือนกันโดยไม่อธิบาย ลูกค้าจะสรุปว่าข้อมูลในเว็บขัดกันเอง
     จึงต้องมีทั้งสองทางอยู่ในหน้าเดียว พร้อมคำถามที่ลูกค้าตอบเองได้ว่าควรอ่านทางไหน */
  const page = html.slice(html.indexOf('id="page-accident"'), html.indexOf('id="page-pension-compare"'));
  assert.match(page, /id="pa-standalone"/, 'ไม่มีบล็อกซื้อเป็นกรมธรรม์เดี่ยว');
  assert.match(page, /id="pa-rider"/, 'ไม่มีบล็อกแนบกับกรมธรรม์ที่มีอยู่');
  assert.match(page, /มีประกันชีวิตของเมืองไทยอยู่แล้วหรือยัง/, 'ไม่มีคำถามคัดทางเลือก');
  assert.match(page, /jumpToPlanGroup\('pa-standalone'\)/);
  assert.match(page, /jumpToPlanGroup\('pa-rider'\)/);
  assert.match(page, /showPlanDetail\('pa'\)/, 'บล็อกแนบกรมธรรม์ต้องลิงก์ไปหน้า PA Easy Plan Rider ตัวจริง');
  // ข้อต่างที่ตัดสินใจจริง ต้องเขียนไว้ ไม่ใช่ปล่อยให้ลูกค้าเดา
  assert.match(page, /ต้องมีกรมธรรม์หลักที่มีผลบังคับอยู่/);
  assert.match(page, /ความคุ้มครองสิ้นสุดตามกรมธรรม์หลัก/);
});

test('กลุ่มอุบัติเหตุในหน้าแผนทั้งหมดต้องมีทางไปหน้ากรมธรรม์เดี่ยว', () => {
  // ถ้าไม่มีสะพานนี้ คนที่กดชิปอุบัติเหตุจะเห็นแบบเดียวแล้วเข้าใจว่าเว็บมีแค่นั้น
  const plans = html.slice(html.indexOf('id="grp-pa"'), html.indexOf('id="grp-pension"'));
  assert.match(plans, /showPage\('accident'\)/, 'ไม่มีปุ่มไปหน้าประกันอุบัติเหตุแบบซื้อเดี่ยว');
  assert.match(plans, /สัญญาเพิ่มเติม · อุบัติเหตุ/,
    'ป้ายบนการ์ด PA Easy Plan Rider ต้องบอกว่าเป็นสัญญาเพิ่มเติม ไม่ใช่เขียนว่าอุบัติเหตุเฉย ๆ');
});

test('เส้นทางและเมนูต้องต่อเข้าระบบเดิมครบ', () => {
  assert.match(html, /accident: '\/accident',/, 'ไม่มีเส้นทางในทะเบียนหน้า');
  /* ปุ่มถูกซ่อนจากแถบเมนูแล้ว ทางเข้าหลักคือแผงกลุ่มใต้ปุ่มแผนทั้งหมดกับการ์ดสะพานในหน้าแผน
     แต่ปุ่มต้องยังอยู่ใน #navbar เพราะ showPage และดัชนีค้นหาทั้งเว็บอ่านจากตรงนี้ที่เดียว */
  assert.match(html, /<button data-page="accident" class="nav-off">/,
    'ปุ่มหน้าอุบัติเหตุต้องยังอยู่ใน navbar แบบซ่อน');
  assert.match(html, /id="page-accident"/);
  assert.match(html, /id="page-accident-detail"/);
  assert.match(html, /if\(name === 'accident' && typeof renderAccidentPage === 'function'\) renderAccidentPage\(\);/);
  // ลิงก์รายแบบที่ส่งให้ลูกค้าต้องเปิดได้ตรง ไม่เด้งกลับหน้าแรก
  assert.match(html, /path\.startsWith\('\/accident\/'\)/);
  const vercel = JSON.parse(readFileSync(new URL('vercel.json', root), 'utf8'));
  const sources = vercel.rewrites.map(r => r.source);
  assert.ok(sources.includes('/accident'), 'vercel.json ไม่ได้ rewrite /accident');
  assert.ok(sources.includes('/accident/:path*'), 'vercel.json ไม่ได้ rewrite หน้าลูกของ /accident');
});

test('ข้อมูลต้องบันทึกแหล่งที่มาและวันที่ตรวจไว้เสมอ', () => {
  assert.ok(PA._meta.source.includes('smartweb'), 'ไม่ได้ระบุแหล่งข้อมูล');
  assert.match(PA._meta.verified_at, /^\d{4}-\d{2}-\d{2}$/);
  for(const k of planKeys) assert.ok(Number.isInteger(PA[k].smartwebId), `${k} ไม่มีรหัสอ้างอิงหน้าต้นทาง`);
});

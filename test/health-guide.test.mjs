// เทสต์คู่มือวิธีเลือกประกันสุขภาพ และการแก้พฤติกรรมผู้ช่วยที่ไม่สมเหตุผล
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("หน้าความรู้เหลือแท็บเดียว คำถามที่พบบ่อยย้ายไปหน้า /faq แล้ว", () => {
  // ตั้งใจยุบแท็บ เพื่อไม่ให้เนื้อหาซ้ำสองที่จนลูกค้าสับสนว่าคำตอบอยู่ไหน
  assert.ok(!html.includes('id="knowTabBtn-faq"'), "ยังมีปุ่มแท็บ FAQ เดิมค้างอยู่");
  assert.ok(!html.includes('id="knowTab-faq"'), "ยังมีเนื้อหาแท็บ FAQ เดิมค้างอยู่");
  // ลิงก์เก่าต้องไม่พัง
  assert.match(html, /if\(tab === 'faq'\)\{ showPage\('faq'\); return; \}/);
  assert.match(html, /<div id="guideBody"><\/div>/);
});

test("ชื่อหัวข้อต้องไม่ยัดชื่อบริษัท ให้ขายผ่านเนื้อหาแทน", () => {
  // ชื่อหัวข้อควรเป็นความรู้กลาง ๆ คนอ่านไม่รู้สึกว่ากำลังโดนขาย
  const titles = [...html.matchAll(/num:'\d', title:'([^']+)'/g)].map((m) => m[1]);
  assert.equal(titles.length, 5);
  for (const t of titles) {
    assert.ok(!/เมืองไทย/.test(t), `ชื่อหัวข้อไม่ควรมีคำว่าเมืองไทย: ${t}`);
  }
  // แต่ชื่อแบบประกันยังต้องอยู่ในเนื้อหาและตาราง เพื่อให้ขายได้จริง
  assert.match(html, /<th>แบบที่เรามีให้เลือก<\/th>/);
});

test("ต้องมีเรื่องเบี้ยคงที่แบบควบการลงทุน ซึ่งเป็นกับดักที่คนเข้าใจผิดบ่อย", () => {
  assert.match(html, /title:'เก้าเรื่องที่ต้องเคลียร์ก่อนเซ็นใบคำขอ'/);
  assert.match(html, /คำว่าเบี้ยคงที่ ในแบบควบการลงทุน ไม่ได้แปลว่าจ่ายเท่านี้แล้วจบ/);
  assert.match(html, /ค่าการประกันภัยที่ยังขึ้นตามอายุเหมือนเดิม/);
  assert.match(html, /ให้ดูช่องที่จำลองผลตอบแทนต่ำด้วยเสมอ/);
  // ต้องเสนอทางเลือกจัดการเบี้ยหลังเกษียณมากกว่าหนึ่งทาง ไม่ใช่เชียร์ทางเดียว
  assert.match(html, /ถ้ากลัวเบี้ยหลังเกษียณ มีสี่ทางให้เลือก ไม่ใช่ทางเดียว/);
});

test("คู่มือต้องมีครบห้าหัวข้อ พร้อมสารบัญและตารางแมปแบบที่เรามี", () => {
  const ids = [...html.matchAll(/id:'(g-[a-z]+)'/g)].map((m) => m[1]);
  assert.deepEqual(ids, ["g-why", "g-bucket", "g-type", "g-trap", "g-pick"]);
  assert.equal([...html.matchAll(/\{t:'/g)].length >= 8, true, "ควรมีแปดเรื่องที่ต้องเคลียร์");
  assert.match(html, /function healthGuideBucketsHtml\(\)/);
  assert.match(html, /function healthGuideTypeTableHtml\(\)/);
  assert.match(html, /function healthGuideMapHtml\(\)/);
  // ตารางแมปต้องอ้างแบบของเมืองไทยจริง ไม่ใช่แบบของบริษัทอื่น
  for (const p of ["D Health Lite", "Elite Health Plus", "Care Plus", "เหมาจ่าย Extra", "Extra Care Plus", "CI Perfect Care"]) {
    assert.ok(html.includes(p), `ตารางแมปควรอ้างถึง ${p}`);
  }
  // ห้ามอ้างชื่อแบบของบริษัทอื่นในคู่มือของเรา
  for (const bad of ["BLA", "Happy Health", "Prestige Health", "releaseyourrisk"]) {
    assert.ok(!html.includes(bad), `ห้ามมีชื่อ ${bad} ในเว็บของเรา`);
  }
});

test("อินโฟกราฟิกสามก้อนต้องใช้ทั้งในคู่มือและบนหน้าผู้ช่วยจัดแผน", () => {
  const keys = [...html.matchAll(/key:'(transfer|depend|keep)'/g)].map((m) => m[1]);
  assert.deepEqual(keys, ["transfer", "depend", "keep"]);
  assert.match(html, /id="advBucketBox"/);
  // หน้าผู้ช่วยจัดแผนเปลี่ยนไปใช้อินโฟกราฟิกที่รวมทั้งสามก้อนและลำดับการตัดไว้ด้วยกัน
  assert.match(html, /bb\.innerHTML = advPrincipleInfographic\(\)/);
  // แต่อินโฟกราฟิกต้องดึงข้อมูลจากชุดเดียวกับคู่มือ จะได้ไม่หลุดกัน
  assert.match(html, /HEALTH_GUIDE_BUCKETS\.map\(\(g, i\)/);
  // กรอบเก่าต้องถูกถอดออกแล้ว
  assert.doesNotMatch(html, /สรณะของระบบ:/);
  assert.doesNotMatch(html, /ลำดับการตัดเมื่อเบี้ยเกินงบ/);
});

test("หน้าแผนต้องมีปุ่มลิงก์ไปคู่มือ ข้างหัวข้อสัญญาเพิ่มเติมสุขภาพ", () => {
  assert.match(html, /id = 'guideLinkBtn'/);
  assert.match(html, /วิธีเลือกประกันสุขภาพ<span class="bgl-arrow"/);
  assert.match(html, /t\.id === 'compareModeToggle' && !document\.getElementById\('guideLinkBtn'\)/);
});

test("ห้ามอ้างว่า AI เป็นคนจัดแผนและคิดเบี้ย เพราะจริง ๆ เป็นกฎที่เขียนตายตัว", () => {
  assert.doesNotMatch(html, /ให้ AI ช่วยจัดแผน/);
  assert.match(html, /จัดแผนให้เลย/);
  assert.match(html, /ไม่ได้ให้ AI เป็นคนเลือกหรือคิดตัวเลข/);
});

test("ผู้ช่วยประกันชีวิตต้องไม่ขึ้นตารางเองตั้งแต่เปิดหน้า ต้องกดปุ่มก่อน", () => {
  assert.match(html, /let lifeShowResult = false;/);
  assert.match(html, /function runLifeAdvisor\(\)/);
  assert.match(html, /if\(!lifeShowResult\)\{/);
  assert.match(html, /onclick="runLifeAdvisor\(\)">คำนวณทุนชีวิตที่ควรมี/);
});

test("ก้อนทุนชั่วคราวต้องคุ้มครองยาวพอกับจำนวนปีที่ครอบครัวต้องพึ่ง", () => {
  assert.match(html, /function lifeCoverYears\(p, age\)/);
  assert.match(html, /const needYears = bucket === 'temporary'/);
  assert.match(html, /const enough = cands\.filter\(p => lifeCoverYears\(p, age\) >= needYears\)/);
});

test("ปุ่มลิงก์คู่มือต้องมีสไตล์จริง ไม่ใช่ปุ่ม default ของเบราว์เซอร์", () => {
  // เคยพลาด: ใส่คลาส btn-outline ที่ไม่มีนิยามใน CSS ปุ่มเลยไม่มีสไตล์เลย
  const classes = [...html.matchAll(/className = '([a-z0-9 -]*btn-guide-link[a-z0-9 -]*)'/g)].map((m) => m[1]);
  assert.equal(classes.length, 1);
  for (const c of classes[0].split(/\s+/)) {
    assert.ok(new RegExp(`\\.${c}\\s*\\{`).test(html), `คลาส .${c} ต้องมีนิยามใน CSS`);
  }
  // ปุ่มคู่ต้องอยู่ในกล่องเดียวกัน จะได้สูงเท่ากันและตกบรรทัดพร้อมกัน
  assert.match(html, /\.group-break-actions\s*\{/);
  assert.match(html, /actions\.appendChild\(btn\)/);
});

test("ห้ามนิยาม group-break-with-action ซ้ำจนกฎตีกันเอง", () => {
  const base = [...html.matchAll(/\.group-break-with-action\s*\{([^}]*)\}/g)].map((m) => m[1]);
  const aligns = base.filter((b) => /align-items/.test(b));
  // อนุญาตให้ override ได้เฉพาะใน media query เท่านั้น จึงต้องไม่เกินสองที่
  assert.ok(aligns.length <= 2, `นิยาม align-items ซ้ำ ${aligns.length} ที่`);
});

test("เรื่อง OPD ต้องอธิบายทั้งสองด้าน และย้ำว่าของเราแยกสัญญา", () => {
  assert.match(html, /OPD เป็นส่วนที่แพงที่สุดเมื่อเทียบกับโอกาสได้ใช้/);
  // จุดขายจริงของเรา: OPD แยกสัญญา ถูกไม่ต่ออายุแล้วไม่ลามทั้งฉบับ
  assert.match(html, /OPD เป็นสัญญาแยกต่างหาก/);
  // ต้องไม่ด้านเดียว ต้องบอกว่าเมื่อไหร่ OPD สมเหตุสมผล
  assert.match(html, /OPD ไม่ใช่ของไม่ดี/);
});

test("ตารางจุดคุ้มทุน OPD ต้องคำนวณสดจากตารางเบี้ย ห้ามฝังตัวเลข", () => {
  assert.match(html, /function opdBreakEven\(sex, perVisit, entryAge\)/);
  assert.match(html, /RATES\['opd_ครั้ง'\]/);
  // renderer ต้องเรียก extraHtml จริง ไม่งั้นตารางไม่ขึ้น
  assert.match(html, /typeof sec\.extraHtml === 'function' \? sec\.extraHtml\(\)/);
  // ต้องติดป้ายข้อจำกัดว่าเป็นเงินสดล้วน ไม่ใช่ ROI
  assert.match(html, /ยังไม่คิดมูลค่าเงินตามเวลาและเงินเฟ้อค่ารักษา/);
});

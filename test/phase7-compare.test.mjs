// เทสต์ส่วนที่เหลือของเฟส 7 — หน้าเปรียบเทียบแบบจัดกลุ่ม และสัญญาเพิ่มเติมเป็นบรรทัดแยก
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const RATES = JSON.parse(
  await readFile(new URL("../data/premium-rates.json", import.meta.url), "utf8")
);

function block(marker, open, close) {
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, `ไม่พบ ${marker}`);
  let depth = 0;
  for (let i = html.indexOf(open, start); i < html.length; i++) {
    if (html[i] === open) depth++;
    else if (html[i] === close) {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error(`วงเล็บไม่ครบสำหรับ ${marker}`);
}
const fn = (m) => block(m, "{", "}");
const arr = (n) => block(`const ${n} = [`, "[", "]") + ";";
const obj = (n) => block(`const ${n} = {`, "{", "}") + ";";

const sandbox = { RATES, Math, Number, Array, String, JSON, Object };
sandbox.fmt = (n) => String(n);
vm.createContext(sandbox);
vm.runInContext(
  [
    "let compareSelected = [];",
    fn("function rateAtStart("),
    fn("function lifetimeProtectionPremium("),
    fn("function lifetimeWpRiderPremium("),
    arr("COMPARE_SELECTABLE_IDS"),
    obj("COMPARE_GROUPS"),
    fn("function compareGroupOf("),
    fn("function compareActiveGroup("),
    obj("LIFE_COMPARE_PRODUCTS"),
    arr("LIFE_COMPARE_ROW_DEFS"),
    arr("LIFE_ADDONS"),
    fn("function buildLifeAddonRows("),
  ].join("\n"),
  sandbox
);
const COMPARE_GROUPS = vm.runInContext("COMPARE_GROUPS", sandbox);
const LIFE_COMPARE_PRODUCTS = vm.runInContext("LIFE_COMPARE_PRODUCTS", sandbox);
const LIFE_ADDONS = vm.runInContext("LIFE_ADDONS", sandbox);
const call = (n, ...a) => vm.runInContext(n, sandbox)(...a);

test("แบบใหม่ทุกตัวเลือกเปรียบเทียบได้ และถูกจัดอยู่กลุ่มประกันชีวิต", () => {
  const ids = vm.runInContext("COMPARE_SELECTABLE_IDS", sandbox);
  for (const id of ["lifetimeprotection", "waigao9090", "waigao9910", "easyprotection"]) {
    assert.ok(ids.includes(id), `${id} ต้องเลือกเปรียบเทียบได้`);
    assert.equal(call("compareGroupOf", id), "life");
  }
  for (const id of ["dhl", "ehp", "maochai", "ecp", "careplus", "opd"]) {
    assert.equal(call("compareGroupOf", id), "health");
  }
  // ทุก id ในสองกลุ่มรวมกันต้องเท่ากับรายการที่เลือกได้ ไม่มีตัวตกหล่น
  const all = COMPARE_GROUPS.health.ids.concat(COMPARE_GROUPS.life.ids).sort().join(",");
  assert.equal(all, ids.slice().sort().join(","));
});

test("ทุกแบบในกลุ่มประกันชีวิตมีข้อมูลครบทุกหัวข้อ ไม่มีช่องหาย", () => {
  const rowDefs = vm.runInContext("LIFE_COMPARE_ROW_DEFS", sandbox);
  const dataKeys = rowDefs.filter((d) => d.key && !d.key.startsWith("_")).map((d) => d.key);
  for (const id of COMPARE_GROUPS.life.ids) {
    const p = LIFE_COMPARE_PRODUCTS[id];
    assert.ok(p, `ไม่มีข้อมูลของ ${id}`);
    assert.ok(p.tiers.length >= 2, `${id} ควรมีตัวเลือกทุนอย่างน้อย 2 ระดับ`);
    assert.ok(p.tiers.some((t) => t.value === p.defaultValue), `${id} ค่าเริ่มต้นไม่อยู่ในตัวเลือก`);
    for (const k of dataKeys) {
      assert.ok(p.rows[k] && String(p.rows[k]).length > 1, `${id} ขาดข้อมูลหัวข้อ ${k}`);
    }
  }
});

test("ข้อมูลในตารางเปรียบเทียบตรงกับข้อมูลจริงของแบบนั้น", () => {
  const ltp = LIFE_COMPARE_PRODUCTS.lifetimeprotection;
  assert.match(ltp.rows.wait, new RegExp(String(RATES.lifetime_protection.waiting_period_days)));
  assert.match(ltp.rows.ci, new RegExp(String(RATES.lifetime_protection.ci_count)));
  assert.match(ltp.rows.entry, /1 – 65 ปี/);
  const w9090 = LIFE_COMPARE_PRODUCTS.waigao9090;
  assert.match(w9090.rows.health, /ไม่ต้องตรวจและไม่ต้องตอบคำถามสุขภาพ/);
  assert.match(w9090.rows.maxSum, new RegExp(fmtTh(RATES.sabaijai_90_90.capital_max_per_person_all_channels)));
  assert.match(w9090.rows.wait, /102%/);
  // 90/90 ไม่มีสิทธิลดหย่อนระบุไว้ ต้องเขียนว่ายังไม่พบ ไม่ใช่เขียนว่าลดหย่อนได้
  assert.match(w9090.rows.tax, /ไม่ได้ระบุ/);
  assert.match(LIFE_COMPARE_PRODUCTS.waigao9910.rows.tax, /เฉพาะเบี้ยส่วนความคุ้มครองชีวิต/);
  // อีซี่ โพรเทคชั่น ต้องบอกชัดว่าครบสัญญาไม่มีเงินคืน
  assert.match(LIFE_COMPARE_PRODUCTS.easyprotection.rows.maturity, /ไม่มีเงินคืน/);
  function fmtTh(n){ return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
});

test("ห้ามเลือกข้ามกลุ่ม เพราะหัวข้อเปรียบเทียบเป็นคนละชุด", () => {
  assert.match(html, /เลือกข้ามกลุ่มไม่ได้ครับ/);
  assert.match(html, /if\(cur && compareGroupOf\(id\) !== cur\)/);
  // ทั้งช่องติ๊กบนหน้ารายการ และช่องเพิ่มแผนบนหน้าเปรียบเทียบ ต้องกันทั้งสองทาง
  assert.equal((html.match(/compareGroupOf\(id\) !== cur/g) || []).length, 2);
});

test("สัญญาเพิ่มเติมถูกจัดเป็น add-on ไม่ใช่สัญญาหลัก และผูกกับแบบที่แนบได้เท่านั้น", () => {
  assert.equal(LIFE_ADDONS.length, 3);
  const byId = Object.fromEntries(LIFE_ADDONS.map((a) => [a.id, a]));
  // ต้องไม่มีตัวไหนโผล่ไปอยู่ในรายการสัญญาหลักที่เลือกเปรียบเทียบได้
  const ids = vm.runInContext("COMPARE_SELECTABLE_IDS", sandbox);
  for (const a of LIFE_ADDONS) assert.ok(!ids.includes(a.id), `${a.id} ต้องไม่อยู่ในรายการสัญญาหลัก`);
  // WP ผูกกับไลฟ์ไทม์เท่านั้น
  assert.deepEqual(byId.wp.onlyFor.join(","), "lifetime_protection");
  // สองตัวของวัยเก๋าผูกกับวัยเก๋าสองแบบเท่านั้น
  for (const id of ["pa_senior", "hb_senior"]) {
    assert.deepEqual(byId[id].onlyFor.slice().sort().join(","), "sabaijai_90_90,sabaijai_99_10");
  }
});

test("เบี้ยของสัญญาเพิ่มเติมคำนวณจากตารางจริง และเคารพช่วงอายุที่รับ", () => {
  const byId = Object.fromEntries(LIFE_ADDONS.map((a) => [a.id, a]));
  // WP rider อายุ 15-59
  assert.equal(byId.wp.eligible(14), false);
  assert.equal(byId.wp.eligible(60), false);
  assert.equal(byId.wp.eligible(40), true);
  assert.equal(byId.wp.premium(1000000, "m", 15), 310);
  // PA ผู้สูงอายุ แผน 3 ทุน 300,000 อายุ 50-60 ตามตารางคือ 2,300 บาท
  assert.equal(byId.pa_senior.premium(0, "m", 55), 2300);
  assert.equal(byId.pa_senior.premium(0, "m", 72), 4680);
  assert.equal(byId.pa_senior.eligible(76), false);
  // HB ชดเชยวันละ 1,000 บาท อายุ 50-65 ชายอัตรา 250 ต่อ 100 บาท = 2,500
  assert.equal(byId.hb_senior.premium(0, "m", 55), 2500);
  assert.equal(byId.hb_senior.premium(0, "f", 55), 2520);
  assert.equal(byId.hb_senior.eligible(76), false);
});

test("แถวสัญญาเพิ่มเติมบอกชัดว่าแบบไหนแนบไม่ได้ และอายุไหนแนบไม่ได้", () => {
  const cols = [
    {product:{plan:'lifetime_protection'}, capital:1000000},
    {product:{plan:'sabaijai_90_90'}, capital:500000},
  ];
  const rows = call("buildLifeAddonRows", cols, {age:55, gender:'m'});
  assert.ok(rows.length > 0);
  assert.match(rows[0][0], /เบี้ยแยกต่างหาก ไม่รวมในตัวเลขด้านบน/);
  const flat = JSON.stringify(rows);
  assert.match(flat, /แนบกับแบบนี้ไม่ได้/);
  // อายุ 76 ทั้ง PA และ HB ของวัยเก๋าแนบไม่ได้ ต้องขึ้นข้อความพร้อมช่วงอายุ
  const old = JSON.stringify(call("buildLifeAddonRows", cols, {age:76, gender:'m'}));
  assert.match(old, /อายุนี้แนบไม่ได้/);
  assert.match(old, /รับอายุ 50 – 75 ปี/);
});

test("หน้ารายการแผนมีปุ่มเปรียบเทียบทั้งกลุ่มประกันชีวิตและกลุ่มสุขภาพ", () => {
  assert.match(html, /compareModeToggleLife/);
  assert.match(html, /heading:'ประกันชีวิต \/ สัญญาหลัก'/);
  assert.match(html, /heading:'สัญญาเพิ่มเติมสุขภาพ \/ ชดเชยรายได้'/);
  assert.match(html, /\['compareModeToggle','compareModeToggleLife'\]/);
});

test("ภาพปกไลฟ์ไทม์ถูกต่อเข้าหน้าแผน และระบุที่มาว่าตรวจแล้ว", () => {
  assert.match(html, /lifetimeprotection: \{src:'\/public\/plan-covers\/lifetime-protection-9920\.jpg'/);
  assert.match(html, /ไม่มีเลขที่กรมธรรม์หรือข้อมูลผู้เอาประกันภัย/);
  assert.match(html, /images: \[PLAN_COVER_IMAGES\.lifetimeprotection\]/);
  // วัยเก๋ายังไม่มีไฟล์ปก จึงต้องไม่อ้างถึงภาพที่ไม่มีอยู่จริง
  assert.doesNotMatch(html, /plan-covers\/waigao/);
});

// เทสต์ถาวร: ผู้ช่วยจัดแผนต้องไม่เสนอสัญญาที่บริษัทไม่รับอายุนั้น
// บัคเดิมคือระบบใส่ D Health Lite แบบไม่มีส่วนแรกให้เด็กอายุ 5 ขวบ
// แล้วโชว์ยอดรวมที่ขาดค่าเบี้ยสัญญาสุขภาพหลักไปเงียบ ๆ ซึ่งเอาไปเสนอลูกค้าไม่ได้
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const ratesText = await readFile(new URL("../data/premium-rates.json", import.meta.url), "utf8");
const RATES = JSON.parse(ratesText);
const main = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)]
  .map((m) => m[1]).reduce((a, b) => (a.length > b.length ? a : b));

const noop = () => {};
function fakeEl() {
  return { value: "5m", textContent: "", innerHTML: "", checked: false, disabled: false,
    style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    options: [], selectedOptions: [{ textContent: "" }], dataset: {},
    appendChild: noop, addEventListener: noop, removeAttribute: noop, setAttribute: noop,
    querySelector: () => fakeEl(), querySelectorAll: () => [], closest: () => null,
    getAttribute: () => null, focus: noop, click: noop, remove: noop, insertAdjacentHTML: noop };
}
const doc = { getElementById: () => fakeEl(), querySelector: () => fakeEl(), querySelectorAll: () => [],
  createElement: () => fakeEl(), addEventListener: noop, body: fakeEl(), documentElement: fakeEl(), title: "", cookie: "" };
const sandbox = { RATES, Math, Number, String, Array, Object, JSON, Date, isNaN, parseFloat, parseInt,
  console, setTimeout, clearTimeout, setInterval, clearInterval, encodeURIComponent, decodeURIComponent,
  Intl, RegExp, Error, Promise, Set, Map, document: doc, navigator: { userAgent: "node" },
  location: { pathname: "/", search: "", href: "" }, history: { pushState: noop, replaceState: noop },
  fetch: () => Promise.reject(new Error("no network")),
  XMLHttpRequest: function () { this.open = noop; this.send = noop; this.responseText = ratesText; },
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  alert: noop, requestAnimationFrame: noop, matchMedia: () => ({ matches: false, addListener: noop }) };
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
try { vm.runInContext(main.replace(/const RATES = JSON\.parse\(ratesRequest\.responseText\);/, ""), sandbox); }
catch (e) { if (vm.runInContext("typeof advBuildResult", sandbox) === "undefined") throw e; }
const call = (n, ...a) => vm.runInContext(n, sandbox)(...a);

/* สมาร์ท อินเด็กซ์ 10/1 (Global): ข้อมูลจาก SmartWeb รหัสแบบ 266 และโบรชัวร์ลูกค้า */
test("เบี้ยชำระครั้งเดียวเท่ากับทุนพอดี ทุกเพศทุกอายุ 0-80 และไม่มีงวดย่อย", () => {
  const g = RATES.smart_index_10_1;
  assert.equal(g.rates.annual.m.length, 81);
  for (const a of [0, 35, 80]) for (const s of ["m", "f"]) assert.equal(call("mainPremiumAtEntry", "smart_index_10_1", 100000, s, a, "annual"), 100000);
  assert.equal(call("mainPremiumAtEntry", "smart_index_10_1", 100000, "m", 35, "monthly"), null);
  assert.equal(call("mainPremiumAtEntry", "smart_index_10_1", 40000, "m", 35, "annual"), null, "ต่ำกว่าทุนขั้นต่ำ 50,000");
  assert.equal(g.pr_rate_pct, 150); assert.equal(g.maturity_pct, 101); assert.equal(g.death_benefit_pct, 105);
});

test("ตัวอย่างโบรชัวร์ตรงสูตร และตารางในหน้าแผนแสดง IRR", () => {
  const g = RATES.smart_index_10_1;
  // 100,000 x 150% x (331.91/247.58 - 1) = 51,092
  assert.ok(Math.abs(100000 * 1.5 * (331.91 / 247.58 - 1) - 51092) < 1.5, "ดัชนีในโบรชัวร์ปัดทศนิยม 2 ตำแหน่ง");
  assert.deepEqual(g.brochure_examples.rows.map(r => r[2]), [101000, 152092, 194346]);
  const t = call("smartIndex101ExampleTable");
  assert.match(t, /152,092/); assert.match(t, /4\.28%/);
  const port = call("smartIndex101PortfolioSection");
  assert.match(port, /Solactive Multi-Strategy Investment Fund Index/);
  assert.match(port, /DNCA Invest – Alpha Bonds/);
  assert.match(port, /มุมมองหมอกึ๊ก/);
});

test("ลงทะเบียนครบ: เครื่องคำนวณ หน้าแผน เส้นทาง เทียบแผน โบรชัวร์", () => {
  assert.match(html, /name="mainPlan" value="smart_index_10_1"/);
  assert.match(html, /smartindex101: '\/plans\/smart-index-10-1'/);
  assert.match(html, /showPlanDetail\('smartindex101'\)/);
  assert.match(html, /smartindex101:        \[\{file:'smart-index-10-1\.pdf'/);
  assert.match(html, /'flexi9920','smartlink153','smartlink156','smartindex101'\]/);
  const p = vm.runInContext("PLAN_DETAILS.smartindex101", sandbox);
  assert.ok(p && p.detailSections && p.benefitTable && p.rateTable);
  assert.match(p.rateTable(), /100,000/);
});

test("15/6 มีปุ่มโบรชัวร์และหัวข้อพอร์ตลงทุน", () => {
  assert.match(html, /smartlink156:         \[\{file:'smart-index-15-6\.pdf'/);
  assert.match(html, /smartIndexPortfolioSection\(\),/);
  assert.match(call("smartIndexPortfolioSection"), /S&amp;P Multi-Asset Global Macro ESG Index/);
});

test("กราฟเทียบหุ้นโลก ใช้ตัวเลขรายปีจาก factsheet MSCI และโบรชัวร์ตรง ๆ", () => {
  const b = RATES.smart_index_10_1.benchmark;
  assert.deepEqual(b.years, [2020, 2021, 2022, 2023, 2024, 2025]);
  assert.deepEqual(b.series.msci_acwi.calendar_pct, [16.25, 18.54, -18.36, 22.20, 17.49, 22.34]);
  assert.deepEqual(b.series.msci_world.calendar_pct, [15.90, 21.82, -18.14, 23.79, 18.67, 21.09]);
  const d = call("si101Data");
  assert.equal(d.series[0].pct[2], 6.0);
  assert.ok(Math.abs(d.series[1].cum[6] - 197.61) < 0.02);
  const sec = call("smartIndex101CompareSection");
  assert.match(sec, /ดัชนีของแผนนี้ เทียบกับหุ้นโลก/);
  assert.match(sec, /stroke-dasharray="4 4"/);
  assert.match(sec, /onpointermove="siMove\('101',event\)"/);
  assert.match(sec, /เอื้อฝั่งหุ้น/);
});

test("15/6 มีกราฟเทียบหุ้นโลก 11 ปี จากข้อมูลรายปีของ S&P DJI", () => {
  const h = RATES.smart_index_15_6_pro.index_history;
  assert.deepEqual(h.calendar_pct, [4.31, 4.45, 5.47, 2.92, 13.71, 1.43, 9.52, -2.05, 3.70, 9.39, 3.94]);
  assert.equal(RATES.smart_index_10_1.benchmark.series.msci_acwi.calendar_pct_long.length, 11);
  const sec = call("smartIndex156CompareSection");
  assert.match(sec, /เทียบกับหุ้นโลก \(11 ปี\)/);
  assert.match(sec, /onpointermove="siMove\('156',event\)"/);
  assert.match(sec, /back-tested/);
  assert.match(html, /detailSections: \(\) => smartIndex156CompareSection\(\) \+ smartIndexPortfolioSection\(\)/);
  // ทั้งสองกราฟอยู่คนละหน้า แต่ id ต้องไม่ชนกัน
  assert.match(call("smartIndex101CompareSection"), /id="sic101Svg"/);
  assert.match(sec, /id="sic156Svg"/);
});

test("หน้าแผนทั้งหมด: เรียงกลุ่มตลอดชีพต่อกัน ป้ายประเภทตรงกัน และมีครบทุกแบบ", () => {
  const a = html.indexOf('<div id="page-plans"'), b = html.indexOf('<!-- ============ PAGE: HNW');
  const page = html.slice(a, b);
  const ids = [...page.matchAll(/showPlanDetail\('([a-z0-9_]+)'\)/g)].map(m => m[1]);
  const i = id => ids.indexOf(id);
  assert.equal(i('flexi9920') - i('flexi995'), 1, "เฟล็กซี่ 99/5 กับ 99/20 ต้องอยู่ติดกัน");
  assert.ok(i('main9999smart') > i('main997') && i('main9999') - i('main9999smart') === 1);
  for (const id of ['wholelife991cashback', 'wholelife991nocash', 'premierlegacy991']) assert.ok(ids.includes(id), id + " ต้องมีการ์ดในหน้าแผน");
  const pd = html.slice(html.indexOf('const PLAN_DETAILS = {'));
  const keys = [...pd.slice(0, 1200000).matchAll(/\n  ([a-z0-9_]+): \{\n    title:/g)].map(m => m[1]);
  assert.deepEqual(keys.filter(k => !ids.includes(k)), [], "ทุกแบบที่มีหน้ารายละเอียดต้องมีการ์ดในหน้าแผน");
  assert.doesNotMatch(page, /<div class="cat">ประกันชีวิตเพื่อวัยเกษียณ<\/div>/);
  assert.match(page, /<div class="cat">ประกันชีวิตตลอดชีพ · ชำระ 20 ปี · แปลงเป็นค่ารักษาได้<\/div>/);
});

test("เปรียบเทียบประกันสุขภาพมี H&S (N) อ่านวงเงินจากข้อมูลชุดเดียวกับหน้าแผน", () => {
  assert.match(html, /health: \{label:'สัญญาเพิ่มเติมสุขภาพและค่ารักษา', ids:\['dhl','ehp','maochai','ecp','hsn','careplus','opd'\]\}/);
  const i = html.indexOf("  hsn: {\n    title:'แยกค่าใช้จ่าย H&S (N)'");
  assert.ok(i > html.indexOf("const COMPARE_PRODUCTS = {"), "ต้องอยู่ใน COMPARE_PRODUCTS");
  const blk = html.slice(i, html.indexOf("  careplus: {", i));
  assert.match(blk, /const b = RATES\.hsn\.benefits/);
  assert.match(blk, /healthRiderPremium\(Object\.assign\(\{type:'hsn'\}, cfg\)/);
  for (const k of ["n1", "n2", "n3", "n4", "n6_1", "n6_2", "n7", "n12"]) assert.match(blk, new RegExp("\\b" + k + ":"));
});

test("ตารางเปรียบเทียบลากสลับคอลัมน์ได้ และหน้าที่มี state สลับลำดับใน array (การ์ดกับตารางสลับตามกัน)", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(src, /id="compareContent" data-reorder="compare"/);
  assert.match(src, /id="pensionCompareBox" data-reorder="pension"/);
  assert.match(src, /const COL_REORDER = \{/);
  assert.match(src, /\[compareSelected\[a\], compareSelected\[b\]\] = \[compareSelected\[b\], compareSelected\[a\]\]/);
  // ตารางบำนาญต้องไม่มีหัวคอลัมน์เกินจากแถวข้อมูล
  assert.doesNotMatch(src, /const headers = \['หัวข้อเปรียบเทียบ', \.\.\.cols/);
});

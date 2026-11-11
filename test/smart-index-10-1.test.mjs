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
  assert.match(html, /detailSections: \(\) => smartIndexPortfolioSection\(\)/);
  assert.match(call("smartIndexPortfolioSection"), /S&amp;P Multi-Asset Global Macro ESG Index/);
});

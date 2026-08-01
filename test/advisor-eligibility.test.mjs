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

const AGES = [0, 1, 5, 6, 10, 11, 15, 20, 30, 40, 50, 60, 65, 70, 71, 75, 80, 85, 87, 90];
const COMBOS = [];
for (const ipdNeed of ["basic", "balanced", "elite20", "elite75"])
  for (const opdNeed of ["none", "light", "moderate", "heavy"])
    for (const riskChoice of ["auto", "none", "deduct", "copay10", "copay20"])
      for (const ciStyle of ["none", "budget", "balanced", "broad"])
        COMBOS.push({ ipdNeed, opdNeed, riskChoice, ciStyle });

test("ทุกแพ็กเกจที่เสนอ ต้องมีเบี้ยครบทุกรายการ ไม่มีตัวไหนหาอัตราไม่เจอ", () => {
  const bad = [];
  for (const age of AGES) for (const gender of ["m", "f"]) for (const c of COMBOS) {
    const inp = { gender, birthYear: 2569 - age, age, budget: 60000, hasGroup: false, groupCoverage: 0, ciCapital: 1000000, ...c };
    const r = call("advBuildResult", inp);
    for (const p of r.packages) {
      if (p.missing && p.missing.length) bad.push(`อายุ ${age} ${gender} ${JSON.stringify(c)} → ${p.name} ขาด ${p.missing.join(",")}`);
      if (!isFinite(p.premium) || p.premium <= 0) bad.push(`อายุ ${age} ${gender} → ${p.name} เบี้ย ${p.premium}`);
    }
  }
  assert.equal(bad.length, 0, `พบแพ็กเกจที่เสนอไม่ได้ ${bad.length} ชุด\n` + bad.slice(0, 8).join("\n"));
});

test("เด็กอายุต่ำกว่า 11 ปี ต้องได้ D Health Lite แบบมีส่วนแรก และต้องแจ้งเหตุผล", () => {
  const inp = { gender: "m", birthYear: 2564, age: 5, budget: 60000, hasGroup: false, groupCoverage: 0,
    ipdNeed: "balanced", opdNeed: "light", riskChoice: "auto", ciCapital: 1000000, ciStyle: "balanced" };
  const r = call("advBuildResult", inp);
  const dhl = r.primary.items.find((i) => i.kind === "dhl");
  assert.ok(dhl, "ต้องมี D Health Lite ในแพ็กเกจ");
  assert.notEqual(dhl.deduct, "d0", "อายุ 5 ขวบไม่มีตารางแบบไม่มีส่วนแรก");
  assert.equal(r.primary.missing.length, 0);
  assert.ok(typeof dhl.premium === "number" && dhl.premium > 0, "สัญญาสุขภาพหลักต้องมีเบี้ยจริง ไม่ใช่ถูกข้ามไป");
  assert.ok(r.primary.why.some((w) => /ยังไม่มีตาราง D Health Lite แบบไม่มีความรับผิดส่วนแรก/.test(w)),
    "ต้องบอกเหตุผลที่ต้องมีส่วนแรก ไม่ใช่เปลี่ยนเงียบ ๆ");
  // OPD เริ่มอายุ 6 ปี เด็ก 5 ขวบต้องไม่มี OPD และต้องเตือน
  assert.ok(!r.primary.items.some((i) => i.kind === "opd_mao" || i.kind === "opd_krang"));
  assert.ok(r.primary.warnings.some((w) => /OPD เริ่มรับที่อายุ 6 ปี/.test(w)));
});

test("อายุเกิน 70 ปี ต้องเปลี่ยนสัญญาหลักเป็น 99/99 เพราะ 99/20 รับถึงอายุ 70", () => {
  for (const age of [71, 75, 80, 85, 90]) {
    const inp = { gender: "m", birthYear: 2569 - age, age, budget: 200000, hasGroup: false, groupCoverage: 0,
      ipdNeed: "balanced", opdNeed: "none", riskChoice: "auto", ciCapital: 1000000, ciStyle: "none" };
    const r = call("advBuildResult", inp);
    const m = r.primary.items.find((i) => i.kind === "main");
    assert.ok(m, `อายุ ${age} ต้องยังมีสัญญาหลัก`);
    assert.equal(m.plan, "99_99", `อายุ ${age} ต้องใช้ 99/99 ไม่ใช่ 99/20`);
    assert.equal(r.primary.missing.length, 0, `อายุ ${age} ต้องไม่มีรายการที่หาเบี้ยไม่เจอ`);
  }
});

test("เลือก Elite ให้เด็กที่บริษัทไม่รับ ต้องถอยมา D Health Lite และเตือนตัวแทน", () => {
  const inp = { gender: "f", birthYear: 2566, age: 3, budget: 200000, hasGroup: false, groupCoverage: 0,
    ipdNeed: "elite20", opdNeed: "none", riskChoice: "auto", ciCapital: 1000000, ciStyle: "balanced" };
  const r = call("advBuildResult", inp);
  assert.ok(!r.primary.items.some((i) => i.kind === "ehp"), "อายุ 3 ขวบต้องไม่ได้ Elite");
  assert.ok(r.primary.items.some((i) => i.kind === "dhl"));
  assert.equal(r.primary.missing.length, 0);
  assert.ok(r.primary.warnings.some((w) => /ไม่รับอายุ 3 ปีสำหรับแบบนั้น/.test(w)));
});

test("วงเงิน 1 ล้าน ต้องไม่ถูกจับคู่กับส่วนแรกที่ไม่มีในตาราง", () => {
  // ตาราง 1 ล้านมีเฉพาะ 0 / 20,000 / 50,000 ไม่มี 30,000 และ 100,000
  for (const cov of [0, 30000, 50000, 100000, 300000]) {
    for (const age of [5, 12, 40, 70]) {
      const inp = { gender: "m", birthYear: 2569 - age, age, budget: 60000, hasGroup: cov > 0, groupCoverage: cov,
        ipdNeed: "basic", opdNeed: "none", riskChoice: "deduct", ciCapital: 500000, ciStyle: "budget" };
      const dhl = call("advDhlAnchor", inp);
      assert.equal(dhl.sum, "1m");
      assert.ok(["d0", "d20k", "d50k"].includes(dhl.deduct),
        `อายุ ${age} สวัสดิการ ${cov} ได้ส่วนแรก ${dhl.deduct} ซึ่งไม่มีในตารางวงเงิน 1 ล้าน`);
      assert.ok(typeof call("premiumOfItem", dhl, "m", age) === "number",
        `อายุ ${age} สวัสดิการ ${cov} ตีราคา D Health Lite 1 ล้านไม่ได้`);
    }
  }
  // วงเงิน 5 ล้านต้องเลือกจากชุดของตัวเองเช่นกัน
  for (const age of [5, 12, 40, 70]) {
    const inp = { gender: "f", birthYear: 2569 - age, age, budget: 60000, hasGroup: true, groupCoverage: 100000,
      ipdNeed: "balanced", opdNeed: "none", riskChoice: "deduct", ciCapital: 500000, ciStyle: "budget" };
    const dhl = call("advDhlAnchor", inp);
    assert.equal(dhl.sum, "5m");
    assert.ok(["d0", "d30k", "d50k", "d100k"].includes(dhl.deduct));
    assert.ok(typeof call("premiumOfItem", dhl, "f", age) === "number");
  }
});

test("การ์ดที่ยังหาเบี้ยไม่ครบ ต้องไม่โชว์ยอดรวมให้เอาไปเสนอลูกค้า", () => {
  assert.match(html, /ยังเสนอราคาชุดนี้ไม่ได้/);
  assert.match(html, /ยอดรวมจะขาดรายการเหล่านี้ไป จึงไม่แสดงตัวเลข/);
});

test("ตารางที่ไม่มีอยู่จริง ต้องคืนค่าว่าง ไม่ใช่ทำให้ทั้งหน้าพัง", () => {
  assert.equal(call("rateAtStart", undefined, 30, 0), null);
  assert.equal(call("rateAtStart", null, 30, 11), null);
  // เหมาจ่าย Extra มีเฉพาะแผน 1-3 แผน 4 ต้องคืนค่าว่างแบบไม่ throw
  const r = call("healthRiderPremium", { type: "maochai", plan: "p4" }, "m", 30, "1", "annual");
  assert.equal(r.premium, null);
});

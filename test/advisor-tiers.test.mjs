// เทสต์ผู้ช่วยจัดแผนสุขภาพ ต้องเสนอสามระดับเสมอ คือ ข้อเสนอหลัก ดีกว่า และประหยัด
// รันสคริปต์จริงทั้งก้อนจาก index.html ใน sandbox ที่ stub DOM ไว้
// เพื่อให้ทดสอบ advBuildResult ตัวจริง ไม่ใช่ตัวจำลอง
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const ratesText = await readFile(new URL("../data/premium-rates.json", import.meta.url), "utf8");
const RATES = JSON.parse(ratesText);

const scripts = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const main = scripts.reduce((a, b) => (a.length > b.length ? a : b));

const noop = () => {};
function fakeEl() {
  const el = {
    value: "5m", textContent: "", innerHTML: "", checked: false, disabled: false,
    style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    options: [], selectedOptions: [{ textContent: "" }], dataset: {},
    appendChild: noop, addEventListener: noop, removeAttribute: noop, setAttribute: noop,
    querySelector: () => fakeEl(), querySelectorAll: () => [], closest: () => null,
    getAttribute: () => null, focus: noop, click: noop, remove: noop, insertAdjacentHTML: noop,
  };
  return el;
}
const doc = {
  getElementById: () => fakeEl(), querySelector: () => fakeEl(), querySelectorAll: () => [],
  createElement: () => fakeEl(), addEventListener: noop, body: fakeEl(),
  documentElement: fakeEl(), title: "", cookie: "",
};
const sandbox = {
  RATES, Math, Number, String, Array, Object, JSON, Date, isNaN, parseFloat, parseInt,
  console, setTimeout, clearTimeout, setInterval, clearInterval, encodeURIComponent,
  decodeURIComponent, Intl, RegExp, Error, Promise, Set, Map,
  document: doc, navigator: { userAgent: "node" }, location: { pathname: "/", search: "", href: "" },
  history: { pushState: noop, replaceState: noop }, fetch: () => Promise.reject(new Error("no network")),
  XMLHttpRequest: function () { this.open = noop; this.send = noop; this.responseText = ratesText; },
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  alert: noop, requestAnimationFrame: noop, matchMedia: () => ({ matches: false, addListener: noop }),
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
// ตัดบรรทัดที่อ่านไฟล์อัตราเบี้ยออก เพราะฉีด RATES เข้าไปแล้ว
const src = main.replace(/const RATES = JSON\.parse\(ratesRequest\.responseText\);/, "");
try {
  vm.runInContext(src, sandbox);
} catch (e) {
  // สคริปต์มีคำสั่ง bootstrap ที่ต้องใช้ DOM จริงตอนท้ายไฟล์
  // ถ้าล้มตรงนั้นไม่เป็นไร ขอแค่ประกาศฟังก์ชันครบก่อน แต่ต้องพิสูจน์ว่าครบจริง
  if (typeof vm.runInContext("typeof advBuildResult", sandbox) === "undefined") throw e;
}
assert.equal(vm.runInContext("typeof advBuildResult", sandbox), "function",
  "โหลดสคริปต์แล้วต้องมี advBuildResult ให้ทดสอบจริง");

const call = (name, ...a) => vm.runInContext(name, sandbox)(...a);
const base = {
  gender: "m", birthYear: 2529, age: 40, budget: 50000,
  hasGroup: false, groupCoverage: 0,
  ipdNeed: "balanced", opdNeed: "light", riskChoice: "auto",
  ciCapital: 1000000, ciStyle: "balanced",
};

test("เคสหน้าจอจริง ชาย 40 งบ 50,000 ต้องได้ครบสามระดับ", () => {
  const r = call("advBuildResult", base);
  const tiers = r.packages.map(p => p.tier);
  assert.ok(tiers.includes("primary"), "ต้องมีข้อเสนอหลัก");
  assert.ok(tiers.includes("upgrade"), "ต้องมีทางเลือกดีกว่า");
  assert.ok(tiers.includes("economy"), "ต้องมีทางเลือกประหยัด");
  const up = r.packages.find(p => p.tier === "upgrade");
  const eco = r.packages.find(p => p.tier === "economy");
  assert.ok(up.premium > r.primary.premium, "ทางเลือกดีกว่าต้องแพงกว่าข้อเสนอหลักจริง");
  assert.ok(eco.premium < r.primary.premium, "ทางเลือกประหยัดต้องถูกกว่าข้อเสนอหลักจริง");
  assert.ok(up.premium <= base.budget * 1.25 + 1, `ทางเลือกดีกว่าต้องไม่เกินงบ 25% แต่ได้ ${up.premium}`);
  assert.equal(r.primary.recommended, true);
  assert.equal(up.recommended, false, "ทางเลือกดีกว่าต้องไม่ถูกตั้งเป็นข้อเสนอแรก");
});

test("ทุกแพ็กเกจต้องมีเบี้ยจริงจากตาราง ไม่มีรายการที่หาเบี้ยไม่เจอ", () => {
  for (const b of [
    base,
    { ...base, budget: 30000 },
    { ...base, budget: 120000 },
    { ...base, age: 25, budget: 40000 },
    { ...base, age: 60, budget: 90000 },
    { ...base, gender: "f", age: 35, budget: 60000 },
    { ...base, riskChoice: "none", budget: 45000 },
    { ...base, hasGroup: true, groupCoverage: 100000, budget: 45000 },
    { ...base, ipdNeed: "elite20", budget: 150000 },
    { ...base, opdNeed: "none", ciStyle: "none", budget: 35000 },
  ]) {
    const r = call("advBuildResult", b);
    for (const p of r.packages) {
      assert.equal(p.missing.length, 0, `${p.name} มีรายการที่หาเบี้ยไม่เจอ`);
      assert.ok(p.premium > 0, `${p.name} เบี้ยเป็นศูนย์`);
      const sum = p.items.reduce((t, it) => t + (it.premium || 0), 0);
      assert.ok(Math.abs(sum - p.premium) < 1, `${p.name} ผลรวมรายการไม่ตรงกับเบี้ยรวม`);
    }
    const up = r.packages.find(p => p.tier === "upgrade");
    if (up) assert.ok(up.premium <= b.budget * 1.25 + 1, "ทางเลือกดีกว่าเกินเพดาน 25%");
    const eco = r.packages.find(p => p.tier === "economy");
    if (eco) assert.ok(eco.premium < r.primary.premium, "ทางเลือกประหยัดไม่ได้ถูกกว่าจริง");
  }
});

test("ทางเลือกประหยัดต้องผ่อนเกณฑ์ตามลำดับที่ตกลงไว้ และไม่ใส่ส่วนแรกเกิน 30,000 ถ้าไม่มีสวัสดิการเดิม", () => {
  // งบต่ำมาก บังคับให้ไล่บันไดจนถึงขั้นใส่ Deductible
  const r = call("advBuildResult", { ...base, budget: 22000 });
  const eco = r.packages.find(p => p.tier === "economy");
  assert.ok(eco, "ต้องมีทางเลือกประหยัด");
  const dhl = eco.items.find(i => i.kind === "dhl");
  if (dhl && dhl.deduct && dhl.deduct !== "d0") {
    assert.ok(["d30k"].includes(dhl.deduct),
      `ไม่มีสวัสดิการเดิม ส่วนแรกต้องไม่เกิน 30,000 แต่ได้ ${dhl.deduct}`);
  }
  // ถ้ามีสวัสดิการเดิม 100,000 ระบบจับส่วนแรกให้พอดีได้
  const r2 = call("advBuildResult", { ...base, hasGroup: true, groupCoverage: 100000, budget: 22000 });
  const eco2 = r2.packages.find(p => p.tier === "economy");
  const dhl2 = eco2 && eco2.items.find(i => i.kind === "dhl");
  if (dhl2 && dhl2.deduct && dhl2.deduct !== "d0") {
    assert.ok(["d30k", "d50k", "d100k"].includes(dhl2.deduct));
  }
});

test("ถ้าลูกค้าบอกว่าไม่เอาส่วนแรก ทางเลือกประหยัดที่ใส่ส่วนแรกต้องติดธงและมีคำเตือน", () => {
  const r = call("advBuildResult", { ...base, riskChoice: "none", budget: 20000 });
  const eco = r.packages.find(p => p.tier === "economy");
  if (eco) {
    const hasDeduct = eco.items.some(i => i.kind === "dhl" && i.deduct && i.deduct !== "d0");
    if (hasDeduct) {
      assert.equal(eco.conflictsStated, true, "ต้องติดธงว่าขัดกับที่ลูกค้าแจ้ง");
      assert.ok(eco.warnings.some(w => /ขัดกับที่ลูกค้าบอก/.test(w)));
    }
  }
});

test("ไม่ระบุงบ ต้องไม่เดาทางเลือกดีกว่า เพราะไม่มีเพดานให้ยึด", () => {
  const r = call("advBuildResult", { ...base, budget: 0 });
  assert.ok(!r.packages.some(p => p.tier === "upgrade"), "ไม่มีงบแล้วไม่ควรมีทางเลือกดีกว่า");
});

test("ป้ายบนการ์ดต้องแยกสามระดับให้เห็นชัด", () => {
  assert.match(html, /adv-badge-up/);
  assert.match(html, /adv-badge-eco/);
  assert.match(html, /ดีกว่า จ่ายเพิ่ม/);
  assert.match(html, /ประหยัดกว่า/);
  assert.match(html, /const ADV_UPGRADE_TOLERANCE = 1\.25;/);
});

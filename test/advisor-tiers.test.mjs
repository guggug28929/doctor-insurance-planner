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
  const ups = r.packages.filter(p => p.tier === "upgrade");
  const eco = r.packages.find(p => p.tier === "economy");
  assert.ok(ups.length >= 1);
  for (const up of ups) {
    assert.ok(up.premium > r.primary.premium, "ทางเลือกดีกว่าต้องแพงกว่าข้อเสนอหลักจริง");
    assert.ok(up.premium <= base.budget * 1.25 + 1, `ทางเลือกดีกว่าต้องไม่เกินงบ 25% แต่ได้ ${up.premium}`);
    assert.equal(up.recommended, false, "ทางเลือกดีกว่าต้องไม่ถูกตั้งเป็นข้อเสนอแรก");
  }
  assert.ok(eco.premium < r.primary.premium, "ทางเลือกประหยัดต้องถูกกว่าข้อเสนอหลักจริง");
  assert.equal(r.primary.recommended, true);
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
    for (const up of r.packages.filter(p => p.tier === "upgrade"))
      assert.ok(up.premium <= b.budget * 1.25 + 1, "ทางเลือกดีกว่าเกินเพดาน 25%");
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

test("ข้อเสนอหลักต้องไม่ไต่ข้ามระดับที่ลูกค้าเลือกเอง แต่ขยับ D Health Lite 1 ล้านเป็น 5 ล้านได้", () => {
  // งบถึง: ลูกค้าเลือกวงเงินเริ่มต้น ต้องได้ 5 ล้าน ไม่ใช่กระโดดไป Elite
  const rich = call("advBuildResult", { ...base, ipdNeed: "basic", budget: 60000 });
  const h = rich.primary.items.find((i) => i.kind === "dhl");
  assert.ok(h, "ข้อเสนอหลักต้องยังเป็น D Health Lite ไม่ใช่ Elite");
  assert.equal(h.sum, "5m", "งบถึงแล้วต้องขยับเป็น 5 ล้าน");
  assert.ok(!rich.primary.items.some((i) => i.kind === "ehp"), "ห้ามกระโดดไป Elite เอง");
  assert.ok(rich.primary.why.some((w) => /ระบบจึงขยับวงเงินให้/.test(w)), "ต้องบอกว่าขยับวงเงินให้เพราะอะไร");
  // Elite ต้องไปโผล่ในการ์ดดีกว่า เพื่อให้ลูกค้าเลือกเองว่าจะจ่ายเพิ่มไหม
  const ups = rich.packages.filter((p) => p.tier === "upgrade");
  assert.ok(ups.length >= 2, "ควรมีทางเลือกดีกว่าหลายทาง ให้ตัวแทนหยิบใบที่ตรงกับลูกค้า");
  assert.ok(ups.some((p) => p.items.some((i) => i.kind === "ehp")), "Elite ต้องอยู่ในทางเลือกดีกว่าใบใดใบหนึ่ง");
  assert.ok(ups.some((p) => p.raisedSum), "ใบที่เพิ่มวงเงินต้องติดธง raisedSum ไว้แนบบทความ");

  // งบไม่ถึง: ต้องคงวงเงิน 1 ล้านตามที่ลูกค้าเลือก ไม่ดันขึ้นแล้วไปตัดของอื่นทิ้ง
  const tight = call("advBuildResult", { ...base, ipdNeed: "basic", budget: 25000 });
  assert.equal(tight.primary.items.find((i) => i.kind === "dhl").sum, "1m");

  // เลือก Elite 20 พร้อมงบมหาศาล ก็ต้องได้ Elite 20 ไม่ใช่ Elite 100
  const elite = call("advBuildResult", { ...base, ipdNeed: "elite20", budget: 300000 });
  assert.equal(elite.primary.items.find((i) => i.kind === "ehp").plan, "20m");
  const eliteUps = elite.packages.filter((p) => p.tier === "upgrade");
  assert.ok(eliteUps.some((p) => { const e = p.items.find((i) => i.kind === "ehp"); return e && ["75m","100m"].includes(e.plan); }),
    "ต้องมีทางเลือกที่ขยับขึ้น Elite ระดับสูงกว่า");
});

test("ทางเลือกประหยัดต้องยังมีให้ แม้ข้อเสนอหลักจะต่ำกว่างบอยู่แล้ว", () => {
  const r = call("advBuildResult", { ...base, budget: 120000 });
  const eco = r.packages.find((p) => p.tier === "economy");
  assert.ok(eco, "งบเหลือเยอะก็ยังต้องมีทางเลือกประหยัดให้เทียบ");
  assert.ok(eco.premium < r.primary.premium * 0.95, "ต้องถูกกว่าข้อเสนอหลักอย่างมีนัยสำคัญ");
});

test("การ์ดที่เพิ่มวงเงิน ต้องมีบทความอธิบายว่าทำไมถึงควรเลือกวงเงินสูงกว่า", () => {
  assert.match(html, /ทำไมควรเลือกวงเงินเหมาจ่ายสูงกว่าที่ลูกค้าคิดไว้/);
  assert.match(html, /เพิ่มวงเงินทีหลังไม่ได้ง่ายเหมือนตอนสมัครครั้งแรก/);
  assert.match(html, /ส่วนต่างเบี้ยมักน้อยกว่าที่ลูกค้าคิด/);
  assert.match(html, /โรคที่ทำให้ล้มละลายคือโรคที่วงเงินน้อยเอาไม่อยู่/);
  assert.match(html, /ไม่ใช่อัตราที่บริษัทหรือหน่วยงานใดประกาศ/);
  assert.match(html, /pkg\.raisedSum \? whyHigherSumHtml/);
});

test("ทางเลือกดีกว่ามีได้หลายทาง และแต่ละทางต้องต่างกันจริง", () => {
  for (const budget of [40000, 60000, 90000, 150000]) {
    const r = call("advBuildResult", { ...base, budget });
    const ups = r.packages.filter((p) => p.tier === "upgrade");
    const keys = ups.map((p) => p.items.map((i) => JSON.stringify(i)).sort().join("|"));
    assert.equal(new Set(keys).size, keys.length, `งบ ${budget} มีทางเลือกดีกว่าที่ซ้ำกัน`);
    for (const p of ups) assert.equal(p.missing.length, 0);
  }
});

test("การ์ดต้องย่อคำอธิบาย และมีหน้าต่างรายละเอียดเต็มจอให้กดดู", () => {
  // การ์ดโชว์แค่สามบรรทัดแรก ที่เหลือไปอยู่ในหน้าต่าง
  assert.match(html, /const head = why\.slice\(0, 3\);/);
  assert.match(html, /ยังมีเหตุผลและข้อควรระวังอีก/);
  assert.match(html, /onclick="openPkgModal\(\$\{idx\}\)"/);
  // หน้าต่างต้องมีครบ ชื่อแผน รายการ เหตุผล และปิดได้หลายทาง
  assert.match(html, /function openPkgModal\(idx\)/);
  assert.match(html, /function closePkgModal\(\)/);
  assert.match(html, /pkg-modal-backdrop" onclick="closePkgModal\(\)/);
  assert.match(html, /if\(e\.key === 'Escape'\) closePkgModal\(\)/);
  assert.match(html, /setAttribute\('aria-modal','true'\)/);
  // ฉากหลังต้องเบลอ และล็อกไม่ให้หน้าหลังเลื่อน
  assert.match(html, /backdrop-filter:blur\(6px\)/);
  assert.match(html, /body\.pkg-modal-open\{overflow:hidden;\}/);
  // บทความเหตุผลวงเงินสูงย้ายไปอยู่ในหน้าต่างแล้ว ไม่ยืดบนการ์ด
  assert.match(html, /\$\{pkg\.raisedSum \? whyHigherSumHtml\(input\.age \|\| 40\) : ''\}/);
});

test("รายการสัญญาหลักต้องอยู่ในกรอบเลื่อน และแบบที่ใช้บ่อยอยู่บนสุด", () => {
  assert.match(html, /<div class="plan-scroll">/);
  assert.match(html, /\.plan-scroll\{[\s\S]*?max-height:300px;[\s\S]*?overflow-y:auto;/);
  assert.match(html, /<div class="plan-group-label">ใช้บ่อยที่สุด<\/div>/);
  // สามแบบแรกต้องเป็น 99/20 99/99 99/7 ตามลำดับ
  const order = [...html.matchAll(/name="mainPlan" value="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order.slice(0, 3), ["99_20", "99_99", "99_7"]);
  // ต้องมีหัวข้อกลุ่มครบทุกก้อน เพื่อให้กวาดตาหาได้เร็ว
  for (const g of ["แบบตลอดชีพและชั่วระยะเวลาอื่น", "เพื่อผู้สูงอายุ ไม่ต้องตอบคำถามสุขภาพ", "กลุ่มทุนสูง HNW และชำระครั้งเดียว", "บำนาญ"]) {
    assert.ok(html.includes(`<div class="plan-group-label">${g}</div>`), `ขาดหัวข้อกลุ่ม ${g}`);
  }
});

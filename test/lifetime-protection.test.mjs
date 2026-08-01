// เทสต์ เมืองไทย ไลฟ์ไทม์ โพรเทคชั่น (โครงการเมืองไทย ยิ้มสู้โรคร้าย)
// สัญญาหลักที่รวมความคุ้มครองโรคร้ายแรง 15 โรคไว้ในตัว ชำระ 20 ปี คุ้มครองถึงอายุ 99
// แหล่งข้อมูล: SmartWeb id 35 + เอกสาร lifetimeprotection_premium.pdf (22.11.67)
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const RATES = JSON.parse(
  await readFile(new URL("../data/premium-rates.json", import.meta.url), "utf8")
);

function extract(marker) {
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, `ไม่พบ ${marker} ใน index.html`);
  let depth = 0;
  for (let i = html.indexOf("{", start); i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error(`วงเล็บไม่ครบสำหรับ ${marker}`);
}

const sandbox = { RATES, Math };
vm.createContext(sandbox);
vm.runInContext(
  [
    extract("function rateAtStart("),
    extract("function lifetimeProtectionPremium("),
    extract("function lifetimeWpRiderPremium("),
  ].join("\n"),
  sandbox
);
const premium = (...a) => vm.runInContext("lifetimeProtectionPremium", sandbox)(...a);
const wpPremium = (...a) => vm.runInContext("lifetimeWpRiderPremium", sandbox)(...a);
const G = RATES.lifetime_protection;

test("ข้อมูลครบและช่วงอายุตรงกับที่บริษัทประกาศ", () => {
  assert.equal(G.product_name, "เมืองไทย ไลฟ์ไทม์ โพรเทคชั่น");
  assert.equal(G.campaign_name, "โครงการเมืองไทย ยิ้มสู้โรคร้าย");
  assert.deepEqual(G.entry_age_range, [1, 65]);
  assert.equal(G.premium_paying_years, 20);
  assert.equal(G.coverage_to_age, 99);
  assert.equal(G.capital_min, 150000);
  for (const freq of ["annual", "half", "quarter", "monthly"]) {
    for (const sex of ["m", "f"]) {
      assert.equal(G.rates[freq][sex].length, 65);
      assert.ok(G.rates[freq][sex].every((v) => typeof v === "number" && v > 0));
    }
  }
});

test("ค่าหัวและท้ายตารางตรงกับเอกสารทางการ", () => {
  // ต่อทุน 1,000 บาท จึงคิดที่ทุน 1,000,000 = อัตรา x 1000
  assert.equal(premium(1000000, "m", 1, "annual"), 19070);
  assert.equal(premium(1000000, "f", 1, "annual"), 18060);
  assert.equal(premium(1000000, "m", 65, "annual"), 109300);
  assert.equal(premium(1000000, "f", 65, "annual"), 84250);
  // งวดอื่นอ่านจากตารางที่พิมพ์จริง ไม่ได้คูณเอง
  assert.equal(premium(1000000, "m", 1, "half"), 9920);
  assert.equal(premium(1000000, "m", 1, "quarter"), 5150);
  assert.equal(premium(1000000, "m", 1, "monthly"), 1716);
  assert.equal(premium(1000000, "f", 65, "monthly"), 7583);
});

test("คอลัมน์รายงวดตรงกับสูตรที่เอกสารระบุเอง ครบทุกช่อง", () => {
  const F = { half: [0.52, 2], quarter: [0.27, 2], monthly: [0.09, 3] };
  assert.deepEqual(G.instalment_factors, { half: 0.52, quarter: 0.27, monthly: 0.09 });
  for (const sex of ["m", "f"]) {
    G.rates.annual[sex].forEach((a, i) => {
      for (const [k, [f, dp]] of Object.entries(F)) {
        const printed = G.rates[k][sex][i];
        assert.ok(
          Math.abs(printed - a * f) <= 0.5 / Math.pow(10, dp) + 1e-9,
          `${sex} อายุ ${i + 1} ${k}: พิมพ์ ${printed} แต่ ${a} x ${f} = ${a * f}`
        );
      }
    });
  }
});

test("ขอบอายุและทุนขั้นต่ำปิดสนิท", () => {
  for (const sex of ["m", "f"]) {
    assert.equal(premium(1000000, sex, 0, "annual"), null);
    assert.equal(premium(1000000, sex, 66, "annual"), null);
    assert.ok(premium(1000000, sex, 65, "annual") > 0);
    assert.ok(premium(1000000, sex, 1, "annual") > 0);
  }
  assert.equal(premium(149999, "m", 35, "annual"), null);
  assert.ok(premium(150000, "m", 35, "annual") > 0);
  assert.equal(premium(1000000, "m", 35, "semiannual"), null);
});

test("หญิงถูกกว่าชายและเบี้ยเพิ่มตามอายุทุกช่วง", () => {
  for (let age = 1; age <= 65; age++) {
    assert.ok(
      premium(1000000, "f", age, "annual") < premium(1000000, "m", age, "annual"),
      `อายุ ${age}`
    );
  }
  for (const sex of ["m", "f"]) {
    for (let age = 1; age < 65; age++) {
      assert.ok(
        premium(1000000, sex, age, "annual") < premium(1000000, sex, age + 1, "annual"),
        `${sex} อายุ ${age}`
      );
    }
  }
});

test("ตารางโรคร้ายแรงถูกต้องครบ 15 โรค และร้อยละไม่เคลื่อน", () => {
  assert.equal(G.ci_count, 15);
  assert.equal(G.ci_table_a.length, 13);
  assert.equal(G.ci_table_b.length, 2);
  const pcts = G.ci_table_a.map((x) => x.pct);
  assert.equal(pcts.filter((p) => p === 150).length, 4);
  assert.equal(pcts.filter((p) => p === 100).length, 8);
  assert.equal(pcts.filter((p) => p === 50).length, 1);
  const by = (name) => G.ci_table_a.find((x) => x.disease.includes(name));
  // จุดที่เอกสาร PDF อ่านจากตำแหน่งแล้วเคลื่อน ต้องตรงกับหน้าข้อมูลผลิตภัณฑ์
  assert.equal(by("Open heart surgery)").pct, 100);
  assert.equal(by("Major stroke").pct, 100);
  assert.equal(by("Cerebral aneurysm").pct, 50);
  assert.equal(by("Severe cancer").pct, 150);
  assert.equal(by("Terminal illness").pct, 150);
  // ตาราง (ข) มีเพดานเป็นตัวเงิน ซึ่ง PDF ไม่ได้ระบุ
  for (const row of G.ci_table_b) {
    assert.equal(row.pct, 25);
    assert.equal(row.cap_baht, 500000);
  }
});

test("กติกาการเคลมถูกบันทึกไว้ ไม่ปล่อยให้เข้าใจว่า 200% ได้ทุกเคส", () => {
  assert.match(G.ci_rules.table_a_once, /เพียงรายการเดียวเท่านั้น/);
  assert.match(G.ci_rules.table_a_once, /สิ้นสุดผลบังคับ/);
  assert.match(G.ci_rules.max_200_pct_path, /ไม่ใช่ผลประโยชน์ที่ทุกเคสจะได้รับ/);
  assert.match(G.ci_rules.table_b_once_each, /ยังคงมีผลบังคับอยู่/);
});

test("ระยะเวลาที่ไม่คุ้มครองและข้อยกเว้น ยืนยันจากเล่มกรมธรรม์ฉบับจริง", () => {
  assert.equal(G.waiting_period_days, 90);
  assert.match(G.waiting_period_note, /ยืนยันจากเล่มกรมธรรม์ฉบับจริงแล้ว/);
  assert.match(G.waiting_period_note, /แล้วแต่กรณีใดจะเกิดขึ้นหลังสุด/);
  assert.equal(G.exclusions.length, 2);
  assert.match(G.exclusions[0], /ภายใน 90 วัน/);
  assert.match(G.exclusions[1], /AIDS and HIV/);
  assert.match(G.exclusions_note, /มีเพียง 2 ข้อ/);
  assert.equal(G.annual_discount_per_1000, null);
  assert.match(G.annual_discount_note, /ระบุตรงว่า อัตราส่วนลดเบี้ยประกันภัย: ไม่มี/);
  assert.match(html, /ระยะเวลาที่ไม่คุ้มครอง 90 วัน/);
  assert.match(html, /มีเพียง 2 ข้อ/);
});

test("กำหนดเวลาเรียกร้องสินไหมถูกบันทึกไว้ใช้งานจริง", () => {
  const c = G.claim_rules;
  assert.equal(c.notify_within_days, 60);
  assert.equal(c.documents_within_days, 180);
  assert.match(c.notify_from, /วินิจฉัยโรคร้ายแรงครั้งแรก/);
  assert.match(c.notify_note, /ไม่ทำให้สิทธิเรียกร้องใด ๆ เสียไป/);
  assert.match(c.hiv_test, /HIV/);
  assert.match(c.refusal_if_no_consent, /ปฏิเสธการให้ความคุ้มครองได้/);
  assert.match(html, /ภายใน 60 วัน/);
  assert.match(html, /ไม่เกิน 180 วัน/);
});

test("ไม่มีข้อมูลส่วนบุคคลของผู้เอาประกันภัยหลุดเข้าไฟล์ข้อมูลหรือหน้าเว็บ", async () => {
  // เล่มกรมธรรม์ที่ใช้ยืนยันมีเลขที่กรมธรรม์และตารางมูลค่าเวนคืนซึ่งเป็นข้อมูลเฉพาะบุคคล
  const raw = await readFile(new URL("../data/premium-rates.json", import.meta.url), "utf8");
  for (const src of [raw, html]) {
    assert.doesNotMatch(src, /23496534/);
    assert.doesNotMatch(src, /กรมธรรม์เลขที่/);
  }
  assert.equal(G.surrender_value_table, undefined);
});

test("สัญญาเพิ่มเติมยกเว้นเบี้ยกรณีทุพพลภาพ แยกตารางและแยกช่วงอายุ", () => {
  const w = G.wp_rider;
  assert.deepEqual(w.entry_age_range, [15, 59]);
  assert.equal(G.rates_exclude_wp_rider, true);
  for (const freq of ["annual", "half", "quarter", "monthly"]) {
    for (const sex of ["m", "f"]) assert.equal(w.rates[freq][sex].length, 45);
  }
  assert.equal(wpPremium(1000000, "m", 15, "annual"), 310);
  assert.equal(wpPremium(1000000, "f", 59, "annual"), 5150);
  assert.equal(wpPremium(1000000, "m", 14, "annual"), null);
  assert.equal(wpPremium(1000000, "m", 60, "annual"), null);
  // เบี้ย WP ต้องน้อยกว่าเบี้ยสัญญาหลักมาก มิฉะนั้นแปลว่าหยิบตารางผิด
  assert.ok(wpPremium(1000000, "m", 40, "annual") < premium(1000000, "m", 40, "annual") / 10);
});

test("เพดานทุนสองชั้นถูกบันทึกแยกกัน", () => {
  assert.equal(G.capital_max_this_product["1-15"], 3000000);
  assert.equal(G.capital_max_this_product["16-65"], 5000000);
  assert.equal(G.capital_max_with_other_ci_riders["1-15"], 5000000);
  assert.equal(G.capital_max_with_other_ci_riders["16-65"], 20000000);
});

test("หน้าเว็บมีป้ายจุดเด่นตามที่กำหนด และเตือนเรื่อง 200% กับความคุ้มค่า", () => {
  assert.match(html, /lifetimeprotection: '\/plans\/lifetime-protection'/);
  assert.match(html, /showPlanDetail\('lifetimeprotection'\)/);
  assert.match(html, /คุ้มครองโรคร้ายแรง เจอจ่ายเงินก้อน 15 โรคร้ายแรง · เบี้ยคงที่/);
  assert.match(html, /รวมสูงสุด 200% ต้องเข้าใจให้ตรง/);
  assert.match(html, /ชายอายุ 55 ปีขึ้นไป/);
  assert.match(html, /หญิงอายุ 63 ปีขึ้นไป/);
  assert.match(html, /ยืนยันจากเล่มกรมธรรม์ฉบับจริง/);
});

test("ตัวเลขความคุ้มค่าที่เขียนบนหน้าเว็บคำนวณจากตารางจริง", () => {
  // จุดตัดที่เบี้ยรวม 20 ปี แพงกว่าผลประโยชน์สูงสุด 150% ของทุน
  // คิดที่ทุน 1,000,000 บาท เพราะทุนขั้นต่ำของแบบนี้คือ 150,000 บาท
  const crossover = (sex) => {
    for (let age = 1; age <= 65; age++) {
      if (premium(1000000, sex, age, "annual") * 20 > 1500000) return age;
    }
    return null;
  };
  assert.equal(crossover("m"), 55);
  assert.equal(crossover("f"), 63);
  // ตัวเลขเทียบราคาที่เขียนไว้ในหน้ารายละเอียด
  assert.equal(premium(1000000, "m", 35, "annual"), 41180);
  assert.equal(RATES.main_99_20.payment_schedules.m.annual[35] * 1000, 25980);
});

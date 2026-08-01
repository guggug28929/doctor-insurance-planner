// เทสต์โครงการเพื่อผู้สูงอายุ (วัยเก๋า คุ้มสุขใจ 90/90 และ วัยเก๋า คุ้มได้ใจ 99/10)
// แบบประกันหลักจริงคือ เมืองไทยสบายใจ 90/90 และ เมืองไทยสบายใจ 99/10 (เพื่อผู้สูงอายุ)
// แหล่งข้อมูล: SmartWeb id 13 และ id 225 ตรวจไขว้กับตารางจำนวนเงินเต็มบน muangthai-agent
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const RATES = JSON.parse(
  await readFile(new URL("../data/premium-rates.json", import.meta.url), "utf8")
);

// ดึงบล็อกโค้ดจริงจาก index.html มารันใน sandbox เพื่อไม่ให้เทสต์คำนวณซ้ำเอง
function extract(marker) {
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, `ไม่พบ ${marker} ใน index.html`);
  let depth = 0;
  let i = html.indexOf("{", start);
  const from = start;
  for (; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") {
      depth--;
      if (depth === 0) return html.slice(from, i + 1);
    }
  }
  throw new Error(`วงเล็บไม่ครบสำหรับ ${marker}`);
}

const sandbox = { RATES, Math };
vm.createContext(sandbox);
vm.runInContext(
  [
    extract("function rateAtStart("),
    extract("const SENIOR_PLANS = "),
    extract("function seniorPremium("),
  ].join("\n"),
  sandbox
);
const premium = (...a) => vm.runInContext("seniorPremium", sandbox)(...a);

test("ข้อมูลวัยเก๋าอยู่ครบและช่วงอายุตรงกับที่บริษัทประกาศ", () => {
  const a = RATES.sabaijai_90_90;
  const b = RATES.sabaijai_99_10;

  assert.equal(a.product_name, "เมืองไทยสบายใจ 90/90 (เพื่อผู้สูงอายุ)");
  assert.equal(b.product_name, "เมืองไทยสบายใจ 99/10 (เพื่อผู้สูงอายุ)");

  assert.deepEqual(a.entry_age_range, [50, 75]);
  assert.deepEqual(b.entry_age_range, [50, 80]);

  for (const [g, n] of [[a, 26], [b, 31]]) {
    for (const freq of ["annual", "monthly"]) {
      for (const sex of ["m", "f"]) {
        assert.equal(g.rates[freq][sex].length, n);
        assert.ok(g.rates[freq][sex].every((v) => typeof v === "number" && v > 0));
      }
    }
  }
});

test("มีเฉพาะงวดรายปีและรายเดือน งวดอื่นต้องคืน null ไม่เดาตัวคูณ", () => {
  for (const plan of ["sabaijai_90_90", "sabaijai_99_10"]) {
    assert.deepEqual(RATES[plan].available_frequencies, ["annual", "monthly"]);
    for (const freq of ["half", "quarter", "semiannual", "quarterly"]) {
      assert.equal(premium(plan, 500000, "m", 55, freq), null);
    }
    assert.ok(premium(plan, 500000, "m", 55, "annual") > 0);
    assert.ok(premium(plan, 500000, "m", 55, "monthly") > 0);
  }
});

test("เบี้ยรายปีตรงกับตารางจำนวนเงินเต็มที่บริษัทเผยแพร่", () => {
  // ค่าหัวและท้ายตาราง จากหน้าข้อมูลผลิตภัณฑ์ ทุน 100,000 และ 500,000 บาท
  assert.equal(premium("sabaijai_90_90", 100000, "m", 50, "annual"), 5300);
  assert.equal(premium("sabaijai_90_90", 500000, "m", 50, "annual"), 26500);
  assert.equal(premium("sabaijai_90_90", 100000, "f", 50, "annual"), 4400);
  assert.equal(premium("sabaijai_90_90", 100000, "m", 75, "annual"), 14300);
  assert.equal(premium("sabaijai_90_90", 500000, "f", 75, "annual"), 62000);

  assert.equal(premium("sabaijai_99_10", 100000, "m", 50, "annual"), 13676);
  assert.equal(premium("sabaijai_99_10", 500000, "m", 50, "annual"), 68380);
  assert.equal(premium("sabaijai_99_10", 100000, "f", 50, "annual"), 13103);
  assert.equal(premium("sabaijai_99_10", 100000, "m", 80, "annual"), 20928);
  assert.equal(premium("sabaijai_99_10", 500000, "f", 80, "annual"), 98335);
});

test("ขอบอายุปิดสนิท ไม่ต่อยอดค่านอกตาราง", () => {
  for (const sex of ["m", "f"]) {
    assert.equal(premium("sabaijai_90_90", 500000, sex, 49, "annual"), null);
    assert.equal(premium("sabaijai_90_90", 500000, sex, 76, "annual"), null);
    assert.ok(premium("sabaijai_90_90", 500000, sex, 75, "annual") > 0);

    assert.equal(premium("sabaijai_99_10", 500000, sex, 49, "annual"), null);
    assert.equal(premium("sabaijai_99_10", 500000, sex, 81, "annual"), null);
    assert.ok(premium("sabaijai_99_10", 500000, sex, 80, "annual") > 0);
    // 99/10 รับถึง 80 ปี ส่วน 90/90 หยุดที่ 75 ปี
    assert.equal(premium("sabaijai_90_90", 500000, sex, 78, "annual"), null);
    assert.ok(premium("sabaijai_99_10", 500000, sex, 78, "annual") > 0);
  }
});

test("เพดานทุนรวมทุกช่องทาง 600,000 บาท และทุนขั้นต่ำ 100,000 บาท", () => {
  for (const plan of ["sabaijai_90_90", "sabaijai_99_10"]) {
    assert.equal(RATES[plan].capital_max_per_person_all_channels, 600000);
    assert.equal(premium(plan, 99999, "m", 60, "annual"), null);
    assert.equal(premium(plan, 600001, "m", 60, "annual"), null);
    assert.ok(premium(plan, 600000, "m", 60, "annual") > 0);
  }
});

test("อัตรารายเดือนที่เก็บไว้ตรงกับกติกา รายปี x 0.09 ทุกช่อง", () => {
  for (const plan of ["sabaijai_90_90", "sabaijai_99_10"]) {
    const g = RATES[plan];
    assert.equal(g.instalment_factors.monthly, 0.09);
    for (const sex of ["m", "f"]) {
      g.rates.annual[sex].forEach((annual, i) => {
        const printed = g.rates.monthly[sex][i];
        // ไม่เทียบแบบเท่ากันเป๊ะ เพราะเลขทศนิยมของ JS ปัดผลคูณคลาดได้หนึ่งหน่วยท้าย
        // เช่น 158.95 x 0.09 = 14.3055 พอดี แต่ float ได้ 14.30549999...
        // จึงตรวจว่าค่าที่พิมพ์เป็นการปัด 3 ตำแหน่งที่ถูกต้องของผลคูณ
        assert.ok(
          Math.abs(printed - annual * 0.09) <= 0.0005 + 1e-9,
          `${plan} ${sex} ดัชนี ${i}: พิมพ์ ${printed} แต่ ${annual} x 0.09 = ${annual * 0.09}`
        );
      });
    }
  }
});

test("เบี้ยถูกปัดเป็นจำนวนเต็มบาทตามที่หน้าข้อมูลผลิตภัณฑ์กำหนด", () => {
  for (const plan of ["sabaijai_90_90", "sabaijai_99_10"]) {
    const g = RATES[plan];
    assert.equal(g.premium_rounding_baht, 0);
    for (let age = g.age_start; age <= g.age_end; age++) {
      for (const sex of ["m", "f"]) {
        for (const freq of ["annual", "monthly"]) {
          const v = premium(plan, 300000, sex, age, freq);
          assert.ok(Number.isInteger(v), `${plan} ${sex} ${age} ${freq} ได้ ${v}`);
        }
      }
    }
  }
});

test("จ่ายรายเดือน 12 งวด แพงกว่ารายปี 8 เปอร์เซ็นต์", () => {
  for (const plan of ["sabaijai_90_90", "sabaijai_99_10"]) {
    const g = RATES[plan];
    for (const age of [g.age_start, g.age_end]) {
      for (const sex of ["m", "f"]) {
        const yearly = premium(plan, 500000, sex, age, "annual");
        const monthly12 = premium(plan, 500000, sex, age, "monthly") * 12;
        const ratio = monthly12 / yearly;
        assert.ok(Math.abs(ratio - 1.08) < 0.002, `${plan} ${sex} ${age} ได้ ${ratio}`);
      }
    }
  }
});

test("หญิงต้องไม่แพงกว่าชายในทุกอายุของทั้งสองแบบ", () => {
  for (const plan of ["sabaijai_90_90", "sabaijai_99_10"]) {
    const g = RATES[plan];
    for (let age = g.age_start; age <= g.age_end; age++) {
      assert.ok(
        premium(plan, 500000, "f", age, "annual") < premium(plan, 500000, "m", age, "annual"),
        `${plan} อายุ ${age}`
      );
    }
  }
});

test("เบี้ยเพิ่มขึ้นตามอายุที่เริ่มทำเสมอ", () => {
  for (const plan of ["sabaijai_90_90", "sabaijai_99_10"]) {
    const g = RATES[plan];
    for (const sex of ["m", "f"]) {
      for (let age = g.age_start; age < g.age_end; age++) {
        assert.ok(
          premium(plan, 500000, sex, age, "annual") < premium(plan, 500000, sex, age + 1, "annual"),
          `${plan} ${sex} อายุ ${age} ไป ${age + 1}`
        );
      }
    }
  }
});

test("บันทึกเงื่อนไขสำคัญไว้ในข้อมูล ไม่ใช่เดาเอง", () => {
  for (const plan of ["sabaijai_90_90", "sabaijai_99_10"]) {
    const g = RATES[plan];
    assert.equal(g.health_questions_required, false);
    assert.match(g.health_questions_note_verbatim, /ไม่ต้องตรวจและไม่ต้องตอบคำถามสุขภาพ/);
    assert.match(g.first_two_years_illness_death, /102% ของเบี้ยที่ชำระแล้ว/);
    assert.match(g.occupation_rule, /กลุ่มอาชีพ 1 และ 2/);
    assert.match(g.exclusions_note_verbatim, /ตามกรมธรรม์ประกันภัย/);
    assert.equal(g.annual_discount_per_1000, null);
    assert.match(g.annual_discount_note, /ยังไม่ใช้ส่วนลด/);
    assert.equal(g.source_type, "smartweb");
  }
  // 99/10 มีขั้นบันไดร้อยละของทุน ส่วน 90/90 จ่าย 100% คงที่
  const ladder = RATES.sabaijai_99_10.death_benefit.ladder_illness_and_accident_pct;
  assert.equal(ladder["3-6"], 100);
  assert.equal(ladder["21-ครบอายุ 99 ปี"], 150);
  assert.equal(
    RATES.sabaijai_99_10.death_benefit.ladder_public_accident_pct["21-ครบอายุ 99 ปี"],
    300
  );
  assert.match(RATES.sabaijai_90_90.death_benefit.y3_plus_illness, /100% ของจำนวนเงินเอาประกันภัย/);
});

test("99/10 ลดหย่อนภาษีได้เฉพาะส่วนความคุ้มครองชีวิต ไม่ใช่เบี้ยเต็มจำนวน", () => {
  const g = RATES.sabaijai_99_10;
  const t = g.tax_deductible_rates;
  assert.equal(t.age_start, 50);
  assert.match(t.note_verbatim, /เฉพาะเบี้ยในส่วนของความคุ้มครองชีวิตเท่านั้น/);
  for (const sex of ["m", "f"]) {
    assert.equal(t.annual[sex].length, 31);
    t.annual[sex].forEach((ded, i) => {
      const total = g.rates.annual[sex][i];
      assert.ok(ded < total, `อายุ ${50 + i} ${sex}: ลดหย่อน ${ded} ต้องน้อยกว่าเบี้ยรวม ${total}`);
      const gap = ((total - ded) / total) * 100;
      assert.ok(gap > 0.4 && gap < 1.4, `อายุ ${50 + i} ${sex}: ส่วนต่าง ${gap}%`);
    });
  }
  // ค่าหัวและท้ายตาราง จากเอกสารหักลดหย่อนภาษีทางการ
  assert.equal(t.annual.m[0], 135.29);
  assert.equal(t.annual.f[0], 129.44);
  assert.equal(t.annual.m[30], 208.24);
  assert.equal(t.annual.f[30], 195.66);
  // 90/90 ไม่มีเอกสารลดหย่อนภาษี จึงต้องไม่มีฟิลด์นี้ ห้ามคัดลอกข้ามแบบ
  assert.equal(RATES.sabaijai_90_90.tax_deductible_rates, undefined);
  assert.match(html, /ลดหย่อนภาษีได้ไม่เต็มจำนวนเบี้ย/);
});

test("สัญญาเพิ่มเติมของโครงการรับอายุถึง 75 ปี แม้สัญญาหลัก 99/10 จะรับถึง 80 ปี", () => {
  assert.deepEqual(RATES.pa_sabaijai_senior.entry_age_range, [50, 75]);
  assert.deepEqual(RATES.hb_sabaijai_senior.entry_age_range, [50, 75]);
  assert.equal(RATES.hb_sabaijai_senior.renewable_to, 89);
  assert.match(RATES.hb_sabaijai_senior.waiting_note, /2 ปีแรก คุ้มครองเฉพาะกรณีอุบัติเหตุ/);
  // ตาราง PA ต้องเป็นจำนวนเงินเต็ม ไม่ใช่อัตราต่อ 1,000
  assert.deepEqual(RATES.pa_sabaijai_senior.annual["50-60"], [1220, 1760, 2300, 2995, 3585]);
  assert.deepEqual(
    RATES.pa_sabaijai_senior.monthly["71-75"],
    [219.15, 320.4, 421.2, 556.2, 710.1]
  );
  // เบี้ย HB = อัตรา x ผลประโยชน์รายวัน / 100
  assert.equal(RATES.hb_sabaijai_senior.annual_rate_per_100["50-65"].m, 250);
  assert.equal((250 * 1000) / 100, 2500);
  // เอกสารพิมพ์หัวคอลัมน์ตารางรายเดือนผิด ต้องบันทึกไว้ ไม่ใช่แก้ตัวเลขเงียบ ๆ
  assert.match(RATES.pa_sabaijai_senior.document_label_error, /แผน 2 ถึง แผน 6/);
  assert.equal(
    RATES.pa_sabaijai_senior.annual["50-60"].length,
    RATES.pa_sabaijai_senior.monthly["50-60"].length
  );
  assert.deepEqual(RATES.pa_sabaijai_senior.plans, [100000, 200000, 300000, 500000, 1000000]);
});

test("บันทึกว่ายืนยันสามแหล่งแล้ว", () => {
  for (const plan of ["sabaijai_90_90", "sabaijai_99_10"]) {
    assert.match(RATES[plan].cross_check, /ยืนยันสามแหล่ง/);
    assert.match(RATES[plan].rate_rounding_note, /ปัดเฉพาะจำนวนเงินสุดท้ายเป็นบาทถ้วน/);
  }
});

test("หน้าเว็บมีป้ายไม่ต้องตอบคำถามสุขภาพ พร้อมคำอธิบายที่ไม่ทำให้เข้าใจว่าไม่มีเงื่อนไข", () => {
  assert.match(html, /waigao9090: '\/plans\/waigao-90-90'/);
  assert.match(html, /waigao9910: '\/plans\/waigao-99-10'/);
  assert.match(html, /class="plan-notice"/);
  assert.match(html, /showPlanDetail\('waigao9090'\)/);
  assert.match(html, /showPlanDetail\('waigao9910'\)/);

  // ป้ายต้องเด่น แต่ต้องมีบรรทัดขยายความ 3 เรื่องที่มีหลักฐานรองรับ
  // ดึงเฉพาะบล็อก notice ของสองแผนวัยเก๋า ไม่ปนกับแผนอื่นที่มีป้ายคนละเรื่อง
  const notices = ["waigao9090", "waigao9910"].map((id) => {
    const start = html.indexOf(`  ${id}: {`);
    assert.notEqual(start, -1, `ไม่พบ PLAN_DETAILS ของ ${id}`);
    const n = html.indexOf("notice: {", start);
    const end = html.indexOf("overview:", n);
    assert.ok(n !== -1 && end > n, `ไม่พบป้ายของ ${id}`);
    return html.slice(n, end);
  });
  assert.equal(notices.length, 2);
  for (const n of notices) {
    assert.match(n, /ไม่ต้องตรวจและไม่ต้องตอบคำถามสุขภาพ/);
    assert.match(n, /ไม่ได้แปลว่าไม่มีเงื่อนไข/);
    assert.match(n, /ปีกรมธรรม์ที่ 1 – 2/);
    assert.match(n, /102% ของเบี้ยที่ชำระแล้ว/);
    assert.match(n, /กลุ่มอาชีพ 1 และ 2/);
    assert.match(n, /ข้อยกเว้นความคุ้มครองเป็นไปตามที่ระบุในกรมธรรม์ฉบับจริง/);
  }
});

const BASE_URL = "https://doctor-insurance.com";

export const LINE_PLAN_CATALOG = Object.freeze({
  smart_protection_99_20: {
    name: "สัญญาหลักประกันชีวิต 99/20",
    description: "",
    url: `${BASE_URL}/plans/smart-protection-99-20`,
  },
  lifetime_protection_99_99: {
    name: "สัญญาหลักประกันชีวิต 99/99",
    description: "",
    url: `${BASE_URL}/plans/lifetime-protection-99-99`,
  },
  d_health_lite: {
    name: "D Health Lite",
    description:
      "เหมาจ่าย IPD 5 ล้าน/ครั้ง (รวมมะเร็ง) ค่าห้อง 4,000/วัน + ผ่าตัดเล็ก + อุบัติเหตุ OPD 24 ชม.แรก",
    url: `${BASE_URL}/plans/d-health-lite`,
  },
  care_plus: {
    name: "Care Plus",
    description:
      "ค่ารักษามะเร็ง/ไตวาย 5 ล้าน/ปี ทั้ง OPD + IPD",
    url: `${BASE_URL}/plans/care-plus`,
  },
  elite_health_plus: {
    name: "Elite Health Plus",
    description:
      "เหมาจ่าย 20-100 ล้าน ไม่ต้องซื้อ Care Plus เพิ่ม cover CT, MRI แบบ OPD ด้วย แผน 40 ล้านขึ้นไปมีวงเงิน OPD โรคทั่วไป",
    url: `${BASE_URL}/plans/elite-health-plus`,
  },
  maochai_extra: {
    name: "เหมาจ่ายเอ๊กตร้า",
    description:
      "เหมาจ่าย 2-5 แสน/ครั้ง ค่าห้อง 2-4 พัน/คืน รวมผ่าตัดใหญ่ที่ไม่ต้องนอนโรงพยาบาล ไม่มี OPD",
    url: `${BASE_URL}/plans/maochai-extra`,
  },
  extra_care_plus: {
    name: "Extra Care Plus",
    description:
      "เหมาจ่าย 2-5 แสนบาท (มีความรับผิดส่วนแรก 20,000)",
    url: `${BASE_URL}/plans/extra-care-plus`,
  },
  opd: {
    name: "OPD ผู้ป่วยนอก",
    description:
      "มีทั้งแบบจำกัดวงเงินรายครั้ง และแบบเหมาจ่าย",
    url: `${BASE_URL}/plans/opd`,
  },
  hb_rider: {
    name: "สุขภาพวงเงินแน่นอน (ชดเชยรายวันกรณีนอนโรงพยาบาล)",
    description: "",
    url: `${BASE_URL}/plans/hb-rider`,
  },
  pa_rider: {
    name: "PA rider อุบัติเหตุ",
    description: "",
    url: `${BASE_URL}/plans/pa-easy-plan`,
  },
  ci_perfect_care: {
    name: "CI Perfect Care",
    description:
      "คุ้มครองโรคร้ายแรงเจอจ่ายจบระยะเริ่มต้น ปานกลาง รุนแรง + คุ้มครองกรณีเสียชีวิตด้วย",
    url: `${BASE_URL}/plans/ci-perfect-care`,
  },
  multiple_ci: {
    name: "Multiple CI",
    description: "ประกันโรคร้ายแรงระยะรุนแรงเจอจ่ายหลายจบ",
    url: `${BASE_URL}/plans/multiple-ci`,
  },
  d_care: {
    name: "D Care",
    description:
      "โรคร้ายรายหมวดโรค (โรคอื่น ๆ คุ้มครอง HIV จากเข็มตำ)",
    url: `${BASE_URL}/plans/d-care`,
  },
  cancer: {
    name: "ความคุ้มครองโรคมะเร็ง",
    description:
      "เจอจ่ายจบโรคมะเร็งระยะเริ่มต้น 15% ระยะรุนแรง 100% มีชดเชยรายวันกรณีแอดมิตด้วยมะเร็ง",
    url: `${BASE_URL}/plans/cancer-protection`,
  },
  maternity_plus: {
    name: "Maternity Plus",
    description:
      "ความคุ้มครองภาวะแทรกซ้อนระหว่างตั้งครรภ์และคลอดบุตร ต้องแนบ D Health Lite หรือ Elite Health Plus",
    url: `${BASE_URL}/plans/maternity-plus`,
  },
  well_being_plus: {
    name: "Well-Being Plus",
    description:
      "ความคุ้มครองตรวจสุขภาพ วัคซีน ทันตกรรม และสายตา ต้องแนบ D Health Lite หรือ Elite Health Plus",
    url: `${BASE_URL}/plans/well-being-plus`,
  },
  flexi_protection_99_20: {
    name: "เมืองไทย เฟล็กซี่ โพรเทคชั่น 99/20",
    description:
      "ประกันชีวิตชำระเบี้ย 20 ปี คุ้มครองถึงอายุ 99 ปี และตั้งแต่อายุ 65 ปีสามารถใช้ผลประโยชน์ชีวิตคงเหลือเป็นค่ารักษา IPD/OPD ได้ตามเงื่อนไข",
    url: `${BASE_URL}/plans/flexi-protection-99-20`,
  },
  smart_link_15_3: {
    name: "Smart Link 15/3",
    description:
      "ประกันชีวิตแบบสะสมทรัพย์ คุ้มครอง 15 ปี ชำระเบี้ย 3 ปี",
    url: `${BASE_URL}/plans/smart-linked-15-3`,
  },
  smart_link_15_6: {
    name: "Smart Link 15/6",
    description:
      "ประกันชีวิตแบบสะสมทรัพย์ คุ้มครอง 15 ปี ชำระเบี้ย 6 ปี",
    url: `${BASE_URL}/plans/smart-linked-15-6`,
  },
});

function money(value) {
  return Number(value || 0).toLocaleString("th-TH");
}

function catalogKeyForProduct(product, itemKey = "") {
  const value = String(product || "");
  if (/เมืองไทย\s*เฟล็กซี่/i.test(value)) return "flexi_protection_99_20";
  if (/smart\s*protection\s*99\/20/i.test(value)) return "smart_protection_99_20";
  if (/99\/99/i.test(value)) return "lifetime_protection_99_99";
  if (/d\s*health\s*lite/i.test(value)) return "d_health_lite";
  if (/elite\s*health\s*plus/i.test(value)) return "elite_health_plus";
  if (/extra\s*care\s*plus/i.test(value)) return "extra_care_plus";
  if (/care\s*plus/i.test(value)) return "care_plus";
  if (/เหมาจ่าย\s*extra/i.test(value)) return "maochai_extra";
  if (/opd/i.test(value) || /^opd_/.test(itemKey)) return "opd";
  if (/pa\s*easy|pa\s*rider/i.test(value) || itemKey === "pa") return "pa_rider";
  if (/ci\s*perfect\s*care/i.test(value)) return "ci_perfect_care";
  if (/multiple\s*ci/i.test(value)) return "multiple_ci";
  if (/d\s*care|ดี\s*แคร์/i.test(value)) return "d_care";
  if (/โรคมะเร็ง|cancer/i.test(value)) return "cancer";
  if (/maternity\s*plus/i.test(value)) return "maternity_plus";
  if (/well-being\s*plus|well\s*being\s*plus/i.test(value)) return "well_being_plus";
  if (/smart[_\s-]*link[_\s-]*15[_\s/-]*3/i.test(value)) return "smart_link_15_3";
  if (/smart[_\s-]*link[_\s-]*15[_\s/-]*6/i.test(value)) return "smart_link_15_6";
  if (/hb\s*rider|ชดเชยรายวัน/i.test(value)) return "hb_rider";
  return null;
}

function displayName(item, info) {
  if (info === LINE_PLAN_CATALOG.elite_health_plus && item?.annualLimit) {
    return `${info.name} ${money(item.annualLimit / 1000000)} ล้านบาท`;
  }
  if (info === LINE_PLAN_CATALOG.opd && item?.plan) {
    const unit = item.key === "opd_per_visit" ? "บาท/ครั้ง" : "บาท/ปี";
    return `${item.product} วงเงิน ${money(item.plan)} ${unit}`;
  }
  return info.name;
}

function supplementalDescription(item, key) {
  if (
    key === "smart_protection_99_20" ||
    key === "lifetime_protection_99_99" ||
    key === "flexi_protection_99_20"
  ) {
    return item?.capital ? `ทุนประกันชีวิต ${money(item.capital)} บาท` : "";
  }
  if (key === "pa_rider") {
    const parts = [];
    if (item?.sumInsured) parts.push(`ทุนอุบัติเหตุ ${money(item.sumInsured)} บาท`);
    if (item?.medicalExpense) {
      parts.push(`ค่ารักษาอุบัติเหตุ ${money(item.medicalExpense)} บาท/อุบัติเหตุ`);
    }
    return parts.join(" และ ");
  }
  return "";
}

export function planCatalogEntry(product, itemKey = "") {
  const key = catalogKeyForProduct(product, itemKey);
  return key ? { key, ...LINE_PLAN_CATALOG[key] } : null;
}

export function formatLinePlan(item, premium = item?.premium) {
  const entry = planCatalogEntry(item?.product, item?.key);
  if (!entry) return String(item?.line || item?.product || "").trim();

  const lines = [displayName(item, LINE_PLAN_CATALOG[entry.key])];
  if (entry.description) lines.push(entry.description);
  const supplemental = supplementalDescription(item, entry.key);
  if (supplemental) lines.push(supplemental);
  if (Number.isFinite(Number(premium))) {
    lines.push(`เบี้ย ${money(premium)} บาท/ปี`);
  }
  lines.push(entry.url);
  return lines.join("\n");
}

function formatAlternative(option) {
  const entry = planCatalogEntry(option?.product);
  if (!entry) return String(option?.product || "").trim();
  const item = {
    ...option,
    key: entry.key,
    product: option.product,
  };
  return formatLinePlan(item, option.premium);
}

function regularQuote(quote) {
  const blocks = (quote.items || []).map((item) => formatLinePlan(item)).filter(Boolean);

  if (Array.isArray(quote.alternatives) && quote.alternatives.length) {
    blocks.push(
      [
        "ตัวเลือกเงินก้อนโรคร้ายแรงเพิ่มเติม เลือกหนึ่งแผน โดยเบี้ยยังไม่รวมในยอดชุดสุขภาพ",
        ...quote.alternatives.map((option) => formatAlternative(option)),
      ].join("\n\n")
    );
  }

  if (quote.totalPremium !== null && quote.totalPremium !== undefined) {
    blocks.push(`สรุปเบี้ยรวม ${money(quote.totalPremium)} บาท/ปีครับ`);
  }
  return blocks;
}

function criticalComparison(quote) {
  const blocks = (quote.items || []).map((item) => formatLinePlan(item)).filter(Boolean);
  blocks.push("ตัวเลือกเงินก้อนโรคร้ายแรง เลือกหนึ่งแผนครับ");
  for (const option of quote.alternatives || []) {
    const lines = [formatAlternative(option)];
    if (Number.isFinite(Number(option.totalWithMain))) {
      lines.push(`รวมสัญญาหลักและสัญญาเพิ่มเติม ${money(option.totalWithMain)} บาท/ปี`);
    }
    blocks.push(lines.join("\n"));
  }
  blocks.push("สรุปเบี้ยรวมแสดงแยกในแต่ละทางเลือกข้างต้นครับ");
  return blocks;
}

function savingsComparison(quote) {
  const blocks = ["แผนออมทรัพย์ลดหย่อนภาษี เน้นเงินคืนมากกว่าทุนชีวิตครับ"];
  for (const option of quote.alternatives || []) {
    const entry = planCatalogEntry(option.product);
    if (!entry) continue;
    blocks.push(
      [
        entry.name,
        entry.description,
        `ทุนประกัน ${money(option.capital)} บาท`,
        `เบี้ยรวม ${money(option.premium)} บาท/ปี`,
        entry.url,
      ].join("\n")
    );
  }
  blocks.push("สรุปเบี้ยรวมแสดงแยกในแต่ละแผนข้างต้นครับ");
  return blocks;
}

function eliteOpdComparison(quote) {
  const blocks = ["เปรียบเทียบตามอายุและเพศที่แจ้งครับ"];
  for (const alternative of quote.alternatives || []) {
    const itemBlocks = (alternative.items || []).map((item) => formatLinePlan(item)).filter(Boolean);
    itemBlocks.push(`สรุปเบี้ยรวม ${money(alternative.totalPremium)} บาท/ปีครับ`);
    blocks.push(itemBlocks.join("\n\n"));
  }
  blocks.push("สรุปเบี้ยรวมแสดงแยกในแต่ละทางเลือกข้างต้นครับ");
  return blocks;
}

export function formatLineQuote(quote) {
  if (!quote?.ok) return quote?.question || "ยังไม่สามารถจัดแผนในกรอบงบที่แจ้งได้ครับ";

  let blocks;
  if (quote.planType === "critical_comparison") {
    blocks = criticalComparison(quote);
  } else if (quote.planType === "savings") {
    blocks = savingsComparison(quote);
  } else if (quote.planType === "elite_opd_comparison") {
    blocks = eliteOpdComparison(quote);
  } else {
    blocks = regularQuote(quote);
  }

  if (quote.selectionReason) blocks.unshift(quote.selectionReason);
  if (Array.isArray(quote.notes) && quote.notes.length) {
    const summary =
      /^สรุปเบี้ยรวม/.test(blocks[blocks.length - 1] || "")
        ? blocks.pop()
        : null;
    blocks.push(quote.notes.join("\n"));
    if (summary) blocks.push(summary);
  }
  return blocks.filter(Boolean).join("\n\n");
}

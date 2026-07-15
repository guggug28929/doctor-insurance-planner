// Vercel Serverless Function: /api/premium-quote.js
// คำนวณเบี้ยจาก data/premium-rates.json แบบ deterministic
// AI มีหน้าที่เข้าใจคำถามและอธิบาย แต่ไม่มีสิทธิ์แต่งตัวเลขเบี้ย

import { readFile } from "node:fs/promises";

let ratesCachePromise = null;

function json(res, status, data) {
  res.status(status).json(data);
}

function n(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeGender(value) {
  const text = String(value || "").trim().toLowerCase();
  if (["f", "female", "woman", "หญิง", "ผู้หญิง"].includes(text)) return "f";
  if (["m", "male", "man", "ชาย", "ผู้ชาย"].includes(text)) return "m";
  return null;
}

function money(value) {
  return Math.round(Number(value || 0)).toLocaleString("th-TH");
}

function rateAtStart(array, age, startAge) {
  if (!Array.isArray(array)) return null;
  const index = Number(age) - Number(startAge);
  if (!Number.isInteger(index) || index < 0 || index >= array.length) return null;
  const value = array[index];
  return value === null || value === undefined ? null : Number(value);
}

function rateAtPublishedAge(array, age) {
  return rateAtStart(array, age, 11);
}

async function loadRates() {
  if (!ratesCachePromise) {
    ratesCachePromise = (async () => {
      const text = await readFile(
        new URL("../data/premium-rates.json", import.meta.url),
        "utf8"
      );
      const rates = JSON.parse(text);
      const required = [
        "main_99_20",
        "main_99_99",
        "dhl_5m",
        "care_plus",
        "ehp",
        "pa_rider",
        "ecp",
        "multiple_ci",
        "maternity_plus",
        "well_being_plus",
        "flexi_99_20",
        "smart_link_15_3",
        "smart_link_15_6",
      ];
      for (const key of required) {
        if (!rates?.[key]) throw new Error(`ตารางเบี้ยไม่ครบ: ${key}`);
      }
      return rates;
    })().catch((error) => {
      ratesCachePromise = null;
      throw error;
    });
  }

  return ratesCachePromise;
}

function mainPremium(rates, gender, age, id) {
  if (id === "99_20_200k") {
    return rateAtStart(rates.main_99_20?.[`${gender}_200k`], age, 0);
  }

  const base50k = rateAtStart(rates.main_99_99?.[gender], age, 0);
  if (base50k === null) return null;
  if (id === "99_99_100k") return base50k * 2;
  if (id === "99_99_50k") return base50k;
  return null;
}

function mainMeta(id) {
  if (id === "99_20_200k") {
    return { label: "Smart Protection 99/20", capital: 200000, payYears: 20 };
  }
  if (id === "99_99_100k") {
    return { label: "สัญญาหลัก 99/99", capital: 100000, payYears: 99 };
  }
  return { label: "สัญญาหลัก 99/99", capital: 50000, payYears: 99 };
}

function dhlPremium(rates, gender, age, deductible) {
  return rateAtStart(rates.dhl_5m?.[`${gender}_${deductible}`], age, 0);
}

function carePlusPremium(rates, gender, age) {
  return rateAtStart(rates.care_plus?.[`${gender}_5m_cackd`], age, 0);
}

function elitePremium(rates, age, plan) {
  return rateAtPublishedAge(rates.ehp?.[plan], age);
}

function ecpPremium(rates, gender, age, plan = "p3") {
  return rateAtPublishedAge(rates.ecp?.[`${gender}_${plan}`], age);
}

function paPremium(rates, age, plan = 1) {
  const numericAge = Number(age);
  let band = 60;
  if (numericAge > 75) band = 85;
  else if (numericAge > 70) band = 75;
  else if (numericAge > 65) band = 70;
  else if (numericAge > 60) band = 65;

  const values = rates.pa_rider?.plans?.[String(band)];
  const value = values?.[Number(plan) - 1];
  return value === null || value === undefined ? null : Number(value);
}

function paCoverage(rates, plan = 1) {
  const index = Number(plan) - 1;
  return {
    sumInsured: Number(rates.pa_rider?.sum_insured?.[index] || 0),
    medicalExpense: Number(rates.pa_rider?.medical_expense?.[index] || 0),
  };
}

function deductibleLabel(id) {
  const labels = {
    d0: "ไม่มีความรับผิดส่วนแรก",
    d30k: "มีความรับผิดส่วนแรก 30,000 บาท/ครั้ง",
    d50k: "มีความรับผิดส่วนแรก 50,000 บาท/ครั้ง",
    d100k: "มีความรับผิดส่วนแรก 100,000 บาท/ครั้ง",
  };
  return labels[id] || id;
}

function normalizeProfile(raw = {}) {
  const legacyOpd = raw.wantsOPD === true ? "yes" : raw.wantsOPD === false ? "no" : null;
  const opdPreference = ["yes", "no", "optional", "unknown"].includes(raw.opdPreference)
    ? raw.opdPreference
    : legacyOpd || "unknown";

  const requestedHealthPlan = ["auto", "dhl", "elite20", "elite75", "ecp"].includes(
    raw.requestedHealthPlan
  )
    ? raw.requestedHealthPlan
    : "auto";

  return {
    age: n(raw.age),
    gender: normalizeGender(raw.gender),
    occupation: raw.occupation ? String(raw.occupation).trim() : null,
    annualBudget: n(raw.annualBudget),
    budgetFlexible: raw.budgetFlexible === true,
    roomBudget: n(raw.roomBudget),
    opdPreference,
    hasGroupBenefit:
      raw.hasGroupBenefit === true
        ? true
        : raw.hasGroupBenefit === false
          ? false
          : null,
    groupBenefit: n(raw.groupBenefit),
    deductiblePreference: ["yes", "none", "auto"].includes(raw.deductiblePreference)
      ? raw.deductiblePreference
      : "auto",
    healthStatus: raw.healthStatus || null,
    requestedHealthPlan,
    quoteScope: raw.quoteScope === "health_only" ? "health_only" : "package",
    optimizeForBudget: raw.optimizeForBudget === true,
    requestedProduct: [
      "auto",
      "critical_comparison",
      "flexi_99_20",
      "smart_link_auto",
      "smart_link_15_3",
      "smart_link_15_6",
    ].includes(raw.requestedProduct)
      ? raw.requestedProduct
      : "auto",
    criticalIllnessNeed: ["unknown", "treatment", "lump_sum", "both"].includes(
      raw.criticalIllnessNeed
    )
      ? raw.criticalIllnessNeed
      : "unknown",
    criticalIllnessSumInsured: n(raw.criticalIllnessSumInsured),
    wantsMaternity: raw.wantsMaternity === true,
    wantsWellBeing: raw.wantsWellBeing === true,
  };
}

function budgetWindow(profile) {
  const target = profile.annualBudget;
  if (profile.budgetFlexible || !target || target <= 0) {
    return { target: target || null, min: 0, max: Infinity };
  }
  return {
    target,
    min: target * 0.5,
    max: target * 1.5,
  };
}

function itemMain(id, premium) {
  const meta = mainMeta(id);
  return {
    key: "main",
    product: meta.label,
    capital: meta.capital,
    premium,
    line: `- ${meta.label} ทุนชีวิต ${money(meta.capital)} บาท — เบี้ย ${money(premium)} บาท/ปี`,
  };
}

function itemPa(rates, premium, plan = 1) {
  const coverage = paCoverage(rates, plan);
  return {
    key: "pa",
    product: `PA Easy Plan ${plan}`,
    plan,
    sumInsured: coverage.sumInsured,
    medicalExpense: coverage.medicalExpense,
    premium,
    line:
      `- อุบัติเหตุ PA Easy Plan ${plan} ทุน ${money(coverage.sumInsured)} บาท ` +
      `ค่ารักษา ${money(coverage.medicalExpense)} บาท/อุบัติเหตุ — เบี้ย ${money(premium)} บาท/ปี`,
  };
}

function buildPackageCandidates({ rates, profile, ridersTotal, budget }) {
  const pa = paPremium(rates, profile.age, 1);
  const candidates = [];

  const add = ({ mainId, includePa, priority }) => {
    const main = mainPremium(rates, profile.gender, profile.age, mainId);
    if (main === null) return;
    if (includePa && pa === null) return;

    // 99/99 ต้องแนบ PA; Smart 99/20 ต้องแนบ PA หรือสัญญาโรคร้ายแรงเสมอ
    if (mainId.startsWith("99_99") && !includePa) return;
    if (mainId === "99_20_200k" && !includePa) return;

    const paCost = includePa ? pa : 0;
    candidates.push({
      mainId,
      mainPremium: main,
      includePa,
      paPremium: paCost,
      priority,
      total: ridersTotal + main + paCost,
    });
  };

  add({ mainId: "99_20_200k", includePa: true, priority: 1 });
  add({ mainId: "99_99_100k", includePa: true, priority: 2 });
  add({ mainId: "99_99_50k", includePa: true, priority: 3 });

  if (!candidates.length) return null;

  // ไม่จำกัดงบ: เลือกชุดความคุ้มครองสูงสุดตามลำดับกฎ
  if (budget.max === Infinity || !budget.target) {
    return candidates.sort((a, b) => a.priority - b.priority)[0];
  }

  // "ถ้างบถึง" หมายถึงยอดรวมต้องไม่เกินงบเป้าหมาย ไม่ใช่ใช้เพดาน +50% เพื่อยัดของเพิ่ม
  const withinTarget = candidates
    .filter((candidate) => candidate.total <= budget.target)
    .sort((a, b) => a.priority - b.priority || b.total - a.total);
  if (withinTarget.length) return withinTarget[0];

  // หากแผนสุขภาพหลักกินงบไปแล้ว ให้เลือกชุดที่เกินงบน้อยที่สุด แต่ยังไม่เกิน +50%
  const withinMaximum = candidates
    .filter((candidate) => candidate.total <= budget.max)
    .sort((a, b) => a.total - b.total || a.priority - b.priority);
  return withinMaximum[0] || null;
}

function eligibleDeductibles(profile) {
  const benefit = profile.groupBenefit || 0;
  const explicitlyWants = profile.deductiblePreference === "yes";
  const hasExisting = profile.hasGroupBenefit === true || benefit > 0;

  if (!explicitlyWants && !hasExisting) return [];
  if (!benefit) return null;

  if (benefit >= 100000) return ["d100k", "d50k", "d30k"];
  if (benefit >= 50000) return ["d50k", "d30k"];
  if (benefit >= 30000) return ["d30k"];
  if (explicitlyWants) return ["d30k"];
  return [];
}

function finalizeQuote({ profile, budget, items, planType, planCode, notes = [], selectionReason = "" }) {
  const total = items.reduce((sum, item) => sum + Number(item.premium || 0), 0);
  const withinBudgetRange =
    budget.max === Infinity || (total >= budget.min && total <= budget.max);

  const lines = [...items.map((item) => item.line), "", `รวมทั้งหมด ${money(total)} บาท/ปี`];

  return {
    ok: true,
    planType,
    planCode,
    items,
    totalPremium: total,
    budget: {
      target: budget.target,
      minimumAccepted: budget.min,
      maximumAccepted: budget.max === Infinity ? null : budget.max,
      withinRange: withinBudgetRange,
      differenceFromTarget: budget.target ? total - budget.target : null,
    },
    notes,
    selectionReason,
    text: lines.join("\n"),
    profileUsed: profile,
  };
}

function buildDhlPackage(rates, profile, deductible) {
  const budget = budgetWindow(profile);
  const healthPremium = dhlPremium(rates, profile.gender, profile.age, deductible);
  const carePremium = carePlusPremium(rates, profile.gender, profile.age);
  if (healthPremium === null) return null;
  if (carePremium === null) throw new Error("ไม่พบเบี้ย Care Plus สำหรับอายุที่แจ้ง");

  if (profile.quoteScope === "health_only") {
    return finalizeQuote({
      profile,
      budget,
      items: [
        {
          key: "health",
          product: "D Health Lite",
          sumInsuredPerConfinement: 5000000,
          roomPerDay: 4000,
          deductible,
          premium: healthPremium,
          line:
            `- D Health Lite 5 ล้านบาท/ครั้ง คุ้มครองค่าห้อง 4,000 บาท/วันกรณีนอนโรงพยาบาล ` +
            `${deductibleLabel(deductible)} — เบี้ย ${money(healthPremium)} บาท/ปี`,
        },
      ],
      planType: "dhl",
      planCode: `dhl_5m_${deductible}_only`,
      selectionReason: "คำนวณเฉพาะเบี้ย D Health Lite ตามที่ลูกค้าระบุครับ",
    });
  }

  const ridersTotal = healthPremium + carePremium;
  const mainChoice = buildPackageCandidates({ rates, profile, ridersTotal, budget });
  if (!mainChoice) return null;

  const items = [
    itemMain(mainChoice.mainId, mainChoice.mainPremium),
    {
      key: "health",
      product: "D Health Lite",
      sumInsuredPerConfinement: 5000000,
      roomPerDay: 4000,
      deductible,
      premium: healthPremium,
      line:
        `- D Health Lite 5 ล้านบาท/ครั้ง คุ้มครองค่าห้อง 4,000 บาท/วันกรณีนอนโรงพยาบาล ` +
        `${deductibleLabel(deductible)} — เบี้ย ${money(healthPremium)} บาท/ปี`,
    },
    {
      key: "careplus",
      product: "Care Plus",
      cancerAndCkdPerDiseasePerYear: 5000000,
      premium: carePremium,
      line:
        `- Care Plus มะเร็งและไตวายเรื้อรัง 5 ล้านบาท/โรค/ปี ` +
        `เหมาจ่ายยามุ่งเป้าและยาภูมิคุ้มกันบำบัด — เบี้ย ${money(carePremium)} บาท/ปี`,
    },
  ];

  if (mainChoice.includePa) items.push(itemPa(rates, mainChoice.paPremium, 1));

  return finalizeQuote({
    profile,
    budget,
    items,
    planType: "dhl",
    planCode: `dhl_5m_${deductible}`,
    notes: [
      "หากแอดมิดโรงพยาบาลในเครือ MTL Smile Network ไม่ต้องเสียส่วนต่างค่าห้องตามเงื่อนไขเครือข่าย",
      "โรงพยาบาลคู่สัญญาบางแห่ง ตัวแทนอาจช่วยขอส่วนลดค่าห้องได้",
    ],
    selectionReason:
      mainChoice.mainId.startsWith("99_99")
        ? "เลือกสัญญาหลัก 99/99 พร้อม PA ตามกฎ เพื่อให้ยอดรวมใกล้งบที่สุดครับ"
        : mainChoice.includePa
          ? "งบรองรับ Smart Protection 99/20 และ PA Easy Plan 1 ครับ"
          : "เลือก Smart Protection 99/20 พร้อมสัญญาเพิ่มเติมตามเงื่อนไขผลิตภัณฑ์ครับ",
  });
}

function buildDhlQuote(rates, profile) {
  const budget = budgetWindow(profile);
  const noDeductible = buildDhlPackage(rates, profile, "d0");

  // ถ้ายอดไม่เกินงบเป้าหมาย หรือไม่มีสิทธิเดิม/ไม่ได้ขอ deductible ให้ใช้ d0 เลย
  if (
    noDeductible &&
    (budget.max === Infinity ||
      !budget.target ||
      noDeductible.totalPremium <= budget.target ||
      (profile.hasGroupBenefit !== true && profile.deductiblePreference !== "yes"))
  ) {
    return noDeductible;
  }

  // ถ้ายังเกินงบและมีสิทธิเดิม/ขอ deductible ต้องถามวงเงินเดิมก่อน
  const deductibleOptions = eligibleDeductibles(profile);
  if (deductibleOptions === null) {
    return {
      ok: false,
      needsInfo: "groupBenefit",
      question:
        "เพื่อปรับความรับผิดส่วนแรกให้ตรงกับสิทธิเดิม รบกวนแจ้งวงเงินค่ารักษาของประกันกลุ่มหรือกรมธรรม์เดิมประมาณกี่บาทครับ",
    };
  }

  const deductibleQuotes = (deductibleOptions || [])
    .map((option) => buildDhlPackage(rates, profile, option))
    .filter(Boolean);

  if (deductibleQuotes.length) {
    if (budget.max === Infinity || !budget.target) return deductibleQuotes[0];

    const underTarget = deductibleQuotes
      .filter((quote) => quote.totalPremium <= budget.target)
      .sort((a, b) => b.totalPremium - a.totalPremium);
    if (underTarget.length) return underTarget[0];

    const underMax = deductibleQuotes
      .filter((quote) => quote.totalPremium <= budget.max)
      .sort((a, b) => a.totalPremium - b.totalPremium);
    if (underMax.length) return underMax[0];
  }

  if (noDeductible && (budget.max === Infinity || noDeductible.totalPremium <= budget.max)) {
    return noDeductible;
  }

  // Fallback: Extra Care Plus Plan 3 + Care Plus
  const ecp = ecpPremium(rates, profile.gender, profile.age, "p3");
  const care = carePlusPremium(rates, profile.gender, profile.age);
  if (ecp !== null && care !== null) {
    const mainChoice = buildPackageCandidates({
      rates,
      profile,
      ridersTotal: ecp + care,
      budget,
    });
    if (mainChoice) {
      const items = [
        itemMain(mainChoice.mainId, mainChoice.mainPremium),
        {
          key: "health",
          product: "Extra Care Plus Plan 3",
          sumInsuredPerConfinement: 500000,
          roomPerDay: 4000,
          deductible: 20000,
          premium: ecp,
          line:
            `- Extra Care Plus Plan 3 วงเงิน 500,000 บาท/ครั้ง ค่าห้อง 4,000 บาท/วัน ` +
            `ความรับผิดส่วนแรก 20,000 บาท/ครั้ง — เบี้ย ${money(ecp)} บาท/ปี`,
        },
        {
          key: "careplus",
          product: "Care Plus",
          cancerAndCkdPerDiseasePerYear: 5000000,
          premium: care,
          line:
            `- Care Plus มะเร็งและไตวายเรื้อรัง 5 ล้านบาท/โรค/ปี ` +
            `เหมาจ่ายยามุ่งเป้าและยาภูมิคุ้มกันบำบัด — เบี้ย ${money(care)} บาท/ปี`,
        },
      ];
      if (mainChoice.includePa) items.push(itemPa(rates, mainChoice.paPremium, 1));
      return finalizeQuote({
        profile,
        budget,
        items,
        planType: "ecp",
        planCode: "ecp_p3",
        notes: ["เป็นแผนสำรองเมื่อ D Health Lite ยังไม่ลงตัวกับงบครับ"],
        selectionReason: "ปรับลงเป็น Extra Care Plus Plan 3 เพื่อให้ใกล้งบมากขึ้นครับ",
      });
    }
  }

  return {
    ok: false,
    noPlanWithinBudget: true,
    question:
      "จากความคุ้มครองหลักที่ต้องการ ยังไม่มีชุดที่อยู่ภายในกรอบงบบวกลบ 50% ครับ ต้องการเพิ่มงบหรือปรับความคุ้มครองส่วนใดก่อนครับ",
  };
}

function buildEliteQuote(rates, profile, forcedPlan = null) {
  const budget = budgetWindow(profile);
  const plan =
    forcedPlan ||
    (profile.opdPreference === "yes" || (profile.annualBudget || 0) >= 50000
      ? "75m"
      : "20m");

  const healthPremium = elitePremium(rates, profile.age, plan);
  if (healthPremium === null) throw new Error("ไม่พบเบี้ย Elite Health Plus สำหรับอายุที่แจ้ง");

  if (profile.quoteScope === "health_only") {
    return finalizeQuote({
      profile,
      budget,
      items: [
        {
          key: "health",
          product: "Elite Health Plus",
          plan,
          annualLimit: plan === "75m" ? 75000000 : 20000000,
          premium: healthPremium,
          line:
            `- Elite Health Plus วงเงิน ${plan === "75m" ? "75" : "20"} ล้านบาท/ปี ` +
            `${plan === "75m" ? "พร้อมความคุ้มครอง OPD ตามเงื่อนไขแผน" : "เน้นความคุ้มครอง IPD"} ` +
            `— เบี้ย ${money(healthPremium)} บาท/ปี`,
        },
      ],
      planType: "elite",
      planCode: `elite_${plan}_only`,
      selectionReason: `คำนวณเฉพาะเบี้ย Elite Health Plus ${plan === "75m" ? "75" : "20"} ล้านบาทตามที่ลูกค้าระบุครับ`,
    });
  }

  const mainChoice = buildPackageCandidates({
    rates,
    profile,
    ridersTotal: healthPremium,
    budget,
  });

  if (!mainChoice) {
    return {
      ok: false,
      noPlanWithinBudget: true,
      question:
        "ความต้องการค่าห้องระดับนี้ควรใช้ Elite Health Plus แต่เบี้ยยังเกินกรอบงบบวกลบ 50% ครับ ต้องการเพิ่มงบหรือปรับค่าห้องก่อนครับ",
    };
  }

  const items = [
    itemMain(mainChoice.mainId, mainChoice.mainPremium),
    {
      key: "health",
      product: "Elite Health Plus",
      plan,
      annualLimit: plan === "75m" ? 75000000 : 20000000,
      premium: healthPremium,
      line:
        `- Elite Health Plus วงเงิน ${plan === "75m" ? "75" : "20"} ล้านบาท/ปี ` +
        `${plan === "75m" ? "พร้อมความคุ้มครอง OPD ตามเงื่อนไขแผน" : "เน้นความคุ้มครอง IPD"} ` +
        `— เบี้ย ${money(healthPremium)} บาท/ปี`,
    },
  ];
  if (mainChoice.includePa) items.push(itemPa(rates, mainChoice.paPremium, 1));

  return finalizeQuote({
    profile,
    budget,
    items,
    planType: "elite",
    planCode: `elite_${plan}`,
    notes: [
      "ไม่แนบ Care Plus เพิ่มเมื่อใช้ Elite Health Plus",
      "ไม่เสนอ Elite 40 ล้านบาทเป็นแผนหลัก เพราะเบี้ยใกล้เคียงแผน 75 ล้านบาทมาก และเพิ่มเงินอีกประมาณหลักพันบาทได้วงเงินสูงกว่าอย่างชัดเจน",
    ],
    selectionReason:
      forcedPlan === "20m"
        ? "ใช้ Elite Health Plus 20 ล้านบาทตามคำขอล่าสุดของลูกค้าครับ"
        : forcedPlan === "75m"
          ? "ใช้ Elite Health Plus 75 ล้านบาทตามคำขอล่าสุดของลูกค้าครับ"
          : plan === "75m"
            ? "เลือก Elite Health Plus 75 ล้านบาท เพราะงบตั้งแต่ 50,000 บาทขึ้นไปหรือเน้น OPD ครับ"
            : "เลือก Elite Health Plus 20 ล้านบาท เพราะงบต่ำกว่า 50,000 บาทและไม่ได้ยืนยันว่าต้องการ OPD ครับ",
  });
}

function bandPremium(table, genderOrAge, ageOrPlan, maybePlan) {
  const hasGender = typeof genderOrAge === "string";
  const bands = hasGender ? table?.[genderOrAge] : table?.bands;
  const age = Number(hasGender ? ageOrPlan : genderOrAge);
  const planIndex = Number(hasGender ? maybePlan : ageOrPlan);
  const row = bands?.find(([min, max]) => age >= min && age <= max);
  return row ? Number(row[2 + planIndex]) : null;
}

function appendRequestedHealthExtras(rates, profile, quote) {
  if (!quote?.ok || !["dhl", "elite"].includes(quote.planType)) return quote;
  if (!profile.wantsMaternity && !profile.wantsWellBeing) return quote;

  const items = [...quote.items];
  const notes = [...(quote.notes || [])];

  if (profile.wantsMaternity) {
    if (profile.gender !== "f" || profile.age < 15 || profile.age > 49) {
      return {
        ok: false,
        noEligiblePlan: true,
        question: "Maternity Plus รับเฉพาะผู้หญิงอายุ 15-49 ปีครับ รบกวนตรวจสอบอายุและเพศที่แจ้งอีกครั้งครับ",
      };
    }
    const p1 = bandPremium(rates.maternity_plus, profile.age, 0);
    const p2 = bandPremium(rates.maternity_plus, profile.age, 1);
    items.push({
      key: "maternity",
      product: "Maternity Plus Plan 1",
      premium: p1,
      line:
        `- Maternity Plus Plan 1 ความคุ้มครองภาวะแทรกซ้อนระหว่างตั้งครรภ์/คลอดบุตร ` +
        `วงเงิน 2 ล้านบาท/ปี — เบี้ย ${money(p1)} บาท/ปี`,
    });
    notes.push(
      `Maternity Plus ซื้อเดี่ยวไม่ได้ ต้องแนบ D Health Lite หรือ Elite Health Plus; ` +
        `Plan 2 วงเงิน 4 ล้านบาท เบี้ย ${money(p2)} บาท/ปี และมีระยะรอคอย 280 วันครับ`
    );
  }

  if (profile.wantsWellBeing) {
    const p1 = bandPremium(rates.well_being_plus, profile.age, 0);
    const p2 = bandPremium(rates.well_being_plus, profile.age, 1);
    if (p1 === null) {
      return {
        ok: false,
        noEligiblePlan: true,
        question: "Well-Being Plus รับอายุ 11-90 ปีครับ รบกวนตรวจสอบอายุที่แจ้งอีกครั้งครับ",
      };
    }
    items.push({
      key: "wellbeing",
      product: "Well-Being Plus Plan 1",
      premium: p1,
      line:
        `- Well-Being Plus Plan 1 ตรวจสุขภาพ 5,000 บาท วัคซีน 4,000 บาท ` +
        `ทันตกรรม 10,000 บาท และสายตา 5,000 บาท/ปี — เบี้ย ${money(p1)} บาท/ปี`,
    });
    notes.push(
      `Well-Being Plus ซื้อเดี่ยวไม่ได้ ต้องแนบ D Health Lite หรือ Elite Health Plus; ` +
        `Plan 2 เบี้ย ${money(p2)} บาท/ปี (ตรวจสุขภาพ 10,000 วัคซีน 6,000 ` +
        `ทันตกรรม 15,000 และสายตา 7,500 บาท) ครับ`
    );
  }

  return finalizeQuote({
    profile,
    budget: budgetWindow(profile),
    items,
    planType: quote.planType,
    planCode: `${quote.planCode}${profile.wantsMaternity ? "_mat" : ""}${profile.wantsWellBeing ? "_wb" : ""}`,
    notes,
    selectionReason: quote.selectionReason,
  });
}

function normalizeCriticalCapital(value) {
  const requested = Number(value || 500000);
  const supported = [500000, 1000000, 2000000];
  return supported.reduce((best, capital) =>
    Math.abs(capital - requested) < Math.abs(best - requested) ? capital : best
  );
}

function criticalOptions(rates, profile) {
  const capital = normalizeCriticalCapital(profile.criticalIllnessSumInsured);
  const options = [];
  const cipcBase = rateAtStart(rates.cipc?.[profile.gender], profile.age, rates.cipc?.age_start || 0);
  const multiple = bandPremium(rates.multiple_ci, profile.gender, profile.age, [500000, 1000000, 2000000].indexOf(capital));
  const dcareRate = rateAtStart(
    rates.dcare?.[`${profile.gender}_popular`],
    profile.age,
    rates.dcare?.age_start || 0
  );
  const cancerKey = `${profile.gender}_${capital === 1000000 ? "1m" : capital === 2000000 ? "2m" : "500k"}`;
  const cancer = rateAtPublishedAge(rates.cancer?.[cancerKey], profile.age);

  if (cipcBase !== null && profile.age <= 65) {
    options.push({
      product: "CI Perfect Care",
      capital,
      premium: cipcBase * (capital / 500000),
      detail: "คุ้มครองโรคร้ายแรง 36 โรค หลายระยะ รวมสูงสุด 100% ของทุน",
    });
  }
  if (multiple !== null) {
    options.push({
      product: "Multiple CI",
      capital,
      premium: multiple,
      detail: "คุ้มครอง 35 โรค แบ่ง 4 กลุ่ม รับผลประโยชน์รวมได้สูงสุด 400% ของทุน",
    });
  }
  if (dcareRate !== null && profile.age <= 70) {
    options.push({
      product: "D Care (กลุ่มโรคยอดฮิต)",
      capital,
      premium: dcareRate * (capital / 1000),
      detail: "เลือกกลุ่มโรคที่ต้องการ เน้นกลุ่มโรคยอดฮิตเป็นตัวอย่าง",
    });
  }
  if (cancer !== null) {
    options.push({
      product: "ความคุ้มครองโรคมะเร็ง",
      capital,
      premium: cancer,
      detail: "เงินก้อนเมื่อเข้าเงื่อนไขโรคมะเร็งตามกรมธรรม์",
    });
  }
  return { capital, options: options.map((option) => ({ ...option, premium: Math.round(option.premium) })) };
}

function buildCriticalComparison(rates, profile) {
  const { capital, options } = criticalOptions(rates, profile);
  if (!options.length) {
    return { ok: false, noEligiblePlan: true, question: "ไม่พบตารางเบี้ยโรคร้ายแรงสำหรับอายุที่แจ้งครับ" };
  }
  const main = mainPremium(rates, profile.gender, profile.age, "99_20_200k");
  if (main === null) {
    return { ok: false, noEligiblePlan: true, question: "ไม่พบสัญญาหลักที่รองรับอายุที่แจ้งครับ" };
  }
  const lines = [
    `ตัวเลือกเงินก้อนโรคร้ายแรง ทุน ${money(capital)} บาท`,
    `สัญญาหลัก Smart Protection 99/20 ทุน 200,000 บาท เบี้ย ${money(main)} บาท/ปี`,
    ...options.map(
      (option) =>
        `- ${option.product}: เบี้ยสัญญาเพิ่มเติม ${money(option.premium)} บาท/ปี ` +
        `(รวมสัญญาหลัก ${money(main + option.premium)} บาท/ปี) — ${option.detail}`
    ),
  ];
  return {
    ok: true,
    comparison: true,
    planType: "critical_comparison",
    planCode: `critical_${capital}`,
    totalPremium: null,
    alternatives: options.map((option) => ({ ...option, totalWithMain: main + option.premium })),
    text: lines.join("\n"),
    notes: ["Smart Protection 99/20 ต้องแนบอุบัติเหตุหรือโรคร้ายแรง; ชุดนี้ใช้สัญญาโรคร้ายแรงเป็นสัญญาแนบครับ"],
    profileUsed: profile,
  };
}

function appendCriticalAlternatives(rates, profile, quote) {
  if (!quote?.ok || profile.criticalIllnessNeed !== "both") return quote;
  const { capital, options } = criticalOptions(rates, profile);
  if (!options.length) return quote;
  quote.alternatives = options;
  quote.text +=
    `\n\nตัวเลือกเงินก้อนโรคร้ายแรงเพิ่มเติม ทุน ${money(capital)} บาท ` +
    `(เลือกหนึ่งแผน เบี้ยด้านล่างยังไม่รวมในยอดชุดสุขภาพ)\n` +
    options.map((option) => `- ${option.product} — เบี้ย ${money(option.premium)} บาท/ปี`).join("\n");
  return quote;
}

function buildFlexiQuote(rates, profile) {
  if (profile.age < 0 || profile.age > 45) {
    return { ok: false, noEligiblePlan: true, question: "เมืองไทยเฟล็กซี่ โพรเทคชั่น 99/20 รับอายุ 30 วัน-45 ปีครับ" };
  }
  const choices = [500000, 1000000, 5000000].map((capital) => {
    const key = `${profile.gender}_${capital === 500000 ? "500k" : capital === 1000000 ? "1m" : "5m"}`;
    return { capital, premium: rateAtStart(rates.flexi_99_20[key], profile.age, 0) };
  });
  const target = profile.annualBudget;
  const within = target ? choices.filter((choice) => choice.premium <= target) : choices;
  const selected = within.length
    ? within.sort((a, b) => b.capital - a.capital)[0]
    : choices.sort((a, b) => a.premium - b.premium)[0];
  return finalizeQuote({
    profile,
    budget: budgetWindow(profile),
    items: [{
      key: "main",
      product: "เมืองไทยเฟล็กซี่ โพรเทคชั่น 99/20",
      capital: selected.capital,
      premium: selected.premium,
      line: `- เมืองไทยเฟล็กซี่ โพรเทคชั่น 99/20 ทุน ${money(selected.capital)} บาท — เบี้ยคงที่ ${money(selected.premium)} บาท/ปี ชำระ 20 ปี`,
    }],
    planType: "flexi",
    planCode: `flexi_${selected.capital}`,
    notes: [
      "อายุ 65-98 ปี สามารถเปลี่ยนผลประโยชน์ชีวิตคงเหลือเป็นค่ารักษา IPD/OPD แบบเหมาจ่ายได้ไม่เกินทุนประกัน",
      "หากเสียชีวิตหรือครบอายุ 99 ปี จะจ่ายทุนที่เหลือหลังหักค่ารักษาที่ใช้ไปแล้วตามเงื่อนไขกรมธรรม์",
    ],
    selectionReason: "เหมาะกับผู้ที่ยังมีสวัสดิการตอนทำงาน แต่กังวลค่ารักษาและภาระเบี้ยหลังเกษียณครับ",
  });
}

function savingsChoice(table, age, budget) {
  const row = table.bands.find(([min, max]) => age >= min && age <= max);
  if (!row) return null;
  const choices = table.capitals.map((capital, index) => ({ capital, premium: Number(row[2 + index]) }));
  const within = budget ? choices.filter((choice) => choice.premium <= budget) : choices;
  return within.length
    ? within.sort((a, b) => b.capital - a.capital)[0]
    : choices.sort((a, b) => a.premium - b.premium)[0];
}

function buildSavingsQuote(rates, profile) {
  if (profile.age < 0 || profile.age > 80) {
    return { ok: false, noEligiblePlan: true, question: "แผน Smart Link 15/3 และ 15/6 รับอายุ 0-80 ปีครับ" };
  }
  const keys = profile.requestedProduct === "smart_link_15_3"
    ? ["smart_link_15_3"]
    : profile.requestedProduct === "smart_link_15_6"
      ? ["smart_link_15_6"]
      : ["smart_link_15_3", "smart_link_15_6"];
  const options = keys.map((key) => ({ key, choice: savingsChoice(rates[key], profile.age, profile.annualBudget), table: rates[key] }));
  const lines = ["แผนออมทรัพย์ลดหย่อนภาษี เน้นเงินคืนมากกว่าทุนชีวิต"];
  for (const option of options) {
    const label = option.key === "smart_link_15_3" ? "Smart Link 15/3" : "Smart Link 15/6";
    lines.push(`- ${label} ทุน ${money(option.choice.capital)} บาท เบี้ย ${money(option.choice.premium)} บาท/ปี ชำระ ${option.table.pay_years} ปี คุ้มครอง 15 ปี`);
  }
  return {
    ok: true,
    comparison: options.length > 1,
    planType: "savings",
    planCode: keys.join("_or_"),
    totalPremium: options.length === 1 ? options[0].choice.premium : null,
    alternatives: options.map(({ key, choice, table }) => ({ product: key, ...choice, payYears: table.pay_years })),
    text: lines.join("\n"),
    notes: ["ใช้สิทธิลดหย่อนภาษีได้ตามหลักเกณฑ์ของกรมสรรพากร และผลประโยชน์/เงินปันผลที่ไม่รับรองให้ยืนยันจากใบเสนอขายครับ"],
    profileUsed: profile,
  };
}

function resolvePlan(profile) {
  if (profile.requestedHealthPlan === "dhl") return { type: "dhl" };
  if (profile.requestedHealthPlan === "ecp") return { type: "ecp" };
  if (profile.requestedHealthPlan === "elite20") return { type: "elite", plan: "20m" };
  if (profile.requestedHealthPlan === "elite75") return { type: "elite", plan: "75m" };

  // OPD แบบ optional เช่น "IPD +/- OPD" ไม่ถือว่าเป็นการขอ OPD
  if ((profile.roomBudget || 0) >= 10000) {
    return {
      type: "elite",
      plan:
        profile.opdPreference === "yes" || (profile.annualBudget || 0) >= 50000
          ? "75m"
          : "20m",
    };
  }
  return { type: "dhl" };
}

function validate(profile) {
  const missing = [];
  const savings = profile.requestedProduct.startsWith("smart_link");
  const health = profile.requestedProduct === "auto";
  if (profile.age === null) missing.push("age");
  if (!savings && !profile.gender) missing.push("gender");
  if (health && !profile.occupation) missing.push("occupation");
  if (profile.annualBudget === null && !profile.budgetFlexible) missing.push("annualBudget");
  const isHealth = ![
    "critical_comparison",
    "flexi_99_20",
    "smart_link_auto",
    "smart_link_15_3",
    "smart_link_15_6",
  ].includes(profile.requestedProduct);
  if (isHealth && profile.requestedHealthPlan === "auto" && profile.roomBudget === null) {
    missing.push("roomBudget");
  }
  return missing;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { error: "Method not allowed" });
  }

  try {
    const profile = normalizeProfile(req.body?.profile || req.body || {});
    const missing = validate(profile);
    if (missing.length) {
      return json(res, 200, { ok: false, missingFields: missing });
    }

    const rates = await loadRates();

    if (profile.requestedProduct === "critical_comparison") {
      return json(res, 200, buildCriticalComparison(rates, profile));
    }
    if (profile.requestedProduct === "flexi_99_20") {
      return json(res, 200, buildFlexiQuote(rates, profile));
    }
    if (profile.requestedProduct.startsWith("smart_link")) {
      return json(res, 200, buildSavingsQuote(rates, profile));
    }

    const selection = resolvePlan(profile);

    let quote;
    if (selection.type === "elite") {
      quote = buildEliteQuote(rates, profile, selection.plan);
    } else {
      quote = buildDhlQuote(rates, profile);
    }

    quote = appendRequestedHealthExtras(rates, profile, quote);
    quote = appendCriticalAlternatives(rates, profile, quote);
    return json(res, 200, quote);
  } catch (error) {
    console.error("premium-quote error", error);
    return json(res, 500, {
      ok: false,
      error: error?.message || "คำนวณเบี้ยไม่สำเร็จ",
    });
  }
}

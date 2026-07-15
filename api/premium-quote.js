// Vercel Serverless Function: /api/premium-quote.js
// คำนวณเบี้ยจากตาราง rates-data ใน index.html แบบ deterministic
// AI มีหน้าที่เข้าใจคำถามและอธิบาย แต่ไม่มีสิทธิ์แต่งตัวเลขเบี้ย

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

async function loadRates(req) {
  if (!ratesCachePromise) {
    ratesCachePromise = (async () => {
      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers.host;
      if (!host) throw new Error("ไม่พบ host สำหรับโหลดตารางเบี้ย");

      const response = await fetch(`${protocol}://${host}/`, {
        headers: { Accept: "text/html" },
      });
      if (!response.ok) {
        throw new Error(`โหลดหน้าเครื่องคำนวณไม่สำเร็จ: HTTP ${response.status}`);
      }

      const html = await response.text();
      const match = html.match(
        /<script[^>]*id=["']rates-data["'][^>]*>([\s\S]*?)<\/script>/i
      );
      if (!match) throw new Error("ไม่พบ rates-data ในหน้าเครื่องคำนวณ");

      const rates = JSON.parse(match[1].trim());
      const required = [
        "main_99_20",
        "main_99_99",
        "dhl_5m",
        "care_plus",
        "ehp",
        "pa_rider",
        "ecp",
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
  return {
    age: n(raw.age),
    gender: normalizeGender(raw.gender),
    occupation: raw.occupation ? String(raw.occupation).trim() : null,
    annualBudget: n(raw.annualBudget),
    budgetFlexible: raw.budgetFlexible === true,
    roomBudget: n(raw.roomBudget),
    wantsOPD: raw.wantsOPD === true,
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

function chooseMainAndPa({ rates, profile, ridersTotal, budget }) {
  const mainIds = ["99_20_200k", "99_99_100k", "99_99_50k"];
  const pa = paPremium(rates, profile.age, 1);
  const cheapestMain = mainPremium(rates, profile.gender, profile.age, "99_99_50k");

  if (cheapestMain === null) {
    throw new Error("ไม่พบเบี้ยสัญญาหลักขั้นต่ำสำหรับอายุที่แจ้ง");
  }

  // ใส่ PA Easy Plan 1 ก่อน ถ้ายังอยู่ในกรอบงบ +50%
  let includePa = pa !== null && ridersTotal + cheapestMain + pa <= budget.max;

  for (const mainId of mainIds) {
    const premium = mainPremium(rates, profile.gender, profile.age, mainId);
    if (premium === null) continue;
    const total = ridersTotal + premium + (includePa ? pa : 0);
    if (total <= budget.max) {
      return { mainId, mainPremium: premium, includePa, paPremium: includePa ? pa : 0 };
    }
  }

  // ถ้า PA ทำให้เกินงบ ให้ถอด PA ก่อน แล้วไล่ 99/20 -> 99/99 100k -> 99/99 50k
  includePa = false;
  for (const mainId of mainIds) {
    const premium = mainPremium(rates, profile.gender, profile.age, mainId);
    if (premium === null) continue;
    const total = ridersTotal + premium;
    if (total <= budget.max) {
      return { mainId, mainPremium: premium, includePa, paPremium: 0 };
    }
  }

  return null;
}

function eligibleDeductibles(profile) {
  const benefit = profile.groupBenefit || 0;
  const explicitlyWants = profile.deductiblePreference === "yes";
  const hasExisting = profile.hasGroupBenefit === true || benefit > 0;

  if (!explicitlyWants && !hasExisting) return [];
  if (!benefit) return null; // ต้องถามวงเงินเดิมก่อน

  const options = [];
  // เริ่มจาก deductible ที่ใกล้กับวงเงินเดิมที่สุดก่อน แล้วค่อยลดลงหากจำเป็น
  if (benefit >= 100000) options.push("d100k", "d50k", "d30k");
  else if (benefit >= 50000) options.push("d50k", "d30k");
  else if (benefit >= 30000) options.push("d30k");

  // ถ้าวงเงินเดิมต่ำกว่า 30,000 แต่ลูกค้าร้องขอ deductible ให้เริ่มถามยืนยัน 30,000
  if (options.length === 0 && explicitlyWants) options.push("d30k");
  return options;
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

function itemPa(rates, premium) {
  const coverage = paCoverage(rates, 1);
  return {
    key: "pa",
    product: "PA Easy Plan 1",
    plan: 1,
    sumInsured: coverage.sumInsured,
    medicalExpense: coverage.medicalExpense,
    premium,
    line:
      `- อุบัติเหตุ PA Easy Plan 1 ทุน ${money(coverage.sumInsured)} บาท ` +
      `ค่ารักษา ${money(coverage.medicalExpense)} บาท/อุบัติเหตุ — เบี้ย ${money(premium)} บาท/ปี`,
  };
}

function finalizeQuote({ profile, budget, items, planType, planCode, notes = [] }) {
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
    text: lines.join("\n"),
    profileUsed: profile,
  };
}

function buildDhlQuote(rates, profile) {
  const budget = budgetWindow(profile);
  const carePremium = carePlusPremium(rates, profile.gender, profile.age);
  if (carePremium === null) throw new Error("ไม่พบเบี้ย Care Plus สำหรับอายุที่แจ้ง");

  const tryDhl = (deductible) => {
    const healthPremium = dhlPremium(rates, profile.gender, profile.age, deductible);
    if (healthPremium === null) return null;

    const ridersTotal = healthPremium + carePremium;
    const mainChoice = chooseMainAndPa({ rates, profile, ridersTotal, budget });
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

    if (mainChoice.includePa) items.push(itemPa(rates, mainChoice.paPremium));

    const notes = [
      "หากแอดมิดโรงพยาบาลในเครือ MTL Smile Network ไม่ต้องเสียส่วนต่างค่าห้องตามเงื่อนไขเครือข่าย",
      "โรงพยาบาลคู่สัญญาบางแห่ง ตัวแทนอาจช่วยขอส่วนลดค่าห้องได้",
    ];

    return finalizeQuote({
      profile,
      budget,
      items,
      planType: "dhl",
      planCode: `dhl_5m_${deductible}`,
      notes,
    });
  };

  // เริ่มจากไม่มี deductible ก่อนเสมอ
  const noDeductible = tryDhl("d0");
  if (noDeductible) return noDeductible;

  // ถ้าเกินกรอบงบ และมีสวัสดิการ/เล่มเดิม หรือร้องขอ deductible จึงค่อยใช้ deductible
  const deductibleOptions = eligibleDeductibles(profile);
  if (deductibleOptions === null) {
    return {
      ok: false,
      needsInfo: "groupBenefit",
      question:
        "เพื่อปรับความรับผิดส่วนแรกให้ตรงกับสิทธิเดิม รบกวนแจ้งวงเงินค่ารักษาของประกันกลุ่มหรือกรมธรรม์เดิมประมาณกี่บาทครับ",
    };
  }

  for (const option of deductibleOptions || []) {
    const quote = tryDhl(option);
    if (quote) return quote;
  }

  // Fallback เดิมที่เคยกำหนด: Extra Care Plus Plan 3 + Care Plus + สัญญาหลักขั้นต่ำ
  const ecp = ecpPremium(rates, profile.gender, profile.age, "p3");
  if (ecp !== null) {
    const ridersTotal = ecp + carePremium;
    const mainChoice = chooseMainAndPa({ rates, profile, ridersTotal, budget });
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
          premium: carePremium,
          line:
            `- Care Plus มะเร็งและไตวายเรื้อรัง 5 ล้านบาท/โรค/ปี ` +
            `เหมาจ่ายยามุ่งเป้าและยาภูมิคุ้มกันบำบัด — เบี้ย ${money(carePremium)} บาท/ปี`,
        },
      ];
      if (mainChoice.includePa) items.push(itemPa(rates, mainChoice.paPremium));
      return finalizeQuote({
        profile,
        budget,
        items,
        planType: "ecp",
        planCode: "ecp_p3",
        notes: ["เป็นแผนสำรองเมื่อ D Health Lite ยังเกินกรอบงบที่กำหนด"],
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

function buildEliteQuote(rates, profile) {
  const budget = budgetWindow(profile);
  const elitePlan = profile.wantsOPD || (profile.annualBudget || 0) >= 50000 ? "75m" : "20m";
  const healthPremium = elitePremium(rates, profile.age, elitePlan);
  if (healthPremium === null) throw new Error("ไม่พบเบี้ย Elite Health Plus สำหรับอายุที่แจ้ง");

  const mainChoice = chooseMainAndPa({
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
      plan: elitePlan,
      annualLimit: elitePlan === "75m" ? 75000000 : 20000000,
      premium: healthPremium,
      line:
        `- Elite Health Plus วงเงิน ${elitePlan === "75m" ? "75" : "20"} ล้านบาท/ปี ` +
        `${elitePlan === "75m" ? "พร้อมความคุ้มครอง OPD ตามเงื่อนไขแผน" : "เน้นความคุ้มครอง IPD"} ` +
        `— เบี้ย ${money(healthPremium)} บาท/ปี`,
    },
  ];
  if (mainChoice.includePa) items.push(itemPa(rates, mainChoice.paPremium));

  return finalizeQuote({
    profile,
    budget,
    items,
    planType: "elite",
    planCode: `elite_${elitePlan}`,
    notes: [
      "ไม่แนบ Care Plus เพิ่มเมื่อใช้ Elite Health Plus",
      "ไม่เสนอ Elite 40 ล้านบาท เพราะเบี้ยใกล้เคียงแผน 75 ล้านบาทมาก และเพิ่มเงินอีกเพียงเล็กน้อยได้วงเงินสูงกว่าอย่างชัดเจน",
    ],
  });
}

function validate(profile) {
  const missing = [];
  if (profile.age === null) missing.push("age");
  if (!profile.gender) missing.push("gender");
  if (!profile.occupation) missing.push("occupation");
  if (profile.annualBudget === null && !profile.budgetFlexible) missing.push("annualBudget");
  if (profile.roomBudget === null) missing.push("roomBudget");
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

    const rates = await loadRates(req);
    const useElite = profile.roomBudget >= 10000;
    const quote = useElite
      ? buildEliteQuote(rates, profile)
      : buildDhlQuote(rates, profile);

    return json(res, 200, quote);
  } catch (error) {
    console.error("premium-quote error", error);
    return json(res, 500, {
      ok: false,
      error: error?.message || "คำนวณเบี้ยไม่สำเร็จ",
    });
  }
}

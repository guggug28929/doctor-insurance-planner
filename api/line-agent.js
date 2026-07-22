// Vercel Serverless Function: /api/line-agent.js
// ทุกข้อความลูกค้าผ่าน AI เพื่อทำความเข้าใจบริบท อัปเดตความจำ และสร้างคำตอบ
// ตัวเลขเบี้ยต้องมาจาก /api/premium-quote เท่านั้น

import { brochureKeysForQuote, brochurePrompt } from "../lib/brochures.js";
import { formatLineQuote } from "../lib/line-plan-catalog.js";

const MODEL = process.env.OPENAI_MODEL_LINE || "gpt-5.6-luna";

const PRODUCT_RULES = `
คุณเป็นผู้ช่วยประกันของหมอกึ๊กจากเมืองไทยประกันชีวิต ตอบภาษาไทย สุภาพ กระชับ ลงท้ายครับเสมอ

กฎจัดแผนที่ต้องยึดตาม:
1. งบที่ลูกค้าแจ้งเป็นงบเป้าหมาย คำว่า "ถ้างบถึง" หมายถึงยอดรวมต้องไม่เกินงบเป้าหมาย ไม่ใช่ใช้เพดาน +50% เพื่อยัดความคุ้มครองเพิ่ม
2. ยอมรับยอดรวมสูงกว่างบได้ไม่เกิน 50% เฉพาะเมื่อความคุ้มครองหลักทำให้หลีกเลี่ยงไม่ได้ โดยต้องเลือกชุดที่เกินงบน้อยที่สุด
3. เริ่มจากประกันสุขภาพเป็นหลักก่อน
4. ค่าห้องต่ำกว่า 10,000 บาท: D Health Lite 5 ล้านบาท/ครั้ง + Care Plus มะเร็งและไตวายเรื้อรัง 5 ล้านบาท/โรค/ปี
5. ถ้างบถึง ใช้ Smart Protection 99/20 ทุน 200,000 บาท และเพิ่ม PA Easy Plan 1 เมื่อยังไม่เกินงบ
6. Smart Protection 99/20 ต้องแนบสัญญาอุบัติเหตุหรือโรคร้ายแรงเสมอ ห้ามเสนอแบบเดี่ยว หากงบไม่พอให้ใช้ 99/99 + PA หรือถามปรับงบ
7. หากต้องลดเป็นสัญญาหลัก 99/99 ทุน 100,000 หรือ 50,000 บาท ต้องแนบ PA เสมอ ห้ามเสนอ 99/99 เดี่ยว ๆ
8. เมื่อลูกค้าบอกว่ามีประกันกลุ่ม/กรมธรรม์เดิม ให้ถามวงเงินค่ารักษาเดิมเพียงครั้งเดียวก่อนพิจารณา deductible; ถ้าจำไม่ได้หรือไม่สะดวกบอก ให้เสนอ D Health Lite แบบไม่มีความรับผิดส่วนแรกก่อน และค่อยถามวงเงินเดิมใหม่เมื่อบอกว่าเบี้ยแพงเพื่อเทียบ deductible
9. ถ้ายังไม่ลงตัวจริง ๆ ค่อยใช้ Extra Care Plus Plan 3 + Care Plus เป็นแผนสำรอง
10. ค่าห้องตั้งแต่ 10,000 บาทขึ้นไป: ใช้ Elite Health Plus
11. งบต่ำกว่า 50,000 บาทและไม่ได้ยืนยันว่าต้องการ OPD: Elite Health Plus 20 ล้านบาท
12. หากยืนยันว่าต้องการ OPD ให้เสนอ Elite Health Plus 75 ล้านบาทก่อน เพราะมี OPD เหมาจ่าย 40,000 บาท/ปีในแผน
13. ข้อความ "IPD +/- OPD", "OPD มีก็ได้ไม่มีก็ได้", "เผื่อ OPD" หมายถึง OPD เป็น optional ไม่ใช่การยืนยันว่าต้องการ OPD จึงห้ามบังคับไป Elite 75 ล้านบาท
14. ห้ามเสนอ Elite 40 ล้านบาทเป็นแผนหลัก หากถามเหตุผล ให้ตอบว่าเบี้ยใกล้กับ 75 ล้านบาทมาก เพิ่มอีกประมาณหลักพันบาทก็ได้วงเงิน 75 ล้านบาทซึ่งคุ้มกว่า
15. Elite Health Plus ไม่ต้องแนบ Care Plus
16. OPD รายครั้งและ OPD เหมาจ่ายเป็นสัญญาเพิ่มเติมที่ต้องพ่วงสัญญาหลักประกันชีวิต แต่ไม่ต้องพ่วง D Health Lite หรือ Elite Health Plus; Elite 75 มี OPD ในตัวจึงไม่ต้องซื้อ OPD แยก
17. หากลูกค้าใช้ Elite 20 แล้วต้องการ OPD ให้เสนอ Elite 75 ก่อน; ถ้าลูกค้าบอกเบี้ยแพง ค่อยใช้ QUOTE เปรียบเทียบ Elite 20 + OPD เหมาจ่าย 20,000 บาท/ปีกับ Elite 75 ตามอายุและเพศจริง
17ก. หากค่าห้องต่ำกว่า 10,000 บาทและลูกค้าต้องการ OPD ให้คง D Health Lite + Care Plus ตามงบ แล้วให้ QUOTE คำนวณ OPD รายครั้งก่อน (หรือ OPD เหมาจ่ายเมื่อระบุชัด) จากแผนที่รวมแล้วยังอยู่ในงบ ห้ามย้ายไป Elite 75 ล้านบาทจนเกินงบเพียงเพราะต้องการ OPD
18. ห้ามพูดถึง D Health Plus เพราะปิดการขายแล้ว ใช้ชื่อ D Health Lite เท่านั้น
19. หากลูกค้าระบุชื่อแผนล่าสุดโดยตรง เช่น "เอา Elite 20 ล้าน", "ขอเบี้ย D Health Lite" คำขอล่าสุดต้องมีลำดับสูงกว่ากฎค่าห้องและข้อมูลเก่า
20. ถ้าลูกค้าบอกว่าเบี้ยแพง/เกินงบ ให้จัดใหม่โดยถอดความคุ้มครองเสริมก่อนและเลือกชุดที่ใกล้งบที่สุด ห้ามส่งแผนเดิมซ้ำเฉย ๆ
21. D Health Lite: แอดมิดโรงพยาบาลในเครือ MTL Smile Network ไม่ต้องเสียส่วนต่างค่าห้องตามเงื่อนไขเครือข่าย ส่วนโรงพยาบาลคู่สัญญาบางแห่งตัวแทอาจช่วยขอส่วนลดค่าห้องได้
22. ห้ามแต่งตัวเลขเบี้ย ตัวเลขทุกบาทต้องมาจากเครื่องมือ premium quote
23. ห้ามใช้ Markdown; ลิงก์สำหรับลูกค้าต้องเป็นหน้าแผนภายใต้ https://doctor-insurance.com เท่านั้น
22. หากมีประวัติสุขภาพหรือโรคประจำตัว ห้ามตัดจบหรือปฏิเสธทันที ต้องเก็บข้อมูลที่จำเป็น จัดแผนและแจ้งเบี้ยเบื้องต้นให้เสร็จก่อน
23. หลังเสนอแผนสำหรับผู้มีประวัติสุขภาพแล้ว ให้แจ้งว่าผลรับประกันขึ้นกับบริษัท ปิดผู้ช่วยอัตโนมัติ และส่งต่อให้หมอกึ๊กหรือเจ้าหน้าที่จริงดูแลต่อ
24. เมื่อลูกค้าสนใจโรคร้ายแรง ต้องถามก่อนว่าเน้นค่ารักษา เงินก้อนเจอจ่ายจบ หรือทั้งสองอย่าง
25. ถ้าเน้นค่ารักษา ใช้ D Health Lite + Care Plus หรือ Elite Health Plus โดย Elite ไม่แนบ Care Plus
26. ถ้าเน้นเงินก้อนหรือทั้งสองอย่าง ให้เสนอเปรียบเทียบ CI Perfect Care, Multiple CI, D Care และความคุ้มครองโรคมะเร็งจากตารางจริง
27. ถ้าต้องการความคุ้มครองตั้งครรภ์/คลอดบุตร ให้เพิ่ม Maternity Plus; ถ้าต้องการตรวจสุขภาพ วัคซีน ทันตกรรม หรือสายตา ให้เพิ่ม Well-Being Plus ทั้งสองซื้อเดี่ยวไม่ได้ ต้องแนบ D Health Lite หรือ Elite Health Plus
28. หากกังวลค่าเบี้ย/ค่ารักษาหลังเกษียณ มีสวัสดิการปัจจุบัน หรือเป็นรัฐวิสาหกิจ ให้แนะนำเมืองไทยเฟล็กซี่ โพรเทคชั่น 99/20 ซึ่งชำระ 20 ปี และตั้งแต่อายุ 65 ปีเปลี่ยนทุนคงเหลือเป็นค่ารักษา IPD/OPD ได้ตามเงื่อนไข
29. D Care คือประกันโรคร้ายแรงแบบเงินก้อน เลือกกลุ่มโรคได้ (มะเร็ง หัวใจและหลอดเลือด ปลูกถ่ายอวัยวะ ระบบประสาทและกล้ามเนื้อ อื่น ๆ หรือกลุ่มโรคยอดฮิต) หากถามรายละเอียด D Care ให้ปิดท้ายด้วย https://doctor-insurance.com/plans/d-care
30. หากลูกค้าบอกว่าทุนสัญญาหลัก Smart Protection 99/20 ขั้นต่ำ 200,000 บาทสูงเกินไป ให้ใช้ 99/99 ทุน 100,000 บาทพร้อม PA; CI Perfect Care ทำได้ไม่เกิน 10 เท่าของทุนสัญญาหลัก ดังนั้น 99/99 ทุน 100,000 บาททำ CI Perfect Care ได้ไม่เกิน 1,000,000 บาท
31. หากต้องการออมทรัพย์ลดหย่อนภาษีและไม่เน้นทุนชีวิต ให้เทียบ Smart Link 15/3 และ 15/6 พร้อมเลือกทุนตามงบ
`.trim();

const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: [
        "greeting",
        "insurance_advice",
        "premium_quote",
        "profile_update",
        "general_question",
        "human_handoff",
        "resume_ai",
        "reset",
      ],
    },
    updates: {
      type: "object",
      properties: {
        age: { type: ["number", "null"] },
        gender: { type: ["string", "null"], enum: ["m", "f", null] },
        insuredGenderContext: {
          type: ["string", "null"],
          enum: ["self", "male_known", "female_known", "other_unknown", null],
        },
        occupation: { type: ["string", "null"] },
        annualBudget: { type: ["number", "null"] },
        budgetFlexible: { type: ["boolean", "null"] },
        roomBudget: { type: ["number", "null"] },
        healthStatus: {
          type: ["string", "null"],
          enum: ["none", "has_history", "unknown", null],
        },
        hasGroupBenefit: { type: ["boolean", "null"] },
        groupBenefit: { type: ["number", "null"] },
        groupBenefitAsked: { type: ["boolean", "null"] },
        deductiblePreference: {
          type: ["string", "null"],
          enum: ["yes", "none", "auto", null],
        },
        opdPreference: {
          type: ["string", "null"],
          enum: ["yes", "no", "optional", "unknown", null],
        },
        opdTypePreference: {
          type: ["string", "null"],
          enum: ["auto", "per_visit", "lump_sum", null],
        },
        requestedHealthPlan: {
          type: ["string", "null"],
          enum: ["auto", "dhl", "elite20", "elite75", "ecp", null],
        },
        mainPlanPreference: {
          type: ["string", "null"],
          enum: ["auto", "99_20_200k", "99_99_100k", null],
        },
        quoteScope: {
          type: ["string", "null"],
          enum: ["package", "health_only", null],
        },
        optimizeForBudget: { type: ["boolean", "null"] },
        requestedProduct: {
          type: ["string", "null"],
          enum: ["auto", "critical_comparison", "flexi_99_20", "smart_link_auto", "smart_link_15_3", "smart_link_15_6", null],
        },
        criticalIllnessNeed: {
          type: ["string", "null"],
          enum: ["unknown", "treatment", "lump_sum", "both", null],
        },
        criticalIllnessSumInsured: { type: ["number", "null"] },
        wantsMaternity: { type: ["boolean", "null"] },
        wantsWellBeing: { type: ["boolean", "null"] },
        focus: {
          type: ["array", "null"],
          items: {
            type: "string",
            enum: ["ipd", "opd", "critical_illness", "life", "accident"],
          },
        },
      },
      required: [
        "age",
        "gender",
        "insuredGenderContext",
        "occupation",
        "annualBudget",
        "budgetFlexible",
        "roomBudget",
        "healthStatus",
        "hasGroupBenefit",
        "groupBenefit",
        "groupBenefitAsked",
        "deductiblePreference",
        "opdPreference",
        "opdTypePreference",
        "requestedHealthPlan",
        "mainPlanPreference",
        "quoteScope",
        "optimizeForBudget",
        "requestedProduct",
        "criticalIllnessNeed",
        "criticalIllnessSumInsured",
        "wantsMaternity",
        "wantsWellBeing",
        "focus",
      ],
      additionalProperties: false,
    },
    clearFields: {
      type: "array",
      items: {
        type: "string",
        enum: [
          "age",
          "gender",
          "insuredGenderContext",
          "occupation",
          "annualBudget",
          "budgetFlexible",
          "roomBudget",
          "healthStatus",
          "hasGroupBenefit",
          "groupBenefit",
          "groupBenefitAsked",
          "deductiblePreference",
          "opdPreference",
          "opdTypePreference",
          "requestedHealthPlan",
          "mainPlanPreference",
          "quoteScope",
          "optimizeForBudget",
          "requestedProduct",
          "criticalIllnessNeed",
          "criticalIllnessSumInsured",
          "wantsMaternity",
          "wantsWellBeing",
          "focus",
        ],
      },
    },
    asksForPremium: { type: "boolean" },
    shouldRecommendPlan: { type: "boolean" },
    knowledgeTopics: {
      type: "array",
      items: {
        type: "string",
        enum: [
          "waiting_period",
          "health_exclusions",
          "fax_claim",
          "copayment",
          "general_faq",
        ],
      },
    },
    directReply: { type: "string" },
  },
  required: [
    "intent",
    "updates",
    "clearFields",
    "asksForPremium",
    "shouldRecommendPlan",
    "knowledgeTopics",
    "directReply",
  ],
  additionalProperties: false,
};

function sendJson(res, status, data) {
  res.status(status).json(data);
}

function extractResponseText(result) {
  if (typeof result?.output_text === "string" && result.output_text.trim()) {
    return result.output_text.trim();
  }
  const chunks = [];
  for (const item of result?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && content?.text) chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
}

async function callOpenAI(payload) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = result?.error?.message || `OpenAI HTTP ${response.status}`;
    throw new Error(message);
  }
  return result;
}

function defaultProfile() {
  return {
    version: 9,
    age: null,
    gender: null,
    insuredGenderContext: null,
    occupation: null,
    annualBudget: null,
    budgetFlexible: false,
    roomBudget: null,
    healthStatus: null,
    hasGroupBenefit: null,
    groupBenefit: null,
    groupBenefitAsked: false,
    deductiblePreference: "auto",
    opdPreference: "unknown",
    opdTypePreference: "auto",
    requestedHealthPlan: "auto",
    mainPlanPreference: "auto",
    quoteScope: "package",
    optimizeForBudget: false,
    requestedProduct: "auto",
    criticalIllnessNeed: "unknown",
    criticalIllnessSumInsured: null,
    wantsMaternity: false,
    wantsWellBeing: false,
    focus: [],
    botMode: "ai",
    lastPlanCode: null,
    pendingBrochureKeys: [],
    updatedAt: new Date().toISOString(),
  };
}

function migrateProfile(input = {}) {
  const profile = { ...defaultProfile(), ...input };
  if (!input.opdPreference) {
    if (input.wantsOPD === true) profile.opdPreference = "yes";
    else if (input.wantsOPD === false) profile.opdPreference = "no";
  }
  if (!["auto", "per_visit", "lump_sum"].includes(profile.opdTypePreference)) {
    profile.opdTypePreference = "auto";
  }
  profile.pendingBrochureKeys = Array.isArray(input.pendingBrochureKeys)
    ? input.pendingBrochureKeys
    : [];
  profile.version = 9;
  return profile;
}

function compactText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .trim();
}

function parseThaiNumberWords(value) {
  const phrase = String(value || "").match(
    /(?:(?:ศูนย์|หนึ่ง|เอ็ด|สอง|ยี่|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|ล้าน|แสน|หมื่น|พัน|ร้อย|สิบ)\s*)+/
  )?.[0];
  const tokens = phrase?.match(
    /ศูนย์|หนึ่ง|เอ็ด|สอง|ยี่|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|ล้าน|แสน|หมื่น|พัน|ร้อย|สิบ/g
  );
  if (!tokens?.length) return null;

  const digits = {
    ศูนย์: 0,
    หนึ่ง: 1,
    เอ็ด: 1,
    สอง: 2,
    ยี่: 2,
    สาม: 3,
    สี่: 4,
    ห้า: 5,
    หก: 6,
    เจ็ด: 7,
    แปด: 8,
    เก้า: 9,
  };
  const units = { ล้าน: 1000000, แสน: 100000, หมื่น: 10000, พัน: 1000, ร้อย: 100 };
  let total = 0;
  let currentDigit = null;

  for (const token of tokens) {
    if (Object.hasOwn(digits, token)) {
      currentDigit = digits[token];
    } else if (token === "สิบ") {
      total += (currentDigit ?? 1) * 10;
      currentDigit = null;
    } else {
      total += (currentDigit ?? 1) * units[token];
      currentDigit = null;
    }
  }
  total += currentDigit ?? 0;
  return total > 0 ? total : null;
}

function parseSpokenAmount(value) {
  const text = String(value || "").normalize("NFKC").toLowerCase();
  const match = text.match(/(\d[\d,]*(?:\.\d+)?)\s*(ล้าน|แสน|หมื่น|พัน|k)?/i);
  if (!match) return parseThaiNumberWords(text);

  const base = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(base)) return null;
  const multipliers = { ล้าน: 1000000, แสน: 100000, หมื่น: 10000, พัน: 1000, k: 1000 };
  return Math.round(base * (multipliers[match[2]] || 1));
}

function parseAmountAfterLabel(message, patterns) {
  const text = String(message || "").normalize("NFKC");
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const amount = parseSpokenAmount(match[1]);
    if (amount !== null) return amount;
  }
  return null;
}

function inferAge(message) {
  const text = String(message || "").normalize("NFKC");
  const labeled = text.match(/(?:อายุ|วัย|age)\s*[:=]?\s*([^\n,;/]{1,24})/i);
  const labeledAge = labeled ? parseSpokenAmount(labeled[1]) : null;
  if (Number.isInteger(labeledAge) && labeledAge >= 0 && labeledAge <= 100) return labeledAge;

  const suffixed = text.match(/(?:^|[\s,;/])(\d{1,3})\s*(?:ปี|ขวบ)(?:\s|$|[,.!?])/);
  if (suffixed) {
    const age = Number(suffixed[1]);
    if (age >= 0 && age <= 100) return age;
  }
  return null;
}

function inferExplicitGender(message) {
  const text = String(message || "").normalize("NFKC").toLowerCase();
  if (/ผู้หญิง|เพศ\s*หญิง/.test(text)) return "f";
  if (/ผู้ชาย|เพศ\s*ชาย/.test(text)) return "m";
  if (/(?:^|[\s,;/])(?:หญิง|ผญ|ญ)(?=$|[\s,;/]|\d|อายุ|วัย)/.test(text)) return "f";
  if (/(?:^|[\s,;/])(?:ชาย|ผช|ช)(?=$|[\s,;/]|\d|อายุ|วัย)/.test(text)) return "m";
  return null;
}

function inferPoliteParticleGender(message) {
  const text = String(message || "").normalize("NFKC").trim().toLowerCase();
  if (/(?:คะ|ค่ะ|ขา)[.!?…]*$/.test(text)) return "f";
  if (/(?:ครับ|คับ|ฮะ)[.!?…]*$/.test(text)) return "m";
  return null;
}

function inferInsuredGenderContext(message) {
  const text = compactText(message);
  const hasInsuranceContext = /(?:ทำประกัน|ซื้อประกัน|สนใจประกัน|ประกันสุขภาพ|วางแผน.*ประกัน|ผู้เอาประกัน)/.test(text);
  if (!hasInsuranceContext) return null;

  // These relations remain unambiguous in wording such as "สามีของดิฉัน".
  if (/(?:พ่อ|ลุง|ปู่|ตา|สามี|ผัว|ลูกชาย|พี่ชาย|น้องชาย)/.test(text)) {
    return "male_known";
  }
  if (/(?:แม่|ป้า|ย่า|ยาย|ภรรยา|เมีย|ลูกสาว|พี่สาว|น้องสาว)/.test(text)) {
    return "female_known";
  }
  if (/(?:แฟน|คนรัก|คู่ชีวิต|ทอม|กะเทย|ข้ามเพศ|สาวประเภทสอง)/.test(text)) {
    return "other_unknown";
  }

  // Short relations such as "อา" must be read only after a target reference,
  // otherwise ordinary words such as "อาชีพ" would be misclassified.
  const reference = text.match(/(?:ทำประกันให้|ซื้อให้|ผู้เอาประกัน|สำหรับ|ให้|ของ)(?:คุณ)?(.+)$/);
  if (!reference) return null;
  const relation = reference[1];
  if (/(?:น้า|อา|ญาติ|พี่|น้อง)/.test(relation)) return "other_unknown";
  return null;
}

function inferOccupation(message) {
  const text = String(message || "").normalize("NFKC").trim();
  const labeled = text.match(/(?:อาชีพ|ทำงานเป็น)\s*[:=]?\s*([^\n,;/]{1,50})/i);
  if (labeled) {
    const value = labeled[1]
      .split(/\s+(?=อายุ|เพศ|งบ|ค่าห้อง|สุขภาพ|โรค|ประวัติ|สนใจ|ต้องการ)/i)[0]
      .replace(/(?:ครับ|ค่ะ|คะ)$/i, "")
      .trim();
    if (value) return value;
  }

  const knownOccupations = [
    ["ทันตแพทย์", "ทันตแพทย์"],
    ["สัตวแพทย์", "สัตวแพทย์"],
    ["เภสัชกร", "เภสัชกร"],
    ["พยาบาล", "พยาบาล"],
    ["แพทย์", "แพทย์"],
    ["คุณหมอ", "แพทย์"],
    ["หมอ", "แพทย์"],
    ["วิศวกร", "วิศวกร"],
    ["ข้าราชการ", "ข้าราชการ"],
    ["รัฐวิสาหกิจ", "พนักงานรัฐวิสาหกิจ"],
    ["พนักงานบริษัท", "พนักงานบริษัท"],
    ["ธุรกิจส่วนตัว", "ธุรกิจส่วนตัว"],
    ["ฟรีแลนซ์", "ฟรีแลนซ์"],
    ["ครู", "ครู"],
  ];
  const compact = compactText(text);
  for (const [keyword, occupation] of knownOccupations) {
    if (compact.includes(keyword)) return occupation;
  }
  return null;
}

function inferContextualUpdates(message, current) {
  const compact = compactText(message);
  const updates = {};

  // ลูกค้าสามารถตอบหลายช่องในบอลลูนเดียวได้ ต้องเก็บทุกข้อมูลที่ระบุชัด
  // ก่อนคำนวณ missingFields เพื่อไม่ย้อนถามอายุ เพศ อาชีพ งบ หรือค่าห้องซ้ำ
  const age = inferAge(message);
  const explicitGender = inferExplicitGender(message);
  const politeGender = inferPoliteParticleGender(message);
  const insuredGenderContext = inferInsuredGenderContext(message);
  const occupation = inferOccupation(message);
  const annualBudget = parseAmountAfterLabel(message, [
    /(?:งบ(?:ประมาณ)?(?:ต่อปี|รายปี)?|เบี้ย(?:ที่อยากจ่าย)?(?:ต่อปี|รายปี)|จ่าย(?:เบี้ย)?(?:ไหว)?(?:ปีละ|ต่อปี)|ปีละ)\s*[:=]?\s*([^\n;]+)/i,
  ]);
  const explicitRoomBudget = parseAmountAfterLabel(message, [
    /(?:ค่าห้อง|ห้องพัก|ห้องต่อคืน)\s*(?:ประมาณ|ไม่เกิน|ได้|เอา)?\s*[:=]?\s*([^\n;]+)/i,
  ]);
  if (age !== null) updates.age = age;
  if (insuredGenderContext) updates.insuredGenderContext = insuredGenderContext;
  if (insuredGenderContext === "male_known") {
    updates.gender = "m";
  } else if (insuredGenderContext === "female_known") {
    updates.gender = "f";
  } else if (insuredGenderContext === "other_unknown") {
    // คำลงท้ายของผู้ส่งไม่ใช่เพศของแฟน/น้า/อา จึงห้ามเดา
    updates.gender = null;
  } else if (explicitGender) {
    updates.gender = explicitGender;
    if (!current.insuredGenderContext) updates.insuredGenderContext = "self";
  } else if (current.insuredGenderContext !== "other_unknown" && current.gender === null && politeGender) {
    // ผู้เอาประกันเป็นผู้ส่งเอง: คะ/ค่ะ/ขา และ ครับ/คับ ช่วยลดคำถามซ้ำได้
    updates.gender = politeGender;
    if (!current.insuredGenderContext) updates.insuredGenderContext = "self";
  }
  if (occupation) updates.occupation = occupation;
  if (annualBudget !== null) {
    updates.annualBudget = annualBudget;
    updates.budgetFlexible = false;
  } else if (/ไม่จำกัดงบ|งบไม่จำกัด|ไม่ติดงบ/.test(compact)) {
    updates.budgetFlexible = true;
  }
  if (explicitRoomBudget !== null) updates.roomBudget = explicitRoomBudget;

  if (/มี(?:ประกันกลุ่ม|สวัสดิการบริษัท|สวัสดิการที่ทำงาน|ประกันส่วนตัว|กรมธรรม์(?:สุขภาพ)?เดิม)/.test(compact)) {
    updates.hasGroupBenefit = true;
  }
  if (/ไม่มี(?:ประกันกลุ่ม|สวัสดิการ(?:บริษัท|ที่ทำงาน)?|ประกันส่วนตัว|ประกันสุขภาพเดิม|กรมธรรม์(?:สุขภาพ)?เดิม|สิทธิรักษาเดิม)/.test(compact)) {
    updates.hasGroupBenefit = false;
  }

  const simpleNegative = /^(?:ไม่มี|ไม่มีครับ|ไม่มีค่ะ|ไม่มีคะ|ไม่เคย|no)$/i.test(compact);
  const simplePositive = /^(?:มี|มีครับ|มีค่ะ|มีคะ|ใช่|ใช่ครับ|ใช่ค่ะ|yes)$/i.test(compact);
  if (simpleNegative) {
    if (current.healthStatus === null) updates.healthStatus = "none";
    else if (current.hasGroupBenefit === null) updates.hasGroupBenefit = false;
  } else if (simplePositive) {
    if (current.healthStatus === null) updates.healthStatus = "has_history";
    else if (current.hasGroupBenefit === null) updates.hasGroupBenefit = true;
  }

  if (/จำ(?:วงเงิน)?ไม่ได้|ไม่ทราบ|ไม่แน่ใจ|ไม่สะดวกบอก|ไม่อยากบอก/.test(compact) && current.groupBenefitAsked) {
    updates.deductiblePreference = "none";
  }
  if (/99\s*\/\s*20.*(?:ต่ำ|น้อย|ลด)|ทุน(?:ชีวิต|สัญญาหลัก)?.*(?:200,?000|สองแสน).*(?:สูง|แพง)|ลดทุน(?:ชีวิต|สัญญาหลัก)?/.test(message)) {
    updates.mainPlanPreference = "99_99_100k";
  }
  const roomIsMissing =
    current.requestedHealthPlan === "auto" && current.roomBudget === null;
  const mentionsRoom = /ค่าห้อง|ห้องพัก|ห้องต่อคืน|room/i.test(message);
  const soundsLikeRoomAnswer =
    roomIsMissing &&
    current.annualBudget !== null &&
    (/^(?:เอา)?(?:max|สูงสุด)$/i.test(compact) ||
      /ไม่จำกัด(?:ค่าห้อง|ห้อง)?|ได้หมด(?:เลย)?|เอาmax|เอาสูงสุด/.test(compact) ||
      parseSpokenAmount(message) !== null);

  if ((mentionsRoom || soundsLikeRoomAnswer) && explicitRoomBudget === null) {
    const unlimited = /ไม่จำกัด(?:ค่าห้อง|ห้อง)?|ได้หมด(?:เลย)?|เอาmax|เอาสูงสุด|max/.test(
      compact
    );
    const amount = parseSpokenAmount(message);
    if (unlimited) updates.roomBudget = 30000;
    else if (amount !== null) updates.roomBudget = amount;

    // คำตอบเรื่องค่าห้องต้องไม่ย้อนกลับไปแก้งบรายปีที่เก็บไว้แล้ว
    if (!/งบ|ต่อปี|รายปี/.test(compact) && current.annualBudget !== null) {
      updates.annualBudget = current.annualBudget;
      updates.budgetFlexible = current.budgetFlexible;
    }
  }

  // คำปฏิเสธเรื่องสุขภาพต้องชนะข้อมูลเดิมเสมอ เช่นลูกค้าอาจเคยพิมพ์
  // คลุมเครือแล้วมาชี้แจงภายหลังว่า "ไม่มีโรคประจำตัว". ห้ามปล่อยให้
  // คำย่อย "มีโรคประจำตัว" ในประโยคนี้ไปตั้งสถานะเป็น has_history.
  const explicitlyNoHealthHistory =
    /ไม่มีโรคประจำตัว|ไม่มีโรค|ไม่มีประวัติ(?:สุขภาพ|ผ่าตัด|นอนโรงพยาบาล)?|ไม่เคย(?:ผ่าตัด|นอนโรงพยาบาล|แอดมิต|ใช้ยาประจำ|กินยาประจำ)|สุขภาพ(?:แข็งแรง|ปกติ|ดี)|ผลตรวจปกติ/.test(
      compact
    );
  if (explicitlyNoHealthHistory) {
    updates.healthStatus = "none";
  } else if (
    /(?:^|[^ไ])มีโรคประจำตัว|มีประวัติ(?:สุขภาพ|ผ่าตัด|นอนโรงพยาบาล)|เคยผ่าตัด|เคยนอนโรงพยาบาล|ใช้ยาประจำ|กินยาประจำ|ผลตรวจ.*ผิดปกติ/.test(
      compact
    )
  ) {
    updates.healthStatus = "has_history";
  }

  const criticalMention = /โรคร้าย(?:แรง)?|มะเร็ง|ci(?:perfect|\b)/i.test(message);
  if (criticalMention) {
    updates.focus = [...new Set([...(current.focus || []), "critical_illness"])];
    if (/ทั้งสอง|ทั้งคู่|ค่ารักษา.*เงินก้อน|เงินก้อน.*ค่ารักษา/.test(compact)) {
      updates.criticalIllnessNeed = "both";
      updates.requestedProduct = "auto";
    } else if (/เจอจ่ายจบ|เงินก้อน|ชดเชยรายได้/.test(compact)) {
      updates.criticalIllnessNeed = "lump_sum";
      updates.requestedProduct = "critical_comparison";
    } else if (/เน้นค่ารักษา|ค่ารักษาพยาบาล|ยามุ่งเป้า/.test(compact)) {
      updates.criticalIllnessNeed = "treatment";
      updates.requestedProduct = "auto";
    } else if (!current.criticalIllnessNeed || current.criticalIllnessNeed === "unknown") {
      updates.criticalIllnessNeed = "unknown";
    }
    const capital = parseSpokenAmount(message);
    if (/ทุน|เงินก้อน/.test(compact) && capital >= 100000) {
      updates.criticalIllnessSumInsured = capital;
    }
  } else if ((current.focus || []).includes("critical_illness")) {
    if (/ทั้งสอง|ทั้งคู่/.test(compact)) {
      updates.criticalIllnessNeed = "both";
      updates.requestedProduct = "auto";
    } else if (/เจอจ่ายจบ|เงินก้อน/.test(compact)) {
      updates.criticalIllnessNeed = "lump_sum";
      updates.requestedProduct = "critical_comparison";
    } else if (/ค่ารักษา|รักษาพยาบาล/.test(compact)) {
      updates.criticalIllnessNeed = "treatment";
      updates.requestedProduct = "auto";
    }
  }

  if (/ตั้งครรภ์|คลอดบุตร|ค่าคลอด|วางแผนมีลูก|maternity/i.test(message)) {
    updates.wantsMaternity = true;
    updates.requestedProduct = "auto";
  }
  if (/ตรวจสุขภาพ|วัคซีน|ทันตกรรม|ทำฟัน|สายตา|well.?being/i.test(message)) {
    updates.wantsWellBeing = true;
    updates.requestedProduct = "auto";
  }

  if (
    /หลังเกษียณ|ตอนเกษียณ|หลังอายุ65|เบี้ยตอนแก่|จ่ายเบี้ย.*ไม่ไหว|รัฐวิสาหกิจ/.test(compact) &&
    /ค่ารักษา|สุขภาพ|สวัสดิการ|รัฐวิสาหกิจ|เบี้ย/.test(compact)
  ) {
    updates.requestedProduct = "flexi_99_20";
  }

  if (/15\s*\/\s*3/.test(message)) updates.requestedProduct = "smart_link_15_3";
  else if (/15\s*\/\s*6/.test(message)) updates.requestedProduct = "smart_link_15_6";
  else if (/ออมทรัพย์|สะสมทรัพย์|ลดหย่อนภาษี/.test(compact) && /ไม่เน้นทุนชีวิต|เน้นออม|ออมทรัพย์|สะสมทรัพย์/.test(compact)) {
    updates.requestedProduct = "smart_link_auto";
  }

  if (/สนใจ.*(?:ประกันสุขภาพ|ค่ารักษา)|(?:ประกันสุขภาพ|ค่ารักษา).*(?:แนะนำ|สนใจ|ต้องการ)|\bipd\b/i.test(message)) {
    updates.focus = [...new Set([...(updates.focus || current.focus || []), "ipd"])];
    if (!updates.requestedProduct) updates.requestedProduct = "auto";
  }

  if (/d\s*health(?:\s*lite)?|ดี\s*เฮลท์(?:\s*ไลท์)?/i.test(message)) {
    updates.requestedHealthPlan = "dhl";
  } else if (/elite.*75|อีลิท.*75/i.test(message)) {
    updates.requestedHealthPlan = "elite75";
  } else if (/elite.*20|อีลิท.*20/i.test(message)) {
    updates.requestedHealthPlan = "elite20";
  }

  if (/(?:ipd\s*(?:\+\/-|±)\s*opd|opd(?:มีก็ได้|ก็ได้ไม่เอาก็ได้)|เผื่อopd)/i.test(compact)) {
    updates.opdPreference = "optional";
  } else if (/(?:ไม่เอาopd|เอาแค่ipd|ไม่ต้องการopd)/i.test(compact)) {
    updates.opdPreference = "no";
  } else if (/(?:opd|ผู้ป่วยนอก)/i.test(message)) {
    updates.opdPreference = "yes";
    updates.focus = [...new Set([...(updates.focus || current.focus || []), "opd"])];
  }

  if (/(?:opd|ผู้ป่วยนอก).*(?:รายครั้ง|ต่อครั้ง)|(?:รายครั้ง|ต่อครั้ง).*(?:opd|ผู้ป่วยนอก)/i.test(message)) {
    updates.opdTypePreference = "per_visit";
  } else if (/(?:opd|ผู้ป่วยนอก).*(?:เหมาจ่าย|วงเงิน(?:ต่อ)?ปี)|(?:เหมาจ่าย|วงเงิน(?:ต่อ)?ปี).*(?:opd|ผู้ป่วยนอก)/i.test(message)) {
    updates.opdTypePreference = "lump_sum";
  }

  return updates;
}

function canClearProfileField(message, field) {
  const text = compactText(message);
  if (!/(?:ล้าง|ลืม|ยกเลิก|ไม่ใช้ข้อมูลเดิม|ขอแก้|แก้ข้อมูล|แก้ไขข้อมูล)/.test(text)) {
    return false;
  }
  const labels = {
    age: /อายุ/,
    gender: /เพศ/,
    occupation: /อาชีพ|งาน/,
    annualBudget: /งบ|เบี้ย/,
    roomBudget: /ห้อง/,
    healthStatus: /สุขภาพ|โรค|ประวัติ/,
    hasGroupBenefit: /สวัสดิการ|ประกันกลุ่ม|ประกันเดิม/,
  };
  return labels[field]?.test(text) || false;
}

function mergeProfile(current, analysis, message, contextualUpdates = null) {
  const next = migrateProfile(current);
  for (const field of analysis.clearFields || []) {
    // โมเดลไม่มีสิทธิ์ล้างข้อมูลที่ยืนยันแล้วจากข้อความทั่วไป เช่น "อาชีพแพทย์"
    // ยอมให้ล้างเฉพาะเมื่อลูกค้าบอกชัดว่าต้องการแก้/ล้างข้อมูลช่องนั้นเท่านั้น
    if (!canClearProfileField(message, field)) continue;
    if (field === "focus") next[field] = [];
    else if (["budgetFlexible", "optimizeForBudget", "wantsMaternity", "wantsWellBeing"].includes(field)) next[field] = false;
    else if (field === "deductiblePreference") next[field] = "auto";
    else if (field === "opdPreference") next[field] = "unknown";
    else if (field === "opdTypePreference") next[field] = "auto";
    else if (field === "requestedHealthPlan") next[field] = "auto";
    else if (field === "mainPlanPreference") next[field] = "auto";
    else if (field === "requestedProduct") next[field] = "auto";
    else if (field === "criticalIllnessNeed") next[field] = "unknown";
    else if (field === "quoteScope") next[field] = "package";
    else next[field] = null;
  }

  const explicitGender = inferExplicitGender(message);
  for (const [field, value] of Object.entries(analysis.updates || {})) {
    if (value === null || value === undefined) continue;
    // คำลงท้ายของข้อความใหม่ไม่อาจลบหรือสลับเพศที่ลูกค้ายืนยันไว้แล้วได้
    if (field === "gender" && current.gender && !explicitGender) continue;
    next[field] = value;
  }

  // กฎตามบริบททำหน้าที่เป็น safety net เมื่อคำตอบลูกค้าไม่ใช่ตัวเลขล้วน
  // เช่น "ไม่จำกัดค่าห้อง", "ได้หมด", "เอา max" หรือ "ค่าห้อง 30,000"
  const contextual = contextualUpdates || inferContextualUpdates(message, current);
  if (next.insuredGenderContext === "other_unknown" && !explicitGender && contextual.gender === undefined) {
    // อย่าให้ AI เดาเพศแฟน/น้า/อาจากคำว่า ครับ/ค่ะ ของผู้ส่ง
    next.gender = current.gender;
  }
  Object.assign(next, contextual);

  next.focus = Array.isArray(next.focus) ? [...new Set(next.focus)] : [];
  next.updatedAt = new Date().toISOString();
  return next;
}

function missingFields(profile) {
  const missing = [];
  if ((profile.focus || []).includes("critical_illness") && profile.criticalIllnessNeed === "unknown") {
    missing.push("criticalIllnessNeed");
    return missing;
  }
  if (profile.age === null) missing.push("age");
  if (profile.requestedProduct !== "smart_link_auto" && !profile.requestedProduct.startsWith("smart_link_15_") && !profile.gender) missing.push("gender");
  const healthFlow = profile.requestedProduct === "auto";
  if (healthFlow && !profile.occupation) missing.push("occupation");
  if (profile.annualBudget === null && profile.budgetFlexible !== true) {
    missing.push("annualBudget");
  }
  if (healthFlow && profile.requestedHealthPlan === "auto" && profile.roomBudget === null) {
    missing.push("roomBudget");
  }
  if (healthFlow && !profile.healthStatus) missing.push("healthStatus");
  if (healthFlow && profile.hasGroupBenefit === null) missing.push("hasGroupBenefit");
  if (healthFlow && profile.hasGroupBenefit === true && profile.groupBenefit === null && profile.deductiblePreference !== "none" && !profile.groupBenefitAsked) missing.push("groupBenefit");
  return missing;
}

const FIELD_QUESTIONS = {
  age: "รบกวนแจ้งอายุปัจจุบันครับ",
  gender: "รบกวนแจ้งเพศครับ",
  occupation: "รบกวนแจ้งอาชีพครับ",
  annualBudget: "รบกวนแจ้งงบประมาณที่ต้องการจ่ายต่อปีครับ หากไม่จำกัดงบแจ้งว่าไม่จำกัดงบได้ครับ",
  roomBudget: "ต้องการค่าห้องประมาณกี่บาทต่อคืนครับ",
  healthStatus: "มีโรคประจำตัว ประวัติผ่าตัด นอนโรงพยาบาล ใช้ยาประจำ หรือผลตรวจผิดปกติหรือไม่ครับ",
  hasGroupBenefit: "ปัจจุบันมีประกันกลุ่ม สวัสดิการบริษัท หรือกรมธรรม์สุขภาพเดิมอยู่หรือไม่ครับ",
  groupBenefit: "วงเงินค่ารักษาของประกันกลุ่มหรือกรมธรรม์เดิมประมาณกี่บาทครับ",
  criticalIllnessNeed: "ถ้ากังวลโรคร้ายแรง ต้องการเน้นค่ารักษาพยาบาล เงินก้อนแบบเจอจ่ายจบ หรือทั้งสองอย่างครับ",
};

function fieldQuestion(field, profile) {
  if (field === "gender" && profile.insuredGenderContext === "other_unknown") {
    return "รบกวนแจ้งเพศตามเอกสารที่ใช้สมัครของผู้เอาประกันครับ";
  }
  return FIELD_QUESTIONS[field];
}

async function analyzeTurn(message, profile) {
  const instructions = `
${PRODUCT_RULES}

หน้าที่ของคุณรอบนี้:
- อ่านข้อความล่าสุดร่วมกับ CURRENT PROFILE แล้วส่ง JSON ตาม schema เท่านั้น
- เข้าใจภาษาพูด คำย่อ คำสะกดผิด และตัวเลข เช่น 20k, 5พัน, 1แสน
- ข้อความหนึ่งบอลลูนอาจตอบหลายคำถามพร้อมกัน ต้องตรวจทุกประโยคและใส่ทุกข้อเท็จจริงที่พบลงใน updates ห้ามเลือกเก็บเพียงช่องเดียว
- ตัวอย่าง "ญ 30 ปี ไม่มีโรคประจำตัว อาชีพแพทย์ งบ30,000/ปี ค่าห้อง4,000 สนใจประกันสุขภาพ" ต้องอัปเดต gender=f, age=30, healthStatus=none, occupation=แพทย์, annualBudget=30000, roomBudget=4000, focus=["ipd"] พร้อมกัน
- คำที่มีความหมายใกล้กันต้องเข้าใจ เช่น ญ/หญิง/ผู้หญิง/ผญ, ช/ชาย/ผู้ชาย/ผช, หมอ/แพทย์, สุขภาพปกติ/ไม่มีประวัติ/ไม่เคยผ่าตัด และงบปีละ/งบต่อปี/จ่ายไหวปีละ
- หากผู้เอาประกันเป็นผู้ส่งเอง คำลงท้าย คะ/ค่ะ/ขา ให้ตีความเพศหญิง และ ครับ/คับ/ฮะ ให้ตีความเพศชายเมื่อยังไม่ทราบเพศ
- หากซื้อให้พ่อ/ลุง/ปู่/ตา/สามี/ผัว/ลูกชาย/พี่ชาย/น้องชาย ให้ตั้ง gender=m และห้ามถามเพศซ้ำ
- หากซื้อให้แม่/ป้า/ย่า/ยาย/ภรรยา/เมีย/ลูกสาว/พี่สาว/น้องสาว ให้ตั้ง gender=f และห้ามถามเพศซ้ำ
- หากซื้อให้แฟน/คนรัก/คู่ชีวิต/น้า/อา/ญาติ หรือผู้มีความหลากหลายทางเพศ ห้ามเดาจากคำลงท้ายของผู้ส่ง ให้ถามเพศตามเอกสารที่ใช้สมัครของผู้เอาประกันเพียงครั้งเดียว
- ห้ามล้างหรือเปลี่ยนเพศ อายุ อาชีพ งบ ค่าห้อง หรือสุขภาพที่ CURRENT PROFILE มีอยู่แล้ว เว้นแต่ลูกค้าบอกแก้ข้อมูลช่องนั้นอย่างชัดเจน
- ต้องตีความคำตอบตามข้อมูลที่ยังขาดใน CURRENT PROFILE ไม่ใช่ดูเฉพาะรูปแบบข้อความ
- คำตอบสั้น "ไม่มี" ให้ผูกกับคำถามที่ยังขาดตามลำดับ: ถ้ายังขาด healthStatus หมายถึงไม่มีประวัติสุขภาพ; ถ้ามี healthStatus แล้วแต่ยังขาด hasGroupBenefit หมายถึงไม่มีประกันกลุ่มหรือสวัสดิการเดิม
- หลังวิเคราะห์ครบทั้งบอลลูน ให้ถามเฉพาะช่องที่ยังไม่มีจริง ๆ และห้ามถามอายุ เพศ อาชีพ งบ ค่าห้อง หรือประวัติสุขภาพที่ลูกค้าเขียนไว้แล้ว
- ถ้า roomBudget ยังว่าง คำว่า "ไม่จำกัดค่าห้อง", "ได้หมด", "เอา max", "เอาสูงสุด" หมายถึงต้องการค่าห้องระดับสูงสุด และห้ามถามค่าห้องซ้ำ
- ถ้า roomBudget ยังว่างและงบรายปีมีแล้ว ข้อความตัวเลขล้วนหรือ "ค่าห้อง 30,000" ให้ถือเป็น roomBudget ไม่ใช่ annualBudget รอบใหม่
- ลูกค้าไม่จำเป็นต้องตอบเป็นตัวเลขล้วน เช่น "งั้นเอา 30,000", "เอา max", "ไม่จำกัด" ต้องสรุปความหมายตามคำถามล่าสุด
- ไม่มีโรคประจำตัว, ไม่มีประวัติสุขภาพ, สุขภาพแข็งแรง, ผลตรวจปกติ = healthStatus none
- มีโรคประจำตัว, เคยผ่าตัด, เคยนอนโรงพยาบาล, ใช้ยาประจำ หรือผลตรวจผิดปกติ = healthStatus has_history แต่ยังต้องเก็บข้อมูลและเสนอแผนก่อนส่งต่อเจ้าหน้าที่
- ห้ามถามข้อมูลที่มีใน CURRENT PROFILE แล้ว เว้นแต่ลูกค้าบอกว่าขอแก้ไข
- ถ้าลูกค้าบอกว่ามีประกันส่วนตัว/ประกันกลุ่ม/สวัสดิการเดิม ให้ hasGroupBenefit true แม้ไม่ได้ใช้คำว่า "ประกันกลุ่ม" และถามวงเงินเดิมเพียงครั้งเดียว
- ถ้าลูกค้าตอบว่าจำวงเงินเดิมไม่ได้ ไม่ทราบ หรือไม่สะดวกบอก หลังถูกถามวงเงิน ให้ deductiblePreference none; ห้ามถามวงเงินซ้ำ และเสนอแบบไม่มี Deductible ก่อน
- "IPD +/- OPD", "OPD มีก็ได้ไม่มีก็ได้", "เอา OPD ก็ได้ไม่เอาก็ได้" = opdPreference optional ห้ามตั้งเป็น yes
- "ไม่เอา OPD", "เอาแค่ IPD" = opdPreference no
- "ต้องการ OPD", "เอา OPD" = opdPreference yes
- "OPD รายครั้ง" หรือ "OPD ต่อครั้ง" = opdTypePreference per_visit; "OPD เหมาจ่าย" = opdTypePreference lump_sum; หากบอกเพียง OPD ให้ opdTypePreference auto
- หากลูกค้าระบุ D Health, D Health Lite, ดีเฮลท์ หรือขอเบี้ย D Health ให้ requestedHealthPlan dhl โดยคำขอล่าสุดชนะ roomBudget เดิม
- หากระบุ Elite 20 ล้าน ให้ requestedHealthPlan elite20 หากระบุ Elite 75 ล้าน ให้ elite75
- หากพูดว่า "เบี้ยแพง", "เกินงบ", "ลดเบี้ย", "จัดใหม่ให้ถูกลง" ให้ optimizeForBudget true, asksForPremium true, shouldRecommendPlan true และตั้ง requestedHealthPlan auto เว้นแต่ข้อความเดียวกันระบุชื่อแผนชัดเจน
- หากลูกค้าบอก "ไม่เอา OPD ก็ได้" หลังเคยเสนอ Elite 75 ให้ตั้ง requestedHealthPlan auto เพื่อเปิดทางให้ระบบเลือก Elite 20
- OPD รายครั้งและ OPD เหมาจ่ายพ่วงสัญญาหลักประกันชีวิตได้ ไม่ต้องพ่วง D Health Lite หรือ Elite; Elite 75 มี OPD 40,000 บาท/ปีในตัว
- หากค่าห้องต่ำกว่า 10,000 บาทและยืนยันต้องการ OPD ให้คง D Health Lite + Care Plus ตามงบ แล้วให้ QUOTE เลือก OPD รายครั้งที่รวมแล้วยังอยู่ในงบก่อน; ถ้าลูกค้าระบุว่าเอา OPD เหมาจ่ายจึงเลือกแบบเหมาจ่าย ห้ามเปลี่ยนไป Elite 75 ที่เกินงบ
- หากลูกค้าบอกว่า Elite 20 + OPD หรือมี Elite 20 แล้วอยากได้ OPD ให้เสนอ Elite 75 ก่อน; เมื่อบอกว่าเบี้ยแพง ให้ optimizeForBudget true เพื่อให้ QUOTE เปรียบเทียบ Elite 20 + OPD เหมาจ่าย 20,000 กับ Elite 75
- หากลูกค้าบ่นว่าทุนหลัก Smart Protection 99/20 ขั้นต่ำ 200,000 บาทสูงเกินไป ให้ mainPlanPreference 99_99_100k
- หากสนใจโรคร้ายแรงแต่ยังไม่บอกประเภท ให้ criticalIllnessNeed unknown และอย่าเพิ่งเลือกแผน ต้องถามว่าเน้นค่ารักษา เงินก้อน หรือทั้งสอง
- ถ้าเน้นค่ารักษา ให้ criticalIllnessNeed treatment และ requestedProduct auto
- ถ้าเน้นเงินก้อน/เจอจ่ายจบ ให้ criticalIllnessNeed lump_sum และ requestedProduct critical_comparison
- ถ้าต้องการทั้งค่ารักษาและเงินก้อน ให้ criticalIllnessNeed both และ requestedProduct auto
- ถ้าพูดถึงตั้งครรภ์ คลอดบุตร ค่าคลอด หรือวางแผนมีลูก ให้ wantsMaternity true
- ถ้าพูดถึงตรวจสุขภาพ วัคซีน ทันตกรรม ทำฟัน หรือสายตา ให้ wantsWellBeing true
- ถ้ากังวลเบี้ยหรือค่ารักษาหลังเกษียณ มีสวัสดิการตอนทำงาน หรือเป็นรัฐวิสาหกิจ ให้ requestedProduct flexi_99_20
- ถ้าต้องการออมทรัพย์ลดหย่อนภาษีและไม่เน้นทุนชีวิต ให้ requestedProduct smart_link_auto; ถ้าระบุ 15/3 หรือ 15/6 ให้เลือกค่าที่ตรงกัน
- หากถามเฉพาะเบี้ยของตัวแผนสุขภาพ เช่น "เฉพาะเบี้ย D Health Lite เท่าไร" ให้ quoteScope health_only มิฉะนั้นใช้ package
- หากถามเบี้ย ราคา ปีละเท่าไร รวมเท่าไร หรือขอใบเสนอราคา ให้ asksForPremium true
- หากขอแนะนำแผน ให้ shouldRecommendPlan true
- หากขอคุยกับเจ้าหน้าที่ ให้ intent human_handoff
- ใส่ knowledgeTopics ทุกหัวข้อความรู้ที่เกี่ยวข้องกับคำถามล่าสุด เพื่อให้ระบบแนบลิงก์อ่านต่อ:
  - waiting_period เมื่อถามระยะรอคอย 30/120/180 วัน โรคที่ก่อตัวนาน หรือถามโรคเรื้อรังใน OPD เช่น ภูมิแพ้ โรคกระเพาะ เบาหวาน ความดัน หัวใจ ไทรอยด์ หรือลมชัก
  - health_exclusions เมื่อถามข้อยกเว้น 21 ข้อ สิ่งที่ไม่คุ้มครอง หรือการเว้นโรค
  - fax_claim เมื่อถาม Fax Claim, Direct Claim, โรงพยาบาลคู่สัญญา, การสำรองจ่าย, Pre-claim หรือการสืบประวัติเพื่อเคลม
  - copayment เมื่อถาม Copayment, ร่วมจ่ายปีต่ออายุ, Simple Disease หรือเกณฑ์เคลม 200%/400%
  - general_faq เมื่อขอรวม FAQ หรือความรู้ประกันสุขภาพแบบรวม
- knowledgeTopics เป็น array และใส่ได้หลายหัวข้อ หากไม่เกี่ยวข้องให้ส่ง []
- directReply ห้ามแต่งตัวเลขเบี้ย
`.trim();

  const result = await callOpenAI({
    model: MODEL,
    reasoning: { effort: "low" },
    max_output_tokens: 1800,
    store: false,
    instructions,
    input: `CURRENT PROFILE:\n${JSON.stringify(profile)}\n\nข้อความล่าสุดของลูกค้า:\n${message}`,
    text: {
      format: {
        type: "json_schema",
        name: "line_insurance_turn_v6",
        strict: true,
        schema: ANALYSIS_SCHEMA,
      },
    },
  });

  return JSON.parse(extractResponseText(result));
}

function quoteFallbackReply(quote) {
  return formatLineQuote(quote);
}

function replyMatchesQuote(reply, quote) {
  if (!quote?.ok) return true;
  const text = String(reply || "");
  const hasDhl = quote.planType === "dhl" || quote.planType === "ecp";
  const hasElite = quote.planType === "elite";

  if (/D\s*Health\s*Plus/i.test(text)) return false;
  if (hasDhl && /Elite\s*Health\s*Plus/i.test(text)) return false;
  if (hasElite && /D\s*Health\s*Lite/i.test(text)) return false;
  if (hasDhl && !/D\s*Health\s*Lite|Extra\s*Care\s*Plus/i.test(text)) return false;
  if (hasElite && !/Elite\s*Health\s*Plus/i.test(text)) return false;
  if (quote.totalPremium !== null && quote.totalPremium !== undefined) {
    if (!text.includes(String(Math.round(quote.totalPremium).toLocaleString("th-TH")))) return false;
  }
  return true;
}

function appendDcareDetailLink(reply, message) {
  const asksDetail = /d\s*care|ดี\s*แคร์/i.test(message) && /(?:มีโรค|โรคอะไร|ต่างกัน|รายละเอียด|คุ้มครอง|กลุ่มโรค)/.test(message);
  if (!asksDetail || /doctor-insurance\.com/i.test(reply)) return reply;
  return `${String(reply || "").trim()}\n\nD Care เป็นประกันโรคร้ายแรงแบบเงินก้อนที่เลือกกลุ่มโรคได้ครับ ดูรายละเอียดเพิ่มเติมได้ที่ https://doctor-insurance.com/plans/d-care`;
}

const KNOWLEDGE_LINKS = Object.freeze({
  waiting_period: {
    label: "ระยะรอคอย",
    url: "https://www.doctor-insurance.com/health-knowledge#waiting-period",
  },
  health_exclusions: {
    label: "ข้อยกเว้นประกันสุขภาพ 21 ข้อ",
    url: "https://www.doctor-insurance.com/health-knowledge#health-exclusions",
  },
  fax_claim: {
    label: "การ Fax Claim",
    url: "https://www.doctor-insurance.com/health-knowledge#fax-claim",
  },
  copayment: {
    label: "เงื่อนไข Copayment",
    url: "https://www.doctor-insurance.com/health-knowledge#copayment",
  },
  general_faq: {
    label: "รวมคำถามยอดฮิตเกี่ยวกับประกัน",
    url: "https://www.doctor-insurance.com/health-knowledge",
  },
});

const KNOWLEDGE_TOPIC_ORDER = [
  "waiting_period",
  "health_exclusions",
  "fax_claim",
  "copayment",
  "general_faq",
];

function inferKnowledgeTopics(message) {
  const text = String(message || "").toLowerCase().replace(/\s+/g, " ").trim();
  const topics = new Set();
  const chronicOpd =
    /(?:opd|ผู้ป่วยนอก).*(?:ภูมิแพ้|กระเพาะ|เบาหวาน|ความดัน|หัวใจ|ไทรอยด์|ลมชัก)/i.test(text) ||
    /(?:ภูมิแพ้|กระเพาะ|เบาหวาน|ความดัน|หัวใจ|ไทรอยด์|ลมชัก).*(?:opd|ผู้ป่วยนอก)/i.test(text);

  if (
    /ระยะ(?:เวลา)?รอคอย|waiting\s*period|รอ\s*(?:30|120|180)\s*วัน|ก่อตัวนาน|ฟักตัวนาน/i.test(text) ||
    chronicOpd
  ) {
    topics.add("waiting_period");
  }
  if (/ข้อยกเว้น|21\s*ข้อ|ไม่คุ้มครอง|เว้นโรค|ยกเว้นโรค/i.test(text)) {
    topics.add("health_exclusions");
  }
  if (
    /แฟกซ์\s*เคลม|fax\s*claim|direct\s*claim|pre[-\s]?(?:claim|authorization)|สำรองจ่าย|โรงพยาบาลคู่สัญญา|สืบประวัติ.*(?:เคลม|90\s*วัน)/i.test(
      text
    )
  ) {
    topics.add("fax_claim");
  }
  if (
    /co[-\s]?pay(?:ment)?|โค\s*เพย์|ร่วมจ่าย(?:ในปีต่ออายุ|ปีต่ออายุ|30%|50%)|simple\s*disease|ยอดเคลม.*(?:200%|400%)/i.test(
      text
    )
  ) {
    topics.add("copayment");
  }
  if (/รวมคำถาม|คำถามยอดฮิต|faq|ความรู้(?:ด้าน)?ประกันสุขภาพ/i.test(text)) {
    topics.add("general_faq");
  }

  return KNOWLEDGE_TOPIC_ORDER.filter((topic) => topics.has(topic));
}

function knowledgeTopicsForTurn(analysis, message) {
  const topics = new Set([
    ...(Array.isArray(analysis?.knowledgeTopics) ? analysis.knowledgeTopics : []),
    ...inferKnowledgeTopics(message),
  ]);
  for (const topic of [...topics]) {
    if (!KNOWLEDGE_LINKS[topic]) topics.delete(topic);
  }
  if (topics.size > 1) topics.delete("general_faq");
  return KNOWLEDGE_TOPIC_ORDER.filter((topic) => topics.has(topic));
}

function appendKnowledgeLinks(reply, analysis, message) {
  const base = String(reply || "").trim();
  const lines = knowledgeTopicsForTurn(analysis, message)
    .map((topic) => KNOWLEDGE_LINKS[topic])
    .filter((item) => !base.includes(item.url))
    .map(
      (item) =>
        "ดูรายละเอียดเรื่อง" + item.label + "เพิ่มเติมได้ที่ " + item.url + " ครับ"
    );
  return lines.length ? base + "\n\n" + lines.join("\n") : base;
}

const HEALTH_HANDOFF_NOTE =
  "หมายเหตุ: เนื่องจากมีประวัติสุขภาพหรือโรคประจำตัว แผนและเบี้ยข้างต้นเป็นการวางแผนเบื้องต้น ผลรับประกันขึ้นอยู่กับการพิจารณาของบริษัทครับ จากนี้ผมขอปิดผู้ช่วยอัตโนมัติชั่วคราว และให้คุณหมอกึ๊กหรือเจ้าหน้าที่ติดต่อกลับเพื่อดูแลรายละเอียดต่อครับ";

function appendHealthHandoff(reply) {
  const paragraphs = String(reply || "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .filter(
      (paragraph) =>
        !/ปิด(?:การทำงานของ)?ผู้ช่วยอัตโนมัติ|ส่งต่อให้.*(?:หมอกึ๊ก|เจ้าหน้าที่)|ผล.*รับประกัน.*บริษัท/.test(
          paragraph
        )
    );

  return [...paragraphs, HEALTH_HANDOFF_NOTE].join("\n\n");
}

async function writeReply({ message, profile, analysis, quote = null, forcedQuestion = null }) {
  // การวิเคราะห์ข้อความยังใช้ AI แต่คำตอบใบเสนอใช้ formatter แบบ deterministic
  // เพื่อรับประกันว่าชื่อ คำบรรยาย เบี้ย และลิงก์ตรงกับรายการจากเครื่องคำนวณทุกครั้ง
  if (quote?.ok) {
    return appendKnowledgeLinks(quoteFallbackReply(quote), analysis, message);
  }

  const instructions = `
${PRODUCT_RULES}

สร้างคำตอบ LINE OA:
- คำขอล่าสุดของลูกค้ามีลำดับสูงสุด
- ใช้ข้อมูลสะสมเดิมและห้ามถามซ้ำ
- ถ้ามี forcedQuestion ให้ถามเพียงเรื่องนั้น
- ถ้ามี QUOTE ให้ใช้แผน รายการ และตัวเลขจาก QUOTE เท่านั้น ห้ามอ้างแผนก่อนหน้า ห้ามเปลี่ยนชื่อแผน และห้ามเติมตัวเลข
- ถ้าลูกค้าขอ D Health Lite แต่ QUOTE เป็น D Health Lite ต้องตอบ D Health Lite ห้ามย้อนกลับไป Elite
- ถ้าลูกค้าขอ Elite 20 แต่ QUOTE เป็น Elite 20 ต้องทำตามตรง ๆ
- ถ้า healthStatus เป็น has_history ต้องเสนอแผนจาก QUOTE ให้ครบก่อน ห้ามตอบเพียงว่าจะส่งต่อเจ้าหน้าที่
- ถ้า healthStatus เป็น has_history ไม่ต้องถามรายละเอียดโรคเพิ่มและไม่ต้องเขียนข้อความปิดบอตหรือส่งต่อเอง ระบบจะเติมข้อความมาตรฐานท้ายคำตอบให้
- ไม่มี Markdown ลงท้ายครับ
- คำตอบ D Care ที่ถามรายละเอียดให้บอกว่าเป็นเงินก้อน เลือกกลุ่มโรคได้ และใส่ URL https://doctor-insurance.com/plans/d-care ท้ายคำตอบได้
`.trim();

  const result = await callOpenAI({
    model: MODEL,
    reasoning: { effort: "low" },
    max_output_tokens: 1800,
    store: false,
    instructions,
    input: [
      `ข้อความลูกค้า: ${message}`,
      `CURRENT PROFILE: ${JSON.stringify(profile)}`,
      `TURN ANALYSIS: ${JSON.stringify(analysis)}`,
      `FORCED QUESTION: ${forcedQuestion || "ไม่มี"}`,
      `QUOTE: ${quote ? JSON.stringify(quote) : "ไม่มี"}`,
    ].join("\n\n"),
    text: { verbosity: "low" },
  });

  const reply = extractResponseText(result);
  if (quote?.comparison || (quote?.ok && !replyMatchesQuote(reply, quote))) {
    return quoteFallbackReply(quote);
  }
  const baseReply = appendDcareDetailLink(
    reply || (quote ? quoteFallbackReply(quote) : "รับทราบครับ"),
    message
  );
  return appendKnowledgeLinks(baseReply, analysis, message);
}

async function getQuote(requestUrl, profile) {
  const url = new URL("/api/premium-quote", requestUrl);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.error || `premium-quote HTTP ${response.status}`);
  }
  return result;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return sendJson(res, 500, { error: "OPENAI_API_KEY is missing" });
  }

  try {
    const message = String(req.body?.message || "").trim();
    if (!message) return sendJson(res, 400, { error: "Missing message" });

    const currentProfile = migrateProfile(req.body?.profile || {});
    const analysis = await analyzeTurn(message, currentProfile);
    const contextualUpdates = inferContextualUpdates(message, currentProfile);
    const profile = mergeProfile(currentProfile, analysis, message, contextualUpdates);

    if (analysis.intent === "human_handoff") {
      profile.botMode = "human";
      return sendJson(res, 200, {
        action: "human_handoff",
        profile,
        reply:
          "ปิดผู้ช่วยอัตโนมัติสำหรับแชตนี้ชั่วคราวแล้วครับ หมอกึ๊กหรือเจ้าหน้าที่จะเข้ามาตอบต่อโดยตรงครับ",
      });
    }

    if (analysis.intent === "resume_ai") {
      profile.botMode = "ai";
      return sendJson(res, 200, {
        action: "resume_ai",
        profile,
        reply: "เปิดผู้ช่วยอัตโนมัติสำหรับแชตนี้แล้วครับ สอบถามต่อได้เลยครับ",
      });
    }

    if (analysis.intent === "reset") {
      return sendJson(res, 200, {
        action: "reset",
        profile: defaultProfile(),
        reply: "ล้างข้อมูลเดิมเรียบร้อยแล้วครับ เริ่มแจ้งข้อมูลใหม่ได้เลยครับ",
      });
    }

    const needsPlanning =
      analysis.asksForPremium ||
      analysis.shouldRecommendPlan ||
      analysis.intent === "insurance_advice" ||
      analysis.intent === "profile_update" ||
      Object.keys(contextualUpdates).length > 0;

    if (needsPlanning) {
      const missing = missingFields(profile);
      if (missing.length) {
        const field = missing[0];
        if (field === "groupBenefit") profile.groupBenefitAsked = true;
        const reply = await writeReply({
          message,
          profile,
          analysis,
          forcedQuestion: fieldQuestion(field, profile),
        });
        return sendJson(res, 200, {
          action: "ask_missing",
          missingField: field,
          profile,
          reply,
        });
      }

      const quote = await getQuote(req.headers.origin || `https://${req.headers.host}`, profile);
      if (quote?.needsInfo) {
        const reply = await writeReply({
          message,
          profile,
          analysis,
          quote,
          forcedQuestion: quote.question || fieldQuestion(quote.needsInfo, profile),
        });
        return sendJson(res, 200, {
          action: "ask_missing",
          missingField: quote.needsInfo,
          profile,
          quote,
          reply,
        });
      }

      if (quote?.ok) {
        profile.lastPlanCode = quote.planCode || null;
        profile.pendingBrochureKeys = brochureKeysForQuote(quote);
      }
      let reply = await writeReply({ message, profile, analysis, quote });
      let action = quote?.ok ? "quote" : "no_quote";

      if (quote?.ok && profile.pendingBrochureKeys.length) {
        reply = `${reply}\n\n${brochurePrompt()}`;
      }

      if (profile.healthStatus === "has_history") {
        profile.botMode = "human";
        action = "quote_handoff";
        reply = appendHealthHandoff(reply);
      }

      // quoteScope และคำสั่งปรับงบเป็นคำสั่งเฉพาะรอบ ไม่ควรค้างไปถามครั้งถัดไป
      profile.quoteScope = "package";
      profile.optimizeForBudget = false;

      return sendJson(res, 200, {
        action,
        handoffRequired: action === "quote_handoff",
        profile,
        quote,
        reply,
      });
    }

    const reply = appendKnowledgeLinks(
      analysis.directReply?.trim() ||
        (await writeReply({ message, profile, analysis })),
      analysis,
      message
    );

    return sendJson(res, 200, {
      action: "reply",
      profile,
      reply,
    });
  } catch (error) {
    console.error("line-agent error", error);
    return sendJson(res, 500, {
      error: error?.message || "AI agent failed",
    });
  }
}

export {
  appendKnowledgeLinks,
  defaultProfile,
  inferContextualUpdates,
  inferKnowledgeTopics,
  mergeProfile,
  missingFields,
};

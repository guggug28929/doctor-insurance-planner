// Vercel Serverless Function: /api/line-agent.js
// ทุกข้อความลูกค้าผ่าน AI เพื่อทำความเข้าใจบริบท อัปเดตความจำ และสร้างคำตอบ
// ตัวเลขเบี้ยต้องมาจาก /api/premium-quote เท่านั้น

import { brochureKeysForQuote, brochurePrompt } from "../lib/brochures.js";

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
18. ห้ามพูดถึง D Health Plus เพราะปิดการขายแล้ว ใช้ชื่อ D Health Lite เท่านั้น
19. หากลูกค้าระบุชื่อแผนล่าสุดโดยตรง เช่น "เอา Elite 20 ล้าน", "ขอเบี้ย D Health Lite" คำขอล่าสุดต้องมีลำดับสูงกว่ากฎค่าห้องและข้อมูลเก่า
20. ถ้าลูกค้าบอกว่าเบี้ยแพง/เกินงบ ให้จัดใหม่โดยถอดความคุ้มครองเสริมก่อนและเลือกชุดที่ใกล้งบที่สุด ห้ามส่งแผนเดิมซ้ำเฉย ๆ
21. D Health Lite: แอดมิดโรงพยาบาลในเครือ MTL Smile Network ไม่ต้องเสียส่วนต่างค่าห้องตามเงื่อนไขเครือข่าย ส่วนโรงพยาบาลคู่สัญญาบางแห่งตัวแทอาจช่วยขอส่วนลดค่าห้องได้
22. ห้ามแต่งตัวเลขเบี้ย ตัวเลขทุกบาทต้องมาจากเครื่องมือ premium quote
23. ห้ามใช้ Markdown; อนุญาตเฉพาะ URL https://doctor-insurance.com ในคำตอบรายละเอียด D Care
22. หากมีประวัติสุขภาพหรือโรคประจำตัว ห้ามตัดจบหรือปฏิเสธทันที ต้องเก็บข้อมูลที่จำเป็น จัดแผนและแจ้งเบี้ยเบื้องต้นให้เสร็จก่อน
23. หลังเสนอแผนสำหรับผู้มีประวัติสุขภาพแล้ว ให้แจ้งว่าผลรับประกันขึ้นกับบริษัท ปิดผู้ช่วยอัตโนมัติ และส่งต่อให้หมอกึ๊กหรือเจ้าหน้าที่จริงดูแลต่อ
24. เมื่อลูกค้าสนใจโรคร้ายแรง ต้องถามก่อนว่าเน้นค่ารักษา เงินก้อนเจอจ่ายจบ หรือทั้งสองอย่าง
25. ถ้าเน้นค่ารักษา ใช้ D Health Lite + Care Plus หรือ Elite Health Plus โดย Elite ไม่แนบ Care Plus
26. ถ้าเน้นเงินก้อนหรือทั้งสองอย่าง ให้เสนอเปรียบเทียบ CI Perfect Care, Multiple CI, D Care และความคุ้มครองโรคมะเร็งจากตารางจริง
27. ถ้าต้องการความคุ้มครองตั้งครรภ์/คลอดบุตร ให้เพิ่ม Maternity Plus; ถ้าต้องการตรวจสุขภาพ วัคซีน ทันตกรรม หรือสายตา ให้เพิ่ม Well-Being Plus ทั้งสองซื้อเดี่ยวไม่ได้ ต้องแนบ D Health Lite หรือ Elite Health Plus
28. หากกังวลค่าเบี้ย/ค่ารักษาหลังเกษียณ มีสวัสดิการปัจจุบัน หรือเป็นรัฐวิสาหกิจ ให้แนะนำเมืองไทยเฟล็กซี่ โพรเทคชั่น 99/20 ซึ่งชำระ 20 ปี และตั้งแต่อายุ 65 ปีเปลี่ยนทุนคงเหลือเป็นค่ารักษา IPD/OPD ได้ตามเงื่อนไข
29. D Care คือประกันโรคร้ายแรงแบบเงินก้อน เลือกกลุ่มโรคได้ (มะเร็ง หัวใจและหลอดเลือด ปลูกถ่ายอวัยวะ ระบบประสาทและกล้ามเนื้อ อื่น ๆ หรือกลุ่มโรคยอดฮิต) หากถามรายละเอียด D Care ให้ปิดท้ายด้วย https://doctor-insurance.com
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
    directReply: { type: "string" },
  },
  required: [
    "intent",
    "updates",
    "clearFields",
    "asksForPremium",
    "shouldRecommendPlan",
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
    version: 8,
    age: null,
    gender: null,
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
  profile.pendingBrochureKeys = Array.isArray(input.pendingBrochureKeys)
    ? input.pendingBrochureKeys
    : [];
  profile.version = 8;
  return profile;
}

function compactText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .trim();
}

function parseSpokenAmount(value) {
  const text = String(value || "").normalize("NFKC").toLowerCase();
  const match = text.match(/(\d[\d,]*(?:\.\d+)?)\s*(ล้าน|แสน|หมื่น|พัน|k)?/i);
  if (!match) return null;

  const base = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(base)) return null;
  const multipliers = { ล้าน: 1000000, แสน: 100000, หมื่น: 10000, พัน: 1000, k: 1000 };
  return Math.round(base * (multipliers[match[2]] || 1));
}

function inferContextualUpdates(message, current) {
  const compact = compactText(message);
  const updates = {};
  if (/มี(?:ประกันกลุ่ม|สวัสดิการบริษัท|สวัสดิการที่ทำงาน|ประกันส่วนตัว|กรมธรรม์(?:สุขภาพ)?เดิม)/.test(compact)) {
    updates.hasGroupBenefit = true;
  }
  if (/ไม่มี(?:ประกันกลุ่ม|สวัสดิการบริษัท|สวัสดิการที่ทำงาน|ประกันส่วนตัว|กรมธรรม์(?:สุขภาพ)?เดิม)/.test(compact)) {
    updates.hasGroupBenefit = false;
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

  if (mentionsRoom || soundsLikeRoomAnswer) {
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
    /ไม่มีโรคประจำตัว|ไม่มีประวัติสุขภาพ|สุขภาพแข็งแรง|ผลตรวจปกติ|^(?:ไม่มี|ไม่มีครับ|ไม่มีค่ะ)$/.test(
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

  return updates;
}

function mergeProfile(current, analysis, message, contextualUpdates = null) {
  const next = migrateProfile(current);
  for (const field of analysis.clearFields || []) {
    if (field === "focus") next[field] = [];
    else if (["budgetFlexible", "optimizeForBudget", "wantsMaternity", "wantsWellBeing"].includes(field)) next[field] = false;
    else if (field === "deductiblePreference") next[field] = "auto";
    else if (field === "opdPreference") next[field] = "unknown";
    else if (field === "requestedHealthPlan") next[field] = "auto";
    else if (field === "mainPlanPreference") next[field] = "auto";
    else if (field === "requestedProduct") next[field] = "auto";
    else if (field === "criticalIllnessNeed") next[field] = "unknown";
    else if (field === "quoteScope") next[field] = "package";
    else next[field] = null;
  }

  for (const [field, value] of Object.entries(analysis.updates || {})) {
    if (value === null || value === undefined) continue;
    next[field] = value;
  }

  // กฎตามบริบททำหน้าที่เป็น safety net เมื่อคำตอบลูกค้าไม่ใช่ตัวเลขล้วน
  // เช่น "ไม่จำกัดค่าห้อง", "ได้หมด", "เอา max" หรือ "ค่าห้อง 30,000"
  Object.assign(next, contextualUpdates || inferContextualUpdates(message, current));

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

async function analyzeTurn(message, profile) {
  const instructions = `
${PRODUCT_RULES}

หน้าที่ของคุณรอบนี้:
- อ่านข้อความล่าสุดร่วมกับ CURRENT PROFILE แล้วส่ง JSON ตาม schema เท่านั้น
- เข้าใจภาษาพูด คำย่อ คำสะกดผิด และตัวเลข เช่น 20k, 5พัน, 1แสน
- ต้องตีความคำตอบตามข้อมูลที่ยังขาดใน CURRENT PROFILE ไม่ใช่ดูเฉพาะรูปแบบข้อความ
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
- หากลูกค้าระบุ D Health, D Health Lite, ดีเฮลท์ หรือขอเบี้ย D Health ให้ requestedHealthPlan dhl โดยคำขอล่าสุดชนะ roomBudget เดิม
- หากระบุ Elite 20 ล้าน ให้ requestedHealthPlan elite20 หากระบุ Elite 75 ล้าน ให้ elite75
- หากพูดว่า "เบี้ยแพง", "เกินงบ", "ลดเบี้ย", "จัดใหม่ให้ถูกลง" ให้ optimizeForBudget true, asksForPremium true, shouldRecommendPlan true และตั้ง requestedHealthPlan auto เว้นแต่ข้อความเดียวกันระบุชื่อแผนชัดเจน
- หากลูกค้าบอก "ไม่เอา OPD ก็ได้" หลังเคยเสนอ Elite 75 ให้ตั้ง requestedHealthPlan auto เพื่อเปิดทางให้ระบบเลือก Elite 20
- OPD รายครั้งและ OPD เหมาจ่ายพ่วงสัญญาหลักประกันชีวิตได้ ไม่ต้องพ่วง D Health Lite หรือ Elite; Elite 75 มี OPD 40,000 บาท/ปีในตัว
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
  if (!quote?.ok) return quote?.question || "ยังไม่สามารถจัดแผนในกรอบงบที่แจ้งได้ครับ";
  const parts = [];
  if (quote.selectionReason) parts.push(quote.selectionReason);
  parts.push(quote.text);
  if (Array.isArray(quote.notes) && quote.notes.length) {
    parts.push(quote.notes.join("\n"));
  }
  return parts.filter(Boolean).join("\n\n");
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
  return `${String(reply || "").trim()}\n\nD Care เป็นประกันโรคร้ายแรงแบบเงินก้อนที่เลือกกลุ่มโรคได้ครับ ดูรายละเอียดเพิ่มเติมได้ที่ https://doctor-insurance.com`;
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
  const instructions = `
${PRODUCT_RULES}

สร้างคำตอบ LINE OA:
- คำขอล่าสุดของลูกค้ามีลำดับสูงสุด
- ใช้ข้อมูลสะสมเดิมและห้ามถามซ้ำ
- ถ้ามี forcedQuestion ให้ถามเพียงเรื่องนั้น
- ถ้ามี QUOTE ให้ใช้แผน รายการ และตัวเลขจาก QUOTE เท่านั้น ห้ามอ้างแผนก่อนหน้า ห้ามเปลี่ยนชื่อแผน และห้ามเติมตัวเลข
- ถ้าลูกค้าขอ D Health Lite แต่ QUOTE เป็น D Health Lite ต้องตอบ D Health Lite ห้ามย้อนกลับไป Elite
- ถ้าลูกค้าขอ Elite 20 แต่ QUOTE เป็น Elite 20 ต้องทำตามตรง ๆ
- เมื่อมี QUOTE ให้แจกแจงแต่ละสัญญาและยอดรวม
- ถ้า healthStatus เป็น has_history ต้องเสนอแผนจาก QUOTE ให้ครบก่อน ห้ามตอบเพียงว่าจะส่งต่อเจ้าหน้าที่
- ถ้า healthStatus เป็น has_history ไม่ต้องถามรายละเอียดโรคเพิ่มและไม่ต้องเขียนข้อความปิดบอตหรือส่งต่อเอง ระบบจะเติมข้อความมาตรฐานท้ายคำตอบให้
- ไม่มี Markdown ไม่มีลิงก์ดิบ ลงท้ายครับ
- คำตอบ D Care ที่ถามรายละเอียดให้บอกว่าเป็นเงินก้อน เลือกกลุ่มโรคได้ และใส่ URL https://doctor-insurance.com ท้ายคำตอบได้
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
  return appendDcareDetailLink(reply || (quote ? quoteFallbackReply(quote) : "รับทราบครับ"), message);
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
          forcedQuestion: FIELD_QUESTIONS[field],
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
          forcedQuestion: quote.question || FIELD_QUESTIONS[quote.needsInfo],
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

    const reply =
      analysis.directReply?.trim() ||
      (await writeReply({ message, profile, analysis }));

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

export { defaultProfile, inferContextualUpdates, mergeProfile, missingFields };

// Vercel Serverless Function: /api/line-agent.js
// ทุกข้อความลูกค้าผ่าน AI เพื่อทำความเข้าใจบริบท อัปเดตความจำ และสร้างคำตอบ
// ตัวเลขเบี้ยต้องมาจาก /api/premium-quote เท่านั้น

const MODEL = process.env.OPENAI_MODEL_LINE || "gpt-5.6-luna";

const PRODUCT_RULES = `
คุณเป็นผู้ช่วยประกันของหมอกึ๊กจากเมืองไทยประกันชีวิต ตอบภาษาไทย สุภาพ กระชับ ลงท้ายครับเสมอ

กฎจัดแผนที่ต้องยึดตาม:
1. งบที่ลูกค้าแจ้งเป็นงบเป้าหมาย คำว่า "ถ้างบถึง" หมายถึงยอดรวมต้องไม่เกินงบเป้าหมาย ไม่ใช่ใช้เพดาน +50% เพื่อยัดความคุ้มครองเพิ่ม
2. ยอมรับยอดรวมสูงกว่างบได้ไม่เกิน 50% เฉพาะเมื่อความคุ้มครองหลักทำให้หลีกเลี่ยงไม่ได้ โดยต้องเลือกชุดที่เกินงบน้อยที่สุด
3. เริ่มจากประกันสุขภาพเป็นหลักก่อน
4. ค่าห้องต่ำกว่า 10,000 บาท: D Health Lite 5 ล้านบาท/ครั้ง + Care Plus มะเร็งและไตวายเรื้อรัง 5 ล้านบาท/โรค/ปี
5. ถ้างบถึง ใช้ Smart Protection 99/20 ทุน 200,000 บาท และเพิ่ม PA Easy Plan 1 เมื่อยังไม่เกินงบ
6. หาก 99/20 + PA เกินงบ สามารถใช้ 99/20 โดยไม่แนบ PA ได้เมื่อจำเป็นจริง ๆ
7. หากต้องลดเป็นสัญญาหลัก 99/99 ทุน 100,000 หรือ 50,000 บาท ต้องแนบ PA เสมอ ห้ามเสนอ 99/99 เดี่ยว ๆ
8. หาก D Health Lite แบบไม่มีความรับผิดส่วนแรกยังเกินงบ และลูกค้ามีประกันกลุ่ม/กรมธรรม์เดิม หรือขอ deductible ให้ถามวงเงินค่ารักษาเดิมก่อน แล้วใช้ deductible 30,000 / 50,000 / 100,000 บาทให้สัมพันธ์กับวงเงินเดิม
9. ถ้ายังไม่ลงตัวจริง ๆ ค่อยใช้ Extra Care Plus Plan 3 + Care Plus เป็นแผนสำรอง
10. ค่าห้องตั้งแต่ 10,000 บาทขึ้นไป: ใช้ Elite Health Plus
11. งบต่ำกว่า 50,000 บาทและไม่ได้ยืนยันว่าต้องการ OPD: Elite Health Plus 20 ล้านบาท
12. งบตั้งแต่ 50,000 บาทขึ้นไป หรือยืนยันว่าต้องการ OPD: Elite Health Plus 75 ล้านบาท
13. ข้อความ "IPD +/- OPD", "OPD มีก็ได้ไม่มีก็ได้", "เผื่อ OPD" หมายถึง OPD เป็น optional ไม่ใช่การยืนยันว่าต้องการ OPD จึงห้ามบังคับไป Elite 75 ล้านบาท
14. ห้ามเสนอ Elite 40 ล้านบาทเป็นแผนหลัก หากถามเหตุผล ให้ตอบว่าเบี้ยใกล้กับ 75 ล้านบาทมาก เพิ่มอีกประมาณหลักพันบาทก็ได้วงเงิน 75 ล้านบาทซึ่งคุ้มกว่า
15. Elite Health Plus ไม่ต้องแนบ Care Plus
16. ห้ามพูดถึง D Health Plus เพราะปิดการขายแล้ว ใช้ชื่อ D Health Lite เท่านั้น
17. หากลูกค้าระบุชื่อแผนล่าสุดโดยตรง เช่น "เอา Elite 20 ล้าน", "ขอเบี้ย D Health Lite" คำขอล่าสุดต้องมีลำดับสูงกว่ากฎค่าห้องและข้อมูลเก่า
18. ถ้าลูกค้าบอกว่าเบี้ยแพง/เกินงบ ให้จัดใหม่โดยถอดความคุ้มครองเสริมก่อนและเลือกชุดที่ใกล้งบที่สุด ห้ามส่งแผนเดิมซ้ำเฉย ๆ
19. D Health Lite: แอดมิดโรงพยาบาลในเครือ MTL Smile Network ไม่ต้องเสียส่วนต่างค่าห้องตามเงื่อนไขเครือข่าย ส่วนโรงพยาบาลคู่สัญญาบางแห่งตัวแทนอาจช่วยขอส่วนลดค่าห้องได้
20. ห้ามแต่งตัวเลขเบี้ย ตัวเลขทุกบาทต้องมาจากเครื่องมือ premium quote
21. ห้ามใช้ Markdown เครื่องหมาย ** หรือลิงก์ดิบในคำตอบ LINE
22. หากมีประวัติสุขภาพหรือโรคประจำตัว ห้ามตัดจบหรือปฏิเสธทันที ต้องเก็บข้อมูลที่จำเป็น จัดแผนและแจ้งเบี้ยเบื้องต้นให้เสร็จก่อน
23. หลังเสนอแผนสำหรับผู้มีประวัติสุขภาพแล้ว ให้แจ้งว่าผลรับประกันขึ้นกับบริษัท ปิดผู้ช่วยอัตโนมัติ และส่งต่อให้หมอกึ๊กหรือเจ้าหน้าที่จริงดูแลต่อ
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
        quoteScope: {
          type: ["string", "null"],
          enum: ["package", "health_only", null],
        },
        optimizeForBudget: { type: ["boolean", "null"] },
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
        "deductiblePreference",
        "opdPreference",
        "requestedHealthPlan",
        "quoteScope",
        "optimizeForBudget",
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
          "deductiblePreference",
          "opdPreference",
          "requestedHealthPlan",
          "quoteScope",
          "optimizeForBudget",
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
    version: 5,
    age: null,
    gender: null,
    occupation: null,
    annualBudget: null,
    budgetFlexible: false,
    roomBudget: null,
    healthStatus: null,
    hasGroupBenefit: null,
    groupBenefit: null,
    deductiblePreference: "auto",
    opdPreference: "unknown",
    requestedHealthPlan: "auto",
    quoteScope: "package",
    optimizeForBudget: false,
    focus: [],
    botMode: "ai",
    lastPlanCode: null,
    updatedAt: new Date().toISOString(),
  };
}

function migrateProfile(input = {}) {
  const profile = { ...defaultProfile(), ...input };
  if (!input.opdPreference) {
    if (input.wantsOPD === true) profile.opdPreference = "yes";
    else if (input.wantsOPD === false) profile.opdPreference = "no";
  }
  profile.version = 5;
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

  if (
    current.healthStatus === null &&
    /ไม่มีโรคประจำตัว|ไม่มีประวัติสุขภาพ|สุขภาพแข็งแรง|ผลตรวจปกติ|^(?:ไม่มี|ไม่มีครับ|ไม่มีค่ะ)$/.test(
      compact
    )
  ) {
    updates.healthStatus = "none";
  } else if (
    /(?:^|[^ไ])มีโรคประจำตัว|มีประวัติ(?:สุขภาพ|ผ่าตัด|นอนโรงพยาบาล)|เคยผ่าตัด|เคยนอนโรงพยาบาล|ใช้ยาประจำ|กินยาประจำ|ผลตรวจ.*ผิดปกติ/.test(
      compact
    )
  ) {
    updates.healthStatus = "has_history";
  }

  return updates;
}

function mergeProfile(current, analysis, message, contextualUpdates = null) {
  const next = migrateProfile(current);
  for (const field of analysis.clearFields || []) {
    if (field === "focus") next[field] = [];
    else if (field === "budgetFlexible" || field === "optimizeForBudget") next[field] = false;
    else if (field === "deductiblePreference") next[field] = "auto";
    else if (field === "opdPreference") next[field] = "unknown";
    else if (field === "requestedHealthPlan") next[field] = "auto";
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
  if (profile.age === null) missing.push("age");
  if (!profile.gender) missing.push("gender");
  if (!profile.occupation) missing.push("occupation");
  if (profile.annualBudget === null && profile.budgetFlexible !== true) {
    missing.push("annualBudget");
  }
  if (profile.requestedHealthPlan === "auto" && profile.roomBudget === null) {
    missing.push("roomBudget");
  }
  if (!profile.healthStatus) missing.push("healthStatus");
  if (profile.hasGroupBenefit === null) missing.push("hasGroupBenefit");
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
- "IPD +/- OPD", "OPD มีก็ได้ไม่มีก็ได้", "เอา OPD ก็ได้ไม่เอาก็ได้" = opdPreference optional ห้ามตั้งเป็น yes
- "ไม่เอา OPD", "เอาแค่ IPD" = opdPreference no
- "ต้องการ OPD", "เอา OPD" = opdPreference yes
- หากลูกค้าระบุ D Health, D Health Lite, ดีเฮลท์ หรือขอเบี้ย D Health ให้ requestedHealthPlan dhl โดยคำขอล่าสุดชนะ roomBudget เดิม
- หากระบุ Elite 20 ล้าน ให้ requestedHealthPlan elite20 หากระบุ Elite 75 ล้าน ให้ elite75
- หากพูดว่า "เบี้ยแพง", "เกินงบ", "ลดเบี้ย", "จัดใหม่ให้ถูกลง" ให้ optimizeForBudget true, asksForPremium true, shouldRecommendPlan true และตั้ง requestedHealthPlan auto เว้นแต่ข้อความเดียวกันระบุชื่อแผนชัดเจน
- หากลูกค้าบอก "ไม่เอา OPD ก็ได้" หลังเคยเสนอ Elite 75 ให้ตั้ง requestedHealthPlan auto เพื่อเปิดทางให้ระบบเลือก Elite 20
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
        name: "line_insurance_turn_v5",
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
  if (!text.includes(String(Math.round(quote.totalPremium).toLocaleString("th-TH")))) return false;
  return true;
}

const HEALTH_HANDOFF_NOTE =
  "หมายเหตุ: เนื่องจากมีประวัติสุขภาพหรือโรคประจำตัว แผนและเบี้ยข้างต้นเป็นการวางแผนเบื้องต้น ผลรับประกันขึ้นอยู่กับการพิจารณาของบริษัทครับ จากนี้ผมขอปิดผู้ช่วยอัตโนมัติชั่วคราว และให้คุณหมอกึ๊กหรือเจ้าหน้าที่ติดต่อกลับเพื่อดูแลรายละเอียดต่อครับ";

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
- ไม่มี Markdown ไม่มีลิงก์ดิบ ลงท้ายครับ
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
  if (quote?.ok && !replyMatchesQuote(reply, quote)) {
    return quoteFallbackReply(quote);
  }
  return reply || (quote ? quoteFallbackReply(quote) : "รับทราบครับ");
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

      if (quote?.ok) profile.lastPlanCode = quote.planCode || null;
      let reply = await writeReply({ message, profile, analysis, quote });
      let action = quote?.ok ? "quote" : "no_quote";

      if (profile.healthStatus === "has_history") {
        profile.botMode = "human";
        action = "quote_handoff";
        const alreadyMentionsHandoff =
          /ปิด(?:การทำงานของ)?ผู้ช่วยอัตโนมัติ|ส่งต่อให้.*(?:หมอกึ๊ก|เจ้าหน้าที่)|เจ้าหน้าที่(?:จริง)?ดูแลต่อ/.test(
            reply
          );
        if (!alreadyMentionsHandoff) {
          reply = `${reply}\n\n${HEALTH_HANDOFF_NOTE}`;
        }
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

// Vercel Serverless Function: /api/line-agent.js
// ทุกข้อความลูกค้าผ่าน GPT-5.6 Luna เพื่อทำความเข้าใจบริบท อัปเดตความจำ และสร้างคำตอบ
// ตัวเลขเบี้ยต้องมาจาก /api/premium-quote เท่านั้น

const MODEL = process.env.OPENAI_MODEL_LINE || "gpt-5.6-luna";

const PRODUCT_RULES = `
คุณเป็นผู้ช่วยประกันของหมอกึ๊กจากเมืองไทยประกันชีวิต ตอบภาษาไทย สุภาพ กระชับ ลงท้ายครับเสมอ

กฎจัดแผนที่ต้องยึดตาม:
1. กรอบงบรวมยอมให้บวกลบได้ไม่เกิน 50% จากงบที่ลูกค้าแจ้ง โดยพยายามใกล้งบที่สุดและห้ามเกิน 150% ของงบ
2. เริ่มจากประกันสุขภาพเป็นหลักก่อน
3. ลูกค้าต้องการค่าห้องต่ำกว่า 10,000 บาท: เริ่ม D Health Lite 5 ล้านบาท/ครั้ง + Care Plus มะเร็งและไตวายเรื้อรัง 5 ล้านบาท/โรค/ปี
4. หากงบถึง ให้เพิ่ม PA Easy Plan 1
5. จากนั้นถ้างบถึงให้ใช้ Smart Protection 99/20 ทุนชีวิต 200,000 บาท
6. หากเกินงบ ให้ลดเป็น 99/99 ทุนชีวิต 100,000 บาท และถ้ายังเกินให้ลดเหลือ 50,000 บาท
7. หากชุด D Health Lite แบบไม่มีความรับผิดส่วนแรกยังเกินกรอบงบ และลูกค้ามีประกันกลุ่ม/กรมธรรม์เดิม หรือขอ deductible ให้ถามวงเงินค่ารักษาของสิทธิเดิมก่อน แล้วใช้ D Health Lite 5 ล้านบาท แบบ deductible 30,000 / 50,000 / 100,000 บาทให้สัมพันธ์กับวงเงินเดิม
8. ถ้า D Health Lite ยังไม่เหมาะกับงบมากจริง ๆ จึงค่อยใช้ Extra Care Plus Plan 3 เป็นแผนสำรอง และแนบ Care Plus
9. หากต้องการค่าห้องตั้งแต่ 10,000 บาทขึ้นไป ให้เปลี่ยน D Health Lite + Care Plus เป็น Elite Health Plus
10. Elite: ถ้างบต่ำกว่า 50,000 บาทและไม่เน้น OPD ให้ใช้ Elite Health Plus 20 ล้านบาท
11. ถ้างบตั้งแต่ 50,000 บาทขึ้นไป หรืออยากได้ OPD ให้ใช้ Elite Health Plus 75 ล้านบาท
12. ห้ามเสนอ Elite 40 ล้านบาทเป็นแผนหลัก หากถามเหตุผล ให้ตอบว่าเบี้ยใกล้กับ 75 ล้านบาทมาก เพิ่มอีกประมาณหลักพันบาทก็ได้วงเงิน 75 ล้านบาทซึ่งคุ้มกว่ามาก
13. Elite Health Plus ไม่ต้องแนบ Care Plus
14. ห้ามพูดถึง D Health Plus เพราะปิดการขายแล้ว ใช้ชื่อ D Health Lite เท่านั้น
15. D Health Lite: หากแอดมิดโรงพยาบาลในเครือ MTL Smile Network ไม่ต้องเสียส่วนต่างค่าห้องตามเงื่อนไขเครือข่าย ส่วนโรงพยาบาลคู่สัญญาบางแห่งตัวแทนอาจช่วยขอส่วนลดค่าห้องได้
16. ห้ามแต่งตัวเลขเบี้ย ห้ามประมาณเอง ตัวเลขทุกบาทต้องมาจากเครื่องมือ premium quote
17. ห้ามใช้ Markdown เครื่องหมาย ** หรือลิงก์ดิบในคำตอบ LINE
18. หากมีประวัติสุขภาพ ให้ตอบได้ในเชิงวางแผนเบื้องต้น แต่แจ้งว่าผลรับประกันขึ้นกับบริษัทและส่งต่อหมอกึ๊กเมื่อต้องประเมินรายละเอียด
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
        wantsOPD: { type: ["boolean", "null"] },
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
        "wantsOPD",
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
          "wantsOPD",
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
    version: 4,
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
    wantsOPD: null,
    focus: [],
    botMode: "ai",
    lastPlanCode: null,
    updatedAt: new Date().toISOString(),
  };
}

function mergeProfile(current, analysis) {
  const next = { ...defaultProfile(), ...(current || {}) };
  for (const field of analysis.clearFields || []) {
    if (field === "focus") next[field] = [];
    else if (field === "budgetFlexible") next[field] = false;
    else if (field === "deductiblePreference") next[field] = "auto";
    else next[field] = null;
  }

  for (const [field, value] of Object.entries(analysis.updates || {})) {
    if (value === null || value === undefined) continue;
    next[field] = value;
  }

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
  if (profile.roomBudget === null) missing.push("roomBudget");
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
- อ่านข้อความลูกค้าและข้อมูลสะสมเดิม แล้วแยก intent พร้อมข้อมูลใหม่เป็น JSON ตาม schema เท่านั้น
- ต้องเข้าใจภาษาพูด คำย่อ คำสะกดผิด ตัวเลขแบบ 20k, 5พัน, 1แสน
- คำว่า ไม่มีโรคประจำตัว, ไม่มีประวัติสุขภาพ, สุขภาพแข็งแรง, ผลตรวจปกติ หมายถึง healthStatus = none ห้ามตีความว่ามีโรคเพียงเพราะมีคำว่าโรคหรือสุขภาพ
- ถ้าลูกค้าแก้ข้อมูล ให้ใส่ค่าที่แก้ใน updates และระบุ clearFields เฉพาะข้อมูลที่ต้องล้างจริง
- ห้ามถามข้อมูลที่มีอยู่แล้วใน CURRENT PROFILE
- ถ้าลูกค้าถามเบี้ย ราคา ปีละเท่าไร รวมเท่าไร หรือขอใบเสนอราคา ให้ asksForPremium = true
- ถ้าลูกค้าขอแนะนำแผน ให้ shouldRecommendPlan = true
- directReply ใช้ตอบคำถามทั่วไปหรือทักทายได้ แต่ถ้าต้องคำนวณเบี้ยให้ปล่อยเป็นข้อความสั้น ๆ ว่ากำลังคำนวณ ไม่ต้องใส่ตัวเลข
- หากขอคุยกับคน/เจ้าหน้าที่/หมอกึ๊ก ให้ intent = human_handoff
- ตอบและสรุปด้วยคำลงท้ายครับเท่านั้น
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
        name: "line_insurance_turn",
        strict: true,
        schema: ANALYSIS_SCHEMA,
      },
    },
  });

  const text = extractResponseText(result);
  return JSON.parse(text);
}

async function writeReply({ message, profile, analysis, quote = null, forcedQuestion = null }) {
  const instructions = `
${PRODUCT_RULES}

สร้างคำตอบ LINE OA ของหมอกึ๊ก:
- ใช้ข้อมูลสะสมเดิม ไม่ถามซ้ำ
- ถ้ามี forcedQuestion ให้ถามเพียงคำถามนั้นหนึ่งเรื่อง ห้ามถามเรื่องอื่นเพิ่ม
- ถ้ามี QUOTE ให้ใช้ชื่อแผน รายการ และตัวเลขตาม QUOTE แบบตรงตัว ห้ามแก้ ห้ามปัด ห้ามเติมตัวเลขใหม่
- เมื่อมี QUOTE ต้องแจกแจงแต่ละสัญญาพร้อมเบี้ย และยอดรวม
- หากลูกค้าถามเบี้ย ต้องตอบเบี้ยทันทีเมื่อ QUOTE พร้อม
- ข้อความธรรมดา ไม่มี Markdown ไม่มีลิงก์ดิบ
- สุภาพ กระชับ อ่านง่าย และลงท้ายครับเสมอ
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

  return extractResponseText(result);
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

    const currentProfile = { ...defaultProfile(), ...(req.body?.profile || {}) };
    const analysis = await analyzeTurn(message, currentProfile);
    const profile = mergeProfile(currentProfile, analysis);

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
      analysis.intent === "profile_update";

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
      const reply = await writeReply({ message, profile, analysis, quote });
      return sendJson(res, 200, {
        action: quote?.ok ? "quote" : "no_quote",
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

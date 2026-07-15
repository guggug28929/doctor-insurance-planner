import crypto from "node:crypto";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days
const EVENT_TTL_SECONDS = 60 * 60 * 24; // 1 day

const CURRENT_PRODUCT_RULES = `
กฎผลิตภัณฑ์ที่ต้องยึดตามอย่างเคร่งครัด:
1) ห้ามแนะนำหรือกล่าวถึง D Health Plus เพราะปิดการขายแล้ว และห้ามใช้ชื่อ D Health แบบกว้าง ๆ ให้ใช้ชื่อ D Health Lite เท่านั้น
2) ถ้าต้องการค่าห้องประมาณ 5,000-10,000 บาท หรือมีงบจำกัดต่ำกว่า 30,000 บาทต่อปี ให้ใช้ D Health Lite เป็นแผนสุขภาพหลัก ไม่ต้องเสนอแผนห้องอื่นซ้ำ
3) สำหรับ D Health Lite: หากแอดมิดโรงพยาบาลในเครือ MTL Smile Network ไม่ต้องเสียส่วนต่างค่าห้องตามเงื่อนไขเครือข่าย และโรงพยาบาลคู่สัญญาบางแห่งตัวแทนอาจช่วยขอส่วนลดค่าห้องได้
4) ถ้าต้องการค่าห้องตั้งแต่ 10,000 บาทขึ้นไป และงบไม่จำกัด หรือมีงบตั้งแต่ 30,000 บาทต่อปีขึ้นไปและเน้นค่าห้อง 10,000 บาทขึ้นไป ให้แนะนำ Elite Health Plus
5) เมื่อแนะนำ D Health Lite, เหมาจ่ายเอ๊กตร้า หรือ Extra Care Plus ให้เสนอ Care Plus เสริมด้วยเสมอ
6) เมื่อแนะนำ Elite Health Plus ไม่ต้องเสนอ Care Plus เพิ่ม
7) ห้ามแต่งตัวเลขเบี้ยหรือผลรับประกัน และห้ามใช้ข้อมูลแผนเก่าจากเว็บค้นหา
8) คำตอบใน LINE ต้องเป็นข้อความธรรมดา ห้ามใช้ Markdown เช่น ** หรือลิงก์แบบ [ข้อความ](URL)
`.trim();

const FORBIDDEN_PRODUCT_PATTERNS = [
  /\bD\s*Health\s*Plus\b/i,
  /\bD\s*Health\b(?!\s*Lite)/i,
  /ดี\s*เฮลท์\s*พลัส/i,
  /ดี\s*เฮลท์(?!\s*ไลท์)/i,
];

const PROFILE_FIELDS = [
  "age",
  "gender",
  "annualBudget",
  "focus",
  "healthStatus",
  "groupBenefit",
  "roomBudget",
  "occupation",
  "budgetFlexible",
];

const FIELD_LABELS = {
  age: "อายุ",
  gender: "เพศ",
  annualBudget: "งบประมาณต่อปี",
  focus: "ความคุ้มครองที่สนใจ",
  healthStatus: "ประวัติสุขภาพ",
  groupBenefit: "ประกันกลุ่มหรือสวัสดิการเดิม",
  roomBudget: "งบค่าห้องต่อคืน",
  occupation: "อาชีพ",
  budgetFlexible: "ความยืดหยุ่นของงบ",
};

function verifyLineSignature(rawBody, signature, channelSecret) {
  const expectedSignature = crypto
    .createHmac("sha256", channelSecret)
    .update(rawBody)
    .digest("base64");

  const receivedBuffer = Buffer.from(signature || "");
  const expectedBuffer = Buffer.from(expectedSignature);

  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

async function replyToLine(replyToken, message) {
  const safeText = sanitizeLineText(String(message || "")).slice(0, 4900);

  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      replyToken,
      messages: [
        {
          type: "text",
          text: safeText,
          quickReply: {
            items: [
              {
                type: "action",
                action: {
                  type: "message",
                  label: "คุยกับเจ้าหน้าที่",
                  text: "คุยกับเจ้าหน้าที่",
                },
              },
              {
                type: "action",
                action: {
                  type: "message",
                  label: "เริ่มใหม่",
                  text: "เริ่มใหม่",
                },
              },
              {
                type: "action",
                action: {
                  type: "message",
                  label: "เปิดผู้ช่วยอัตโนมัติ",
                  text: "กลับมาใช้บอต",
                },
              },
            ],
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LINE reply failed: ${response.status} ${errorText}`);
  }
}

function containsAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function forceMalePoliteTone(message) {
  return String(message || "")
    .replace(/ดิฉัน/g, "ผม")
    .replace(/ฉัน/g, "ผม")
    .replace(/นะค่ะ/g, "นะครับ")
    .replace(/นะคะ/g, "นะครับ")
    .replace(/ค่ะ/g, "ครับ")
    .replace(/คะ/g, "ครับ");
}

function sanitizeLineText(message) {
  return forceMalePoliteTone(message)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/__+/g, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/`{1,3}/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeText(input) {
  const thaiDigits = {
    "๐": "0",
    "๑": "1",
    "๒": "2",
    "๓": "3",
    "๔": "4",
    "๕": "5",
    "๖": "6",
    "๗": "7",
    "๘": "8",
    "๙": "9",
  };

  let text = String(input || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[๐-๙]/g, (digit) => thaiDigits[digit] || digit)
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/รพ\.?/g, "โรงพยาบาล")
    .replace(/โรงบาล/g, "โรงพยาบาล")
    .replace(/แอดมิด/g, "แอดมิท")
    .replace(/แอดมิต/g, "แอดมิท")
    .replace(/admit/g, "แอดมิท")
    .replace(/in\s*patient/g, "inpatient")
    .replace(/out\s*patient/g, "outpatient")
    .replace(/ประกันสุกภาพ/g, "ประกันสุขภาพ")
    .replace(/ประกันสขภาพ/g, "ประกันสุขภาพ")
    .replace(/ประกันสุขพาพ/g, "ประกันสุขภาพ")
    .replace(/ประกันสุขภา(?!พ)/g, "ประกันสุขภาพ")
    .replace(/ไอ\s*พี\s*ดี/g, "ipd")
    .replace(/โอ\s*พี\s*ดี/g, "opd")
    .replace(/i[.\s-]*p[.\s-]*d/g, "ipd")
    .replace(/o[.\s-]*p[.\s-]*d/g, "opd")
    .replace(/คับ|คร้าบ|ค้าบ|คราบ/g, "ครับ")
    .replace(/นะค่ะ/g, "นะคะ")
    .replace(/(^|\s)ค่าา*(?=$|\s|[.!?…])/g, "$1ค่ะ")
    .replace(/[,，]/g, "")
    .replace(/[\t\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text;
}

function normalizeCompact(text) {
  return normalizeText(text).replace(/\s+/g, "");
}

function defaultProfile() {
  return {
    version: 2,
    age: null,
    gender: null,
    annualBudget: null,
    budgetFlexible: false,
    roomBudget: null,
    focus: [],
    healthStatus: null, // none | yes | conflict | unclear
    needsHumanReview: false,
    hasGroupBenefit: null,
    groupBenefit: null,
    occupation: null,
    intent: null,
    botMode: "ai",
    askedFields: [],
    lastAskedField: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function getRedisConfig() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    return null;
  }

  return { url: url.replace(/\/$/, ""), token };
}

async function redisCommand(command) {
  const config = getRedisConfig();

  if (!config) {
    throw new Error("KV_REST_API_URL or KV_REST_API_TOKEN is missing");
  }

  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data?.error) {
    throw new Error(
      `Redis command failed: ${response.status} ${data?.error || "Unknown error"}`
    );
  }

  return data?.result;
}

function profileKey(userId) {
  return `line:profile:${userId}`;
}

async function loadProfile(userId) {
  try {
    const stored = await redisCommand(["GET", profileKey(userId)]);

    if (!stored) {
      return defaultProfile();
    }

    const parsed = JSON.parse(stored);
    return {
      ...defaultProfile(),
      ...parsed,
      focus: Array.isArray(parsed?.focus) ? parsed.focus : [],
      askedFields: Array.isArray(parsed?.askedFields)
        ? parsed.askedFields
        : [],
    };
  } catch (error) {
    console.error("Failed to load LINE profile", error);
    return defaultProfile();
  }
}

async function saveProfile(userId, profile) {
  const nextProfile = {
    ...profile,
    updatedAt: new Date().toISOString(),
  };

  try {
    await redisCommand([
      "SET",
      profileKey(userId),
      JSON.stringify(nextProfile),
      "EX",
      String(SESSION_TTL_SECONDS),
    ]);
  } catch (error) {
    console.error("Failed to save LINE profile", error);
  }

  return nextProfile;
}

async function clearProfile(userId) {
  try {
    await redisCommand(["DEL", profileKey(userId)]);
  } catch (error) {
    console.error("Failed to clear LINE profile", error);
  }
}

async function claimWebhookEvent(eventId) {
  if (!eventId) {
    return true;
  }

  try {
    const result = await redisCommand([
      "SET",
      `line:event:${eventId}`,
      "1",
      "EX",
      String(EVENT_TTL_SECONDS),
      "NX",
    ]);

    return result === "OK";
  } catch (error) {
    console.error("Failed to check duplicate LINE event", error);
    return true;
  }
}

const RESET_KEYWORDS = [
  "เริ่มใหม่",
  "เริ่มกรอกใหม่",
  "ขอเริ่มใหม่",
  "ล้างข้อมูล",
  "ลบข้อมูลเดิม",
  "รีเซ็ตข้อมูล",
  "reset",
  "เอาใหม่ทั้งหมด",
  "กรอกใหม่ทั้งหมด",
  "ลืมข้อมูลเดิม",
];

const CORRECTION_KEYWORDS = [
  "ขอแก้",
  "แก้ข้อมูล",
  "แก้เป็น",
  "เปลี่ยนเป็น",
  "พิมพ์ผิด",
  "เมื่อกี้ผิด",
  "บอกผิด",
  "จริงๆแล้ว",
  "จริง ๆ แล้ว",
  "ข้อมูลใหม่",
  "อายุจริง",
  "งบใหม่",
  "เอาใหม่",
  "แก้ไข",
  "update",
  "correct",
];

const GREETING_KEYWORDS = [
  "สวัสดี",
  "หวัดดี",
  "ดีครับ",
  "ดีค่ะ",
  "hello",
  "hi",
  "hey",
  "ทักครับ",
  "ทักค่ะ",
];

const CONTACT_KEYWORDS = [
  "คุยกับเจ้าหน้าที่",
  "ขอคุยกับเจ้าหน้าที่",
  "ขอเจ้าหน้าที่",
  "คุยกับแอดมิน",
  "ขอคุยกับแอดมิน",
  "ขอคุยกับหมอกึ๊ก",
  "คุยกับคน",
  "ให้เจ้าหน้าที่ตอบ",
  "ให้แอดมินตอบ",
  "หยุดบอต",
  "ปิดบอต",
];

const RESUME_BOT_KEYWORDS = [
  "กลับมาใช้บอต",
  "เปิดบอต",
  "เปิดผู้ช่วยอัตโนมัติ",
  "ให้บอตตอบ",
  "ใช้ ai ต่อ",
  "กลับเข้าโหมดอัตโนมัติ",
  "resume bot",
];

const PLAN_INTENT_KEYWORDS = [
  "สนใจประกัน",
  "ประกันสุขภาพ",
  "ประกันสุกภาพ",
  "ประกันค่ารักษา",
  "ประกันโรงพยาบาล",
  "ประกันเหมาจ่าย",
  "แนะนำแผน",
  "ช่วยวางแผน",
  "วางแผนประกัน",
  "เลือกแผน",
  "หาแผน",
  "ซื้อประกัน",
  "ทำประกัน",
  "สมัครประกัน",
  "อยากได้ประกัน",
  "ขอใบเสนอราคา",
  "ขอเบี้ย",
  "เบี้ยเท่าไหร่",
  "เบี้ยเท่าไร",
  "ราคาเท่าไหร่",
  "ราคาเท่าไร",
  "ปีละกี่บาท",
  "ค่าเบี้ย",
  "คุ้มครองอะไร",
  "ได้อะไรบ้าง",
  "วงเงินเท่าไหร่",
  "ipd",
  "opd",
  "ผู้ป่วยใน",
  "ผู้ป่วยนอก",
];

const IPD_KEYWORDS = [
  "ipd",
  "ไอพีดี",
  "ไอพีด",
  "ไอพิดี",
  "ผู้ป่วยใน",
  "ผปใน",
  "inpatient",
  "นอนโรงพยาบาล",
  "นอน รพ",
  "แอดมิท",
  "ค่ารักษาผู้ป่วยใน",
  "ค่าห้อง",
  "ห้องเดี่ยว",
  "เหมาจ่าย",
  "เน้นนอนโรงพยาบาล",
];

const OPD_KEYWORDS = [
  "opd",
  "โอพีดี",
  "โอพีด",
  "โอพิดี",
  "ผู้ป่วยนอก",
  "ผปนอก",
  "outpatient",
  "หาหมอไม่นอนโรงพยาบาล",
  "ตรวจรักษาผู้ป่วยนอก",
  "ค่าหาหมอ",
  "คลินิก",
];

const HEALTH_INSURANCE_KEYWORDS = [
  "ประกันสุขภาพ",
  "ประกันสุกภาพ",
  "ประกันสขภาพ",
  "ประกันค่ารักษา",
  "ประกันโรงพยาบาล",
  "ประกันเหมาจ่าย",
  "ค่ารักษา",
  "สนใจสุขภาพ",
  "เน้นสุขภาพ",
  ...IPD_KEYWORDS,
  ...OPD_KEYWORDS,
];

const CRITICAL_ILLNESS_KEYWORDS = [
  "โรคร้าย",
  "โรคร้ายแรง",
  "ci",
  "มะเร็งเจอจ่าย",
  "เจอจ่าย",
  "มะเร็ง",
  "หัวใจ",
  "สโตรก",
  "เส้นเลือดสมอง",
];

const LIFE_KEYWORDS = [
  "ประกันชีวิต",
  "ทุนชีวิต",
  "คุ้มครองชีวิต",
  "เสียชีวิต",
  "มรดก",
];

const ACCIDENT_KEYWORDS = [
  "ประกันอุบัติเหตุ",
  "อุบัติเหตุ",
  "pa",
];

const HEALTH_NEGATIVE_PHRASES = [
  "ไม่มีโรคประจำตัว",
  "ไม่มีโรคประจำตัวเลย",
  "ไม่เป็นโรคประจำตัว",
  "ไม่มีโรค",
  "ไม่ได้เป็นโรคอะไร",
  "ไม่เคยมีโรค",
  "ไม่มีโรคเรื้อรัง",
  "ไม่มีประวัติสุขภาพ",
  "ไม่มีประวัติการรักษา",
  "ไม่มีประวัติป่วย",
  "ไม่มีประวัติโรค",
  "ปฏิเสธโรคประจำตัว",
  "สุขภาพแข็งแรง",
  "สุขภาพดี",
  "แข็งแรงดี",
  "ปกติดี",
  "ไม่มีปัญหาสุขภาพ",
  "ผลตรวจสุขภาพปกติ",
  "ตรวจสุขภาพปกติ",
  "ผลตรวจปกติ",
  "ผลเลือดปกติ",
  "ตรวจแล้วปกติ",
  "ไม่เคยผ่าตัด",
  "ไม่เคยนอนโรงพยาบาล",
  "ไม่เคยแอดมิท",
  "ไม่เคยรักษาตัวในโรงพยาบาล",
  "ไม่เคยเข้าโรงพยาบาล",
  "ไม่กินยาประจำ",
  "ไม่ได้กินยาประจำ",
  "ไม่ได้ทานยาประจำ",
  "ไม่มียาประจำ",
  "ไม่มีทานยาประจำ",
  "ไม่ได้กินยา",
  "ไม่ได้ทานยา",
  "ไม่เคยกินยาประจำ",
  "ไม่มีประวัติผ่าตัด",
  "ไม่เคยป่วยหนัก",
  "ไม่มีการรักษาต่อเนื่อง",
  "ไม่เป็นเบาหวาน",
  "ไม่มีเบาหวาน",
  "น้ำตาลปกติ",
  "ไม่เป็นความดัน",
  "ไม่มีความดัน",
  "ความดันปกติ",
  "ไม่เป็นมะเร็ง",
  "ไม่มีมะเร็ง",
  "ไม่เป็นโรคหัวใจ",
  "ไม่มีโรคหัวใจ",
  "ไม่เป็นสโตรก",
  "ไม่มีสโตรก",
  "ไม่มีไทรอยด์",
  "ไม่มีอะไรผิดปกติ",
  "ไม่มีอะไรเลย",
  "no medical history",
  "deny ud",
  "deny u/d",
  "no ud",
  "no u/d",
  "no underlying disease",
  "nil ud",
  "nil u/d",
  "healthy",
];

const HEALTH_POSITIVE_KEYWORDS = [
  "มีโรคประจำตัว",
  "เป็นเบาหวาน",
  "เบาหวาน",
  "เป็นความดัน",
  "ความดันสูง",
  "ความดัน",
  "ไขมันสูง",
  "ไทรอยด์",
  "หัวใจ",
  "สโตรก",
  "เส้นเลือดสมอง",
  "มะเร็ง",
  "ก้อน",
  "ซีสต์",
  "เนื้องอก",
  "ภูมิแพ้",
  "หอบหืด",
  "ไต",
  "ตับ",
  "เคยผ่าตัด",
  "ผ่าตัดมา",
  "เคยนอนโรงพยาบาล",
  "เคยแอดมิท",
  "นอนโรงพยาบาลมา",
  "กินยาประจำ",
  "ทานยาประจำ",
  "กินยา",
  "ทานยา",
  "มียาประจำ",
  "รักษาต่อเนื่อง",
  "ติดตามอาการ",
  "ผลตรวจผิดปกติ",
  "ผลเลือดผิดปกติ",
  "เคยรักษา",
  "เคยป่วย",
  "ตั้งครรภ์",
  "พบแพทย์ประจำ",
];

function isResetRequest(text) {
  return containsAny(text, RESET_KEYWORDS);
}

function isCorrectionRequest(text) {
  return containsAny(text, CORRECTION_KEYWORDS);
}

function isGreeting(text) {
  return containsAny(text, GREETING_KEYWORDS);
}

function isContactRequest(text) {
  return containsAny(text, CONTACT_KEYWORDS);
}

function isResumeBotRequest(text) {
  return containsAny(text, RESUME_BOT_KEYWORDS);
}

function isShortAcknowledgement(text) {
  const compact = normalizeCompact(text);
  return [
    "ครับ",
    "ค่ะ",
    "คะ",
    "โอเค",
    "ok",
    "okay",
    "ได้ครับ",
    "ได้ค่ะ",
    "รับทราบ",
    "ขอบคุณ",
    "ขอบคุณครับ",
    "ขอบคุณค่ะ",
    "จ้า",
    "จ้ะ",
    "อืม",
    "อือ",
  ].includes(compact);
}

function parseNumericToken(rawToken) {
  if (!rawToken) {
    return null;
  }

  const token = String(rawToken).replace(/,/g, "").trim().toLowerCase();
  const match = token.match(/(\d+(?:\.\d+)?)\s*(ล้าน|แสน|หมื่น|พัน|k|เค)?/i);

  if (!match) {
    return null;
  }

  let value = Number(match[1]);
  const unit = match[2] || "";
  const multipliers = {
    ล้าน: 1000000,
    แสน: 100000,
    หมื่น: 10000,
    พัน: 1000,
    k: 1000,
    เค: 1000,
  };

  if (multipliers[unit]) {
    value *= multipliers[unit];
  }

  return Number.isFinite(value) ? Math.round(value) : null;
}

function parseThaiWordNumber(text) {
  const compact = normalizeCompact(text);
  const direct = [
    ["หนึ่งล้าน", 1000000],
    ["ห้าแสน", 500000],
    ["สี่แสน", 400000],
    ["สามแสน", 300000],
    ["สองแสน", 200000],
    ["หนึ่งแสน", 100000],
    ["แสนหนึ่ง", 100000],
    ["เก้าหมื่น", 90000],
    ["แปดหมื่น", 80000],
    ["เจ็ดหมื่น", 70000],
    ["หกหมื่น", 60000],
    ["ห้าหมื่น", 50000],
    ["สี่หมื่น", 40000],
    ["สามหมื่น", 30000],
    ["สองหมื่น", 20000],
    ["หนึ่งหมื่น", 10000],
    ["หมื่นห้า", 15000],
    ["หมื่นสอง", 12000],
    ["หมื่น", 10000],
    ["เก้าพัน", 9000],
    ["แปดพัน", 8000],
    ["เจ็ดพัน", 7000],
    ["หกพัน", 6000],
    ["ห้าพัน", 5000],
    ["สี่พัน", 4000],
    ["สามพัน", 3000],
    ["สองพัน", 2000],
    ["หนึ่งพัน", 1000],
    ["พันห้า", 1500],
  ];

  for (const [phrase, value] of direct) {
    if (compact.includes(phrase)) {
      return value;
    }
  }

  return null;
}

function extractNumberNear(text, labels, options = {}) {
  const compact = normalizeCompact(text);
  const max = options.max ?? Number.MAX_SAFE_INTEGER;
  const min = options.min ?? 0;

  function valueFromSegment(segment, preferLast = false) {
    const matches = [...segment.matchAll(/(\d+(?:\.\d+)?)\s*(ล้าน|แสน|หมื่น|พัน|k|เค)?/gi)];

    if (matches.length > 0) {
      const chosen = preferLast ? matches[matches.length - 1][0] : matches[0][0];
      const parsed = parseNumericToken(chosen);
      if (parsed !== null) return parsed;
    }

    return parseThaiWordNumber(segment);
  }

  for (const label of labels) {
    const compactLabel = normalizeCompact(label);
    const position = compact.indexOf(compactLabel);

    if (position < 0) {
      continue;
    }

    // Prefer the number after the label: "ค่าห้อง 5,000"
    const after = compact.slice(
      position + compactLabel.length,
      position + compactLabel.length + 30
    );
    let value = valueFromSegment(after, false);

    // Fall back to the number immediately before the label: "5,000 ค่าห้อง"
    if (value === null) {
      const before = compact.slice(Math.max(0, position - 25), position);
      value = valueFromSegment(before, true);
    }

    if (value !== null && value >= min && value <= max) {
      return value;
    }
  }

  return null;
}

function extractAge(text) {
  const normalized = normalizeText(text);
  const explicit = normalized.match(/อายุ\s*(\d{1,2})(?:\s*ปี)?/);

  if (explicit) {
    const age = Number(explicit[1]);
    return age >= 1 && age <= 99 ? age : null;
  }

  const reversed = normalized.match(/(?:^|\s)(\d{1,2})\s*ปี(?:\s|$)/);

  if (reversed) {
    const age = Number(reversed[1]);
    return age >= 1 && age <= 99 ? age : null;
  }

  const compact = normalizeCompact(text);
  const thaiAgeWords = [
    ["ยี่สิบ", 20],
    ["สามสิบ", 30],
    ["สี่สิบ", 40],
    ["ห้าสิบ", 50],
    ["หกสิบ", 60],
    ["เจ็ดสิบ", 70],
  ];

  if (compact.includes("อายุ")) {
    for (const [word, base] of thaiAgeWords) {
      if (compact.includes(`อายุ${word}`)) {
        const unitWords = [
          ["เก้า", 9],
          ["แปด", 8],
          ["เจ็ด", 7],
          ["หก", 6],
          ["ห้า", 5],
          ["สี่", 4],
          ["สาม", 3],
          ["สอง", 2],
          ["เอ็ด", 1],
          ["หนึ่ง", 1],
        ];

        for (const [unitWord, unit] of unitWords) {
          if (compact.includes(`อายุ${word}${unitWord}`)) {
            return base + unit;
          }
        }

        return base;
      }
    }
  }

  return null;
}

function extractGender(text) {
  const normalized = normalizeText(text);
  const compact = normalizeCompact(text);

  const female = [
    "เพศหญิง",
    "ผู้หญิง",
    "หญิง",
    "female",
    "นางสาว",
    "น.ส.",
    "หนูเป็นผู้หญิง",
  ];
  const male = [
    "เพศชาย",
    "ผู้ชาย",
    "ชาย",
    "male",
    "นาย",
    "ผมเป็นผู้ชาย",
  ];

  if (female.some((keyword) => compact.includes(normalizeCompact(keyword)))) {
    return "female";
  }

  if (male.some((keyword) => compact.includes(normalizeCompact(keyword)))) {
    return "male";
  }

  if (/\b(f)\b/.test(normalized)) {
    return "female";
  }

  if (/\b(m)\b/.test(normalized)) {
    return "male";
  }

  return null;
}

function extractAnnualBudget(text) {
  return extractNumberNear(
    text,
    [
      "งบต่อปี",
      "งบประมาณต่อปี",
      "งบปีละ",
      "จ่ายต่อปี",
      "จ่ายปีละ",
      "เบี้ยต่อปี",
      "เบี้ยปีละ",
      "รับไหวต่อปี",
      "จ่ายไหว",
      "งบ",
    ],
    { min: 1000, max: 2000000 }
  );
}

function extractRoomBudget(text) {
  return extractNumberNear(
    text,
    [
      "ค่าห้อง",
      "ห้องเดี่ยว",
      "ห้องต่อคืน",
      "ห้องคืนละ",
      "งบห้อง",
      "ค่าห้องต่อวัน",
      "ห้อง",
      "room",
    ],
    { min: 500, max: 100000 }
  );
}

function extractGroupBenefit(text) {
  const normalized = normalizeText(text);

  const noBenefitPhrases = [
    "ไม่มีประกันกลุ่ม",
    "ไม่มีสวัสดิการ",
    "ไม่มีสวัสดิการบริษัท",
    "ไม่มีประกันบริษัท",
    "ไม่มีสิทธิ์บริษัท",
    "ออกค่ารักษาเอง",
    "จ่ายเองทั้งหมด",
    "ไม่มีของที่ทำงาน",
  ];

  if (containsAny(normalized, noBenefitPhrases)) {
    return { hasGroupBenefit: false, groupBenefit: 0 };
  }

  const hasBenefitKeywords = [
    "ประกันกลุ่ม",
    "สวัสดิการบริษัท",
    "สวัสดิการที่ทำงาน",
    "สิทธิ์บริษัท",
    "วงเงินบริษัท",
    "ของที่ทำงาน",
  ];

  if (containsAny(normalized, hasBenefitKeywords)) {
    const value = extractNumberNear(text, hasBenefitKeywords, {
      min: 1000,
      max: 10000000,
    });

    return {
      hasGroupBenefit: true,
      groupBenefit: value,
    };
  }

  return null;
}

function extractOccupation(text) {
  const normalized = normalizeText(text);
  const compact = normalizeCompact(text);

  const explicit = normalized.match(
    /(?:อาชีพ|ทำงานเป็น|ประกอบอาชีพ|ทำงานด้าน)\s*[:：-]?\s*([^,;|]{2,40})/
  );

  if (explicit) {
    return explicit[1]
      .replace(/\s*(งบ|อายุ|เพศ|สนใจ|ไม่มีโรค|มีโรค).*$/g, "")
      .replace(/ครับ|ค่ะ|คะ|จ้า|นะครับ|นะคะ/g, "")
      .trim()
      .slice(0, 40);
  }

  const occupationAliases = [
    ["แพทย์", "แพทย์"],
    ["หมอ", "แพทย์"],
    ["พยาบาล", "พยาบาล"],
    ["ทันตแพทย์", "ทันตแพทย์"],
    ["เภสัชกร", "เภสัชกร"],
    ["ข้าราชการ", "ข้าราชการ"],
    ["รับราชการ", "ข้าราชการ"],
    ["พนักงานบริษัท", "พนักงานบริษัท"],
    ["พนักงานออฟฟิศ", "พนักงานบริษัท"],
    ["มนุษย์เงินเดือน", "พนักงานบริษัท"],
    ["เจ้าของกิจการ", "เจ้าของกิจการ"],
    ["ธุรกิจส่วนตัว", "เจ้าของกิจการ"],
    ["ค้าขาย", "ค้าขาย"],
    ["ฟรีแลนซ์", "ฟรีแลนซ์"],
    ["ครู", "ครู"],
    ["อาจารย์", "อาจารย์"],
    ["วิศวกร", "วิศวกร"],
    ["สถาปนิก", "สถาปนิก"],
    ["ตำรวจ", "ตำรวจ"],
    ["ทหาร", "ทหาร"],
    ["เกษตรกร", "เกษตรกร"],
    ["ว่างงาน", "ไม่ได้ประกอบอาชีพ"],
    ["แม่บ้าน", "แม่บ้าน"],
    ["นักเรียน", "นักเรียน"],
    ["นักศึกษา", "นักศึกษา"],
  ];

  const cleaned = compact
    .replace(/ครับ|ค่ะ|คะ|จ้า|นะครับ|นะคะ/g, "")
    .trim();

  for (const [alias, canonical] of occupationAliases) {
    if (cleaned === normalizeCompact(alias)) {
      return canonical;
    }
  }

  return null;
}

function extractFocus(text) {
  const normalized = normalizeText(text);
  const focus = new Set();

  const ipdNegated = /(?:ไม่เอา|ไม่เน้น|ไม่ต้องการ|ไม่สนใจ|ไม่รวม|ตัด)\s*(?:ipd|ผู้ป่วยใน)/.test(normalized);
  const opdNegated = /(?:ไม่เอา|ไม่เน้น|ไม่ต้องการ|ไม่สนใจ|ไม่รวม|ตัด)\s*(?:opd|ผู้ป่วยนอก)/.test(normalized);

  if (containsAny(normalized, HEALTH_INSURANCE_KEYWORDS)) {
    focus.add("health");
  }

  if (!ipdNegated && containsAny(normalized, IPD_KEYWORDS)) {
    focus.add("ipd");
    focus.add("health");
  }

  if (!opdNegated && containsAny(normalized, OPD_KEYWORDS)) {
    focus.add("opd");
    focus.add("health");
  }

  if (containsAny(normalized, CRITICAL_ILLNESS_KEYWORDS)) {
    focus.add("critical_illness");
  }

  if (containsAny(normalized, LIFE_KEYWORDS)) {
    focus.add("life");
  }

  if (containsAny(normalized, ACCIDENT_KEYWORDS)) {
    focus.add("accident");
  }

  return [...focus];
}

function extractHealthStatus(text) {
  const normalized = normalizeText(text);
  const matchedNegativePhrases = HEALTH_NEGATIVE_PHRASES.filter((phrase) =>
    normalized.includes(normalizeText(phrase))
  );

  let positiveScanText = normalized;

  for (const phrase of matchedNegativePhrases) {
    positiveScanText = positiveScanText.replaceAll(normalizeText(phrase), " ");
  }

  const matchedPositiveKeywords = HEALTH_POSITIVE_KEYWORDS.filter((keyword) =>
    positiveScanText.includes(normalizeText(keyword))
  );

  const hasNegative = matchedNegativePhrases.length > 0;
  const hasPositive = matchedPositiveKeywords.length > 0;

  if (hasNegative && hasPositive) {
    return {
      healthStatus: "conflict",
      needsHumanReview: true,
    };
  }

  if (hasPositive) {
    return {
      healthStatus: "yes",
      needsHumanReview: true,
    };
  }

  if (hasNegative) {
    return {
      healthStatus: "none",
      needsHumanReview: false,
    };
  }

  return null;
}

function parseStandaloneAmount(text, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const normalized = normalizeText(text);
  const numeric = parseNumericToken(normalized);
  const wordNumber = parseThaiWordNumber(normalized);
  const value = numeric ?? wordNumber;

  if (value === null || value < min || value > max) {
    return null;
  }

  return value;
}

function extractContextualAnswer(message, profile) {
  const normalized = normalizeText(message);
  const compact = normalizeCompact(message);
  const field = profile?.lastAskedField;

  if (!field) {
    return {};
  }

  if (field === "age") {
    const value = parseStandaloneAmount(message, { min: 1, max: 99 });
    return value !== null ? { age: value } : {};
  }

  if (field === "gender") {
    if (["หญิง", "ญ", "ผู้หญิง", "female", "f"].includes(compact)) {
      return { gender: "female" };
    }
    if (["ชาย", "ช", "ผู้ชาย", "male", "m"].includes(compact)) {
      return { gender: "male" };
    }
  }

  if (field === "annualBudget") {
    const value = parseStandaloneAmount(message, { min: 1000, max: 2000000 });
    return value !== null ? { annualBudget: value } : {};
  }

  if (field === "roomBudget") {
    const value = parseStandaloneAmount(message, { min: 500, max: 100000 });
    return value !== null ? { roomBudget: value } : {};
  }

  if (field === "groupBenefit") {
    if (/^(ไม่มี|ไม่มีครับ|ไม่มีค่ะ|ไม่มีคะ|ไม่มีเลย|ไม่มีสวัสดิการ|ไม่มีประกันกลุ่ม)$/.test(compact)) {
      return { hasGroupBenefit: false, groupBenefit: 0 };
    }

    const value = parseStandaloneAmount(message, { min: 1000, max: 10000000 });
    if (value !== null) {
      return { hasGroupBenefit: true, groupBenefit: value };
    }

    if (containsAny(normalized, ["มีครับ", "มีค่ะ", "มีคะ", "มีอยู่", "มีสวัสดิการ", "มีประกันกลุ่ม"])) {
      return { hasGroupBenefit: true, groupBenefit: null };
    }
  }

  if (field === "healthStatus") {
    if (/^(ไม่มี|ไม่มีครับ|ไม่มีค่ะ|ไม่มีคะ|ไม่มีเลย|ปกติ|ปกติครับ|ปกติค่ะ|แข็งแรง|สุขภาพดี)$/.test(compact)) {
      return { healthStatus: "none", needsHumanReview: false };
    }

    if (/^(มี|มีครับ|มีค่ะ|มีคะ)$/.test(compact)) {
      return { healthStatus: "yes", needsHumanReview: true };
    }
  }

  if (field === "occupation") {
    const cleaned = normalized
      .replace(/ครับ|ค่ะ|คะ|จ้า|นะครับ|นะคะ/g, "")
      .trim();
    if (cleaned.length >= 2 && cleaned.length <= 40) {
      return { occupation: cleaned };
    }
  }

  return {};
}

function extractProfileUpdates(message, profile) {
  const normalized = normalizeText(message);
  const updates = {};

  const age = extractAge(normalized);
  const gender = extractGender(normalized);
  const annualBudget = extractAnnualBudget(normalized);
  const roomBudget = extractRoomBudget(normalized);
  const focus = extractFocus(normalized);
  const health = extractHealthStatus(normalized);
  const benefit = extractGroupBenefit(normalized);
  const occupation = extractOccupation(normalized);
  const budgetFlexible = containsAny(normalized, [
    "ไม่จำกัดงบ",
    "งบไม่จำกัด",
    "ไม่ติดงบ",
    "งบได้หมด",
    "จ่ายได้ไม่จำกัด",
    "ขอแผนดีสุดไม่จำกัดงบ",
  ]);

  if (age !== null) updates.age = age;
  if (gender) updates.gender = gender;
  if (annualBudget !== null) {
    updates.annualBudget = annualBudget;
    updates.budgetFlexible = false;
  }
  if (roomBudget !== null) updates.roomBudget = roomBudget;
  if (focus.length > 0) updates.focus = focus;
  if (health) Object.assign(updates, health);
  if (benefit) Object.assign(updates, benefit);
  if (occupation) updates.occupation = occupation;
  if (budgetFlexible) {
    updates.budgetFlexible = true;
    updates.annualBudget = null;
  }

  Object.assign(updates, extractContextualAnswer(message, profile));

  if (containsAny(normalized, PLAN_INTENT_KEYWORDS)) {
    updates.intent = "plan";
  }

  return updates;
}

function applyProfileUpdates(profile, updates, { replaceFocus = false } = {}) {
  const next = {
    ...profile,
    ...updates,
  };

  if (updates.focus) {
    next.focus = replaceFocus
      ? [...new Set(updates.focus)]
      : [...new Set([...(profile.focus || []), ...updates.focus])];
  }

  next.askedFields = Array.isArray(profile.askedFields)
    ? [...profile.askedFields]
    : [];

  if (profile.lastAskedField && Object.prototype.hasOwnProperty.call(updates, profile.lastAskedField)) {
    next.lastAskedField = null;
  }

  return next;
}

function hasValue(profile, field) {
  switch (field) {
    case "focus":
      return Array.isArray(profile.focus) && profile.focus.length > 0;
    case "groupBenefit":
      return profile.hasGroupBenefit !== null;
    case "annualBudget":
      return profile.budgetFlexible === true || profile.annualBudget !== null;
    case "roomBudget":
      return profile.roomBudget !== null;
    default:
      return profile[field] !== null && profile[field] !== undefined;
  }
}

function getRequiredFields(profile) {
  const fields = [
    "age",
    "gender",
    "occupation",
    "annualBudget",
    "focus",
    "healthStatus",
  ];

  const wantsHealthOrIpd = (profile.focus || []).some((item) =>
    ["health", "ipd"].includes(item)
  );

  if (wantsHealthOrIpd) {
    fields.push("groupBenefit", "roomBudget");
  }

  return fields;
}

function getMissingFields(profile) {
  return getRequiredFields(profile).filter((field) => !hasValue(profile, field));
}

function questionForField(field) {
  const questions = {
    age: "รบกวนแจ้งอายุปัจจุบันครับ",
    gender: "รบกวนแจ้งเพศครับ",
    annualBudget:
      "งบประมาณที่สะดวกจ่ายต่อปีประมาณเท่าไรครับ เช่น 20,000 บาทต่อปี",
    focus:
      "ต้องการเน้นความคุ้มครองส่วนไหนครับ เช่น IPD ผู้ป่วยใน, OPD, โรคร้ายแรง หรือประกันชีวิต",
    healthStatus:
      "มีโรคประจำตัว ประวัติผ่าตัด นอนโรงพยาบาล หรือยาที่ทานประจำไหมครับ หากไม่มีแจ้งว่าไม่มีประวัติสุขภาพได้เลยครับ",
    groupBenefit:
      "ปัจจุบันมีประกันกลุ่มหรือสวัสดิการค่ารักษาจากที่ทำงานไหมครับ หากมี รบกวนแจ้งวงเงินโดยประมาณครับ",
    roomBudget:
      "ต้องการค่าห้องเดี่ยวประมาณเท่าไรต่อคืนครับ หรือใช้โรงพยาบาลเอกชนระดับใดเป็นหลักครับ",
    occupation: "รบกวนแจ้งอาชีพครับ",
  };

  return questions[field] || `รบกวนแจ้ง${FIELD_LABELS[field] || field}ครับ`;
}

function markFieldAsked(profile, field) {
  const askedFields = new Set(profile.askedFields || []);
  askedFields.add(field);

  return {
    ...profile,
    askedFields: [...askedFields],
    lastAskedField: field,
  };
}

function formatMoney(value) {
  if (value === null || value === undefined) {
    return "ยังไม่ระบุ";
  }

  return `${Number(value).toLocaleString("th-TH")} บาท`;
}

function formatGender(gender) {
  if (gender === "female") return "หญิง";
  if (gender === "male") return "ชาย";
  return "ยังไม่ระบุ";
}

function formatFocus(focus) {
  const labels = {
    health: "ประกันสุขภาพ",
    ipd: "IPD ผู้ป่วยใน",
    opd: "OPD ผู้ป่วยนอก",
    critical_illness: "โรคร้ายแรง",
    life: "ประกันชีวิต",
    accident: "อุบัติเหตุ",
  };

  return (focus || []).map((item) => labels[item] || item).join(", ") || "ยังไม่ระบุ";
}

function buildProfileContext(profile) {
  const groupBenefit =
    profile.hasGroupBenefit === false
      ? "ไม่มีประกันกลุ่ม/สวัสดิการเดิม"
      : profile.hasGroupBenefit === true
        ? profile.groupBenefit
          ? `มีวงเงินประมาณ ${formatMoney(profile.groupBenefit)}`
          : "มีประกันกลุ่ม/สวัสดิการเดิม แต่ยังไม่ทราบวงเงิน"
        : "ยังไม่ระบุ";

  const health =
    profile.healthStatus === "none"
      ? "ลูกค้าแจ้งว่าไม่มีประวัติสุขภาพหรือโรคประจำตัว"
      : profile.healthStatus === "yes"
        ? "มีประวัติสุขภาพ ต้องให้หมอกึ๊กประเมิน"
        : profile.healthStatus === "conflict"
          ? "ข้อมูลสุขภาพขัดแย้ง ต้องให้หมอกึ๊กตรวจสอบ"
          : "ยังไม่ระบุ";

  return [
    `อายุ: ${profile.age ?? "ยังไม่ระบุ"}`,
    `เพศ: ${formatGender(profile.gender)}`,
    `งบต่อปี: ${
      profile.budgetFlexible
        ? "ไม่จำกัดงบ"
        : formatMoney(profile.annualBudget)
    }`,
    `ความสนใจ: ${formatFocus(profile.focus)}`,
    `ค่าห้องต่อคืน: ${formatMoney(profile.roomBudget)}`,
    `ประกันกลุ่ม/สวัสดิการ: ${groupBenefit}`,
    `อาชีพ: ${profile.occupation || "ยังไม่ระบุ"}`,
    `สถานะสุขภาพ: ${health}`,
  ].join("\n");
}

function buildReceivedSummary(profile, updatedFields) {
  const parts = [];

  if (updatedFields.includes("age")) parts.push(`อายุ ${profile.age} ปี`);
  if (updatedFields.includes("gender")) parts.push(`เพศ${formatGender(profile.gender)}`);
  if (updatedFields.includes("annualBudget")) {
    parts.push(
      profile.budgetFlexible
        ? "งบไม่จำกัด"
        : `งบต่อปี ${formatMoney(profile.annualBudget)}`
    );
  }
  if (updatedFields.includes("occupation")) {
    parts.push(`อาชีพ ${profile.occupation}`);
  }
  if (updatedFields.includes("roomBudget")) {
    parts.push(`ค่าห้อง ${formatMoney(profile.roomBudget)} ต่อคืน`);
  }
  if (updatedFields.includes("focus")) {
    parts.push(`เน้น ${formatFocus(profile.focus)}`);
  }
  if (updatedFields.includes("healthStatus")) {
    if (profile.healthStatus === "none") parts.push("ไม่มีประวัติสุขภาพ");
    if (profile.healthStatus === "yes") parts.push("มีประวัติสุขภาพ");
    if (profile.healthStatus === "conflict") parts.push("ข้อมูลสุขภาพยังขัดแย้ง");
  }
  if (updatedFields.includes("groupBenefit")) {
    if (profile.hasGroupBenefit === false) parts.push("ไม่มีประกันกลุ่ม");
    if (profile.hasGroupBenefit === true && profile.groupBenefit) {
      parts.push(`ประกันกลุ่ม ${formatMoney(profile.groupBenefit)}`);
    }
  }

  if (parts.length === 0) {
    return "";
  }

  return `รับข้อมูลแล้วครับ: ${parts.join(" / ")}`;
}

function shouldAskForMissingInfo(profile, normalizedMessage, updates) {
  if (profile.intent === "plan") return true;
  if (containsAny(normalizedMessage, PLAN_INTENT_KEYWORDS)) return true;
  return Object.keys(updates).some((field) => PROFILE_FIELDS.includes(field));
}

function shouldGenerateRecommendation(profile, normalizedMessage) {
  if (getMissingFields(profile).length > 0) return false;
  if (profile.healthStatus !== "none") return false;

  return (
    profile.intent === "plan" ||
    containsAny(normalizedMessage, [
      "แนะนำ",
      "วางแผน",
      "เลือกแผน",
      "หาแผน",
      "สนใจประกัน",
      "ขอเบี้ย",
      "เบี้ยเท่าไหร่",
      "ทำตัวไหนดี",
      "เอาแผนไหนดี",
      "ช่วยดูให้หน่อย",
    ])
  );
}

function shouldAttachCarePlus(planName) {
  return [
    "D Health Lite",
    "เหมาจ่ายเอ๊กตร้า",
    "Extra Care Plus",
  ].includes(planName);
}

function chooseHealthPlan(profile) {
  const roomBudget = Number(profile.roomBudget || 0);
  const annualBudget = Number(profile.annualBudget || 0);
  const highBudget =
    profile.budgetFlexible === true || annualBudget >= 30000;

  if (roomBudget >= 10000 && highBudget) {
    return {
      planName: "Elite Health Plus",
      attachCarePlus: false,
    };
  }

  return {
    planName: "D Health Lite",
    attachCarePlus: true,
  };
}

function buildHealthRecommendation(profile) {
  const choice = chooseHealthPlan(profile);
  const summary = [
    `อายุ ${profile.age} ปี`,
    `เพศ${formatGender(profile.gender)}`,
    `อาชีพ ${profile.occupation}`,
    profile.budgetFlexible
      ? "งบไม่จำกัด"
      : `งบประมาณ ${formatMoney(profile.annualBudget)} ต่อปี`,
    `เน้น ${formatFocus(profile.focus)}`,
    `ค่าห้องประมาณ ${formatMoney(profile.roomBudget)} ต่อคืน`,
    profile.hasGroupBenefit
      ? profile.groupBenefit
        ? `มีประกันกลุ่มประมาณ ${formatMoney(profile.groupBenefit)}`
        : "มีประกันกลุ่ม แต่ยังไม่ทราบวงเงิน"
      : "ไม่มีประกันกลุ่ม",
    "ลูกค้าแจ้งว่าไม่มีประวัติสุขภาพ",
  ].join(" / ");

  if (choice.planName === "Elite Health Plus") {
    return (
      `จากข้อมูลที่แจ้งไว้ ${summary}\n\n` +
      "เบื้องต้นแนะนำ Elite Health Plus เป็นแผนสุขภาพหลักครับ " +
      "เพราะต้องการค่าห้องตั้งแต่ 10,000 บาทขึ้นไป และงบอยู่ในระดับที่เหมาะกับแผนนี้ครับ\n\n" +
      "สำหรับ Elite Health Plus ไม่จำเป็นต้องเสริม Care Plus เพิ่มครับ\n\n" +
      "ตัวเลขเบี้ยจริงต้องตรวจตามอายุ เพศ อาชีพ และแบบประกันที่เลือกอีกครั้งครับ"
    );
  }

  const roomExplanation =
    Number(profile.roomBudget || 0) <= 10000
      ? "เหมาะกับการเน้น IPD และความต้องการค่าห้องประมาณ 5,000-10,000 บาท โดยไม่ต้องหาแผนค่าห้องอื่นเพิ่มครับ"
      : "เนื่องจากงบประมาณยังจำกัดเมื่อเทียบกับค่าห้องที่ต้องการ จึงให้เริ่มจาก D Health Lite และใช้สิทธิ์เครือข่ายช่วยควบคุมส่วนต่างค่าห้องก่อนครับ";

  return (
    `จากข้อมูลที่แจ้งไว้ ${summary}\n\n` +
    "เบื้องต้นแนะนำ D Health Lite เป็นแผนสุขภาพหลักครับ " +
    `${roomExplanation}\n\n` +
    "หากแอดมิดโรงพยาบาลในเครือ MTL Smile Network ไม่ต้องเสียส่วนต่างค่าห้องตามเงื่อนไขเครือข่ายครับ " +
    "ส่วนโรงพยาบาลคู่สัญญาบางแห่ง ตัวแทนอาจช่วยขอส่วนลดค่าห้องให้ได้ครับ\n\n" +
    "แนะนำพิจารณา Care Plus เพิ่มควบคู่กัน เพื่อเสริมความคุ้มครองโรคร้ายแรงตามเงื่อนไขแบบประกันครับ\n\n" +
    "ตัวเลขเบี้ยจริงต้องตรวจตามอายุ เพศ อาชีพ และแบบประกันที่เลือกอีกครั้งครับ"
  );
}

function containsForbiddenProduct(answer) {
  return FORBIDDEN_PRODUCT_PATTERNS.some((pattern) =>
    pattern.test(String(answer || ""))
  );
}

async function askInsuranceAI(question, profile, requestUrl) {
  const apiUrl = new URL("/api/insurance-chat", requestUrl);
  const profileContext = buildProfileContext(profile);

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      question:
        `${CURRENT_PRODUCT_RULES}\n\n` +
        `ใช้ข้อมูลลูกค้าที่ระบบจำไว้ด้านล่างตอบคำถามล่าสุด ` +
        `ห้ามถามซ้ำข้อมูลที่มีแล้ว หากต้องถามเพิ่มให้ถามเฉพาะข้อมูลที่ยังขาดเพียงข้อเดียว ` +
        `ถ้ามีอาชีพแล้วห้ามถามอาชีพซ้ำ ` +
        `ห้ามสรุปว่าลูกค้ามีโรคเมื่อสถานะสุขภาพระบุว่าไม่มีประวัติสุขภาพ ` +
        `ห้ามยืนยันผลรับประกันหรือแต่งตัวเลขเบี้ยที่ไม่มีแหล่งข้อมูล ` +
        `ตอบเป็นภาษาไทย ลงท้ายครับ และห้ามใช้ Markdown ห้ามใส่ ** หรือ URL ครับ\n\n` +
        `ข้อมูลลูกค้า:\n${profileContext}\n\n` +
        `คำถามล่าสุด:\n${question}`,
      resources: [],
      allowWebSearch: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Insurance AI failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();

  if (!data?.answer) {
    throw new Error("Insurance AI returned no answer");
  }

  const answer = sanitizeLineText(data.answer);

  if (containsForbiddenProduct(answer)) {
    if (
      profile.healthStatus === "none" &&
      (profile.focus || []).some((item) => ["health", "ipd"].includes(item)) &&
      getMissingFields(profile).length === 0
    ) {
      return buildHealthRecommendation(profile);
    }

    return (
      "ขออภัยครับ ระบบพบชื่อแผนที่ปิดการขายในคำตอบ จึงไม่นำคำตอบนั้นมาแสดงครับ " +
      "ปัจจุบันให้พิจารณา D Health Lite หรือ Elite Health Plus ตามงบและค่าห้องที่ต้องการครับ"
    );
  }

  return answer;
}

async function processCustomerMessage({ message, userId, requestUrl }) {
  const normalized = normalizeText(message);

  if (isResetRequest(normalized)) {
    await clearProfile(userId);
    return "ล้างข้อมูลเดิมเรียบร้อยแล้วครับ เริ่มแจ้งข้อมูลใหม่ได้เลยครับ";
  }

  let profile = await loadProfile(userId);

  if (isResumeBotRequest(normalized)) {
    profile.botMode = "ai";
    await saveProfile(userId, profile);
    return "เปิดผู้ช่วยอัตโนมัติสำหรับแชตนี้อีกครั้งแล้วครับ";
  }

  if (isContactRequest(normalized)) {
    profile.botMode = "human";
    await saveProfile(userId, profile);

    return (
      "รับทราบครับ ปิดผู้ช่วยอัตโนมัติสำหรับแชตของคุณชั่วคราวแล้วครับ " +
      "จากนี้เจ้าหน้าที่สามารถเข้ามาตอบเองได้ โดยบอตจะไม่แทรกการสนทนาครับ\n\n" +
      "เมื่อต้องการกลับมาใช้บอต ให้กดปุ่ม เปิดผู้ช่วยอัตโนมัติ หรือพิมพ์ว่า กลับมาใช้บอต ครับ"
    );
  }

  if (profile.botMode === "human") {
    return null;
  }

  const updates = extractProfileUpdates(message, profile);
  const updatedFields = Object.keys(updates).filter((field) =>
    PROFILE_FIELDS.includes(field)
  );
  const correctionRequested = isCorrectionRequest(normalized);

  profile = applyProfileUpdates(profile, updates, {
    replaceFocus: correctionRequested,
  });

  if (correctionRequested && updatedFields.length > 0) {
    profile.askedFields = (profile.askedFields || []).filter(
      (field) => !updatedFields.includes(field)
    );
  }

  profile = await saveProfile(userId, profile);

  if (profile.healthStatus === "conflict") {
    return (
      "ข้อมูลสุขภาพมีข้อความที่ขัดกันครับ เช่น มีทั้งข้อความว่าไม่มีโรคและมีรายละเอียดการรักษา " +
      "ขออนุญาตให้หมอกึ๊กตรวจสอบจากข้อความต้นฉบับโดยตรงครับ"
    );
  }

  if (profile.healthStatus === "yes" || profile.needsHumanReview) {
    return (
      "รับข้อมูลแล้วครับ เนื่องจากมีประวัติสุขภาพ การรักษา ยาประจำ หรือประวัติเข้าโรงพยาบาลร่วมด้วย " +
      "ขออนุญาตส่งต่อให้หมอกึ๊กประเมินรายละเอียดโดยตรงครับ"
    );
  }

  if (
    isGreeting(normalized) &&
    updatedFields.length === 0 &&
    profile.intent !== "plan"
  ) {
    return (
      "สวัสดีครับ 😊 หมอกึ๊กจากเมืองไทยประกันชีวิตครับ\n\n" +
      "สอบถามเรื่องประกันสุขภาพ IPD, OPD, โรคร้ายแรง ชีวิต หรือการวางแผนความคุ้มครองได้เลยครับ"
    );
  }

  if (isShortAcknowledgement(normalized) && updatedFields.length === 0) {
    const missing = getMissingFields(profile);
    const unasked = missing.find(
      (field) => !(profile.askedFields || []).includes(field)
    );

    if (unasked) {
      profile = markFieldAsked(profile, unasked);
      await saveProfile(userId, profile);
      return questionForField(unasked);
    }

    return "ครับ 😊 ส่งข้อมูลหรือคำถามเรื่องประกันเพิ่มเติมมาได้เลยครับ";
  }

  const missingFields = getMissingFields(profile);

  if (shouldAskForMissingInfo(profile, normalized, updates) && missingFields.length > 0) {
    const nextUnaskedField = missingFields.find(
      (field) => !(profile.askedFields || []).includes(field)
    );

    const summary = buildReceivedSummary(profile, updatedFields);

    if (nextUnaskedField) {
      profile = markFieldAsked(profile, nextUnaskedField);
      await saveProfile(userId, profile);

      return [summary, questionForField(nextUnaskedField)]
        .filter(Boolean)
        .join("\n\n");
    }

    // เคยถามข้อมูลที่ยังขาดไปแล้ว จึงไม่ถามซ้ำ
    if (summary) {
      return (
        `${summary}\n\n` +
        "ผมจำข้อมูลเดิมไว้แล้วครับ ข้อมูลส่วนที่ยังไม่ได้แจ้งสามารถส่งเพิ่มภายหลังได้ โดยไม่ต้องกรอกข้อมูลเดิมซ้ำครับ"
      );
    }

    return (
      "ผมจำข้อมูลที่แจ้งไว้แล้วครับ ข้อมูลบางส่วนที่จำเป็นยังไม่ครบและเคยสอบถามไปแล้ว " +
      "ส่งเฉพาะข้อมูลที่ยังไม่ได้แจ้งมาเพิ่มได้เลยครับ"
    );
  }

  if (shouldGenerateRecommendation(profile, normalized)) {
    const wantsHealthPlan = (profile.focus || []).some((item) =>
      ["health", "ipd"].includes(item)
    );

    if (wantsHealthPlan) {
      return buildHealthRecommendation(profile);
    }

    return askInsuranceAI(message, profile, requestUrl);
  }

  if (updatedFields.length > 0) {
    const summary = buildReceivedSummary(profile, updatedFields);
    return `${summary || "รับข้อมูลแล้วครับ"}\n\nผมบันทึกข้อมูลไว้แล้วครับ`;
  }

  // คำถามทั่วไปหรือข้อความที่กฎจับไม่ได้ ใช้ AI โดยแนบข้อมูลเดิมทั้งหมด
  return askInsuranceAI(message, profile, requestUrl);
}

export default {
  async fetch(request) {
    if (request.method === "GET") {
      return Response.json({
        ok: true,
        service: "Doctor Gug LINE Webhook",
        mode: "Persistent Memory + Rules + AI",
        memoryConfigured: Boolean(getRedisConfig()),
      });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const channelSecret = process.env.LINE_CHANNEL_SECRET;
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

    if (!channelSecret || !channelAccessToken) {
      console.error("Missing LINE environment variables");
      return new Response("Server configuration error", { status: 500 });
    }

    const rawBody = await request.text();
    const signature = request.headers.get("x-line-signature") || "";

    const validSignature = verifyLineSignature(
      rawBody,
      signature,
      channelSecret
    );

    if (!validSignature) {
      console.error("Invalid LINE signature");
      return new Response("Invalid signature", { status: 401 });
    }

    let body;

    try {
      body = JSON.parse(rawBody);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const events = Array.isArray(body.events) ? body.events : [];

    for (const event of events) {
      const isTextMessage =
        event.type === "message" &&
        event.message?.type === "text" &&
        event.replyToken;

      if (!isTextMessage) {
        continue;
      }

      const isNewEvent = await claimWebhookEvent(event.webhookEventId);

      if (!isNewEvent) {
        console.log("Skipped duplicate LINE webhook event", {
          webhookEventId: event.webhookEventId,
        });
        continue;
      }

      const customerMessage = event.message.text?.trim() || "";
      const userId = event.source?.userId;

      try {
        if (!userId) {
          throw new Error("LINE userId is missing");
        }

        const finalReply = await processCustomerMessage({
          message: customerMessage,
          userId,
          requestUrl: request.url,
        });

        if (finalReply) {
          await replyToLine(event.replyToken, finalReply);
        } else {
          console.log("LINE bot paused for this user; no automatic reply", {
            userId,
          });
        }
      } catch (error) {
        console.error("Failed to process LINE message", error);

        try {
          await replyToLine(
            event.replyToken,
            "ขออภัยครับ ระบบไม่สามารถประมวลผลคำถามนี้ได้ในขณะนี้ ขออนุญาตส่งต่อให้หมอกึ๊กตอบโดยตรงครับ"
          );
        } catch (replyError) {
          console.error("Failed to send LINE fallback reply", replyError);
        }
      }
    }

    return new Response("OK", { status: 200 });
  },
};

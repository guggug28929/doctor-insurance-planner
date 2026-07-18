import crypto from "node:crypto";
import { brochureReply, isBrochureAcceptance } from "../lib/brochures.js";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 90;
const EVENT_TTL_SECONDS = 60 * 60 * 24;
const fallbackClaimedEvents = new Map();

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

function verifyLineSignature(rawBody, signature, channelSecret) {
  const expected = crypto
    .createHmac("sha256", channelSecret)
    .update(rawBody)
    .digest("base64");

  const receivedBuffer = Buffer.from(signature || "");
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

function sanitizeLineText(message) {
  return String(message || "")
    .replace(/D\s*Health\s*Plus/gi, "D Health Lite")
    .replace(/ดิฉัน/g, "ผม")
    .replace(/ฉัน/g, "ผม")
    .replace(/นะค่ะ/g, "นะครับ")
    .replace(/นะคะ/g, "นะครับ")
    .replace(/ค่ะ/g, "ครับ")
    .replace(/คะ/g, "ครับ")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/__+/g, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/`{1,3}/g, "")
    .replace(/https?:\/\/(?!doctor-insurance\.com\b)\S+/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 4900);
}

function messageQuickReply(label, text = label) {
  return {
    type: "action",
    action: {
      type: "message",
      label,
      text,
    },
  };
}

function quickRepliesForMissingField(field) {
  if (field === "gender") {
    // คำสั่งเจ้าของงาน: แสดงเพียงสองเพศตามเอกสารที่ใช้สมัคร
    return [messageQuickReply("ชาย", "เพศชาย"), messageQuickReply("หญิง", "เพศหญิง")];
  }
  if (field === "healthStatus") {
    return [
      messageQuickReply("ไม่มีประวัติ", "ไม่มีโรคประจำตัว"),
      messageQuickReply("มีประวัติ", "มีโรคประจำตัว"),
    ];
  }
  if (field === "hasGroupBenefit") {
    return [
      messageQuickReply("ไม่มี", "ไม่มีประกันกลุ่ม"),
      messageQuickReply("มี", "มีประกันกลุ่ม"),
    ];
  }
  if (field === "criticalIllnessNeed") {
    return [
      messageQuickReply("เน้นค่ารักษา", "เน้นค่ารักษาพยาบาล"),
      messageQuickReply("เน้นเงินก้อน", "เน้นเงินก้อนเจอจ่ายจบ"),
      messageQuickReply("ทั้งสองอย่าง", "ทั้งสองอย่าง"),
    ];
  }
  return [];
}

function quickRepliesForQuote(result) {
  const items = [];
  if (Array.isArray(result?.profile?.pendingBrochureKeys) && result.profile.pendingBrochureKeys.length) {
    items.push(messageQuickReply("ขอรายละเอียด"));
  }
  items.push(messageQuickReply("ดูแผนอื่น"));
  items.push(messageQuickReply("เริ่มใหม่"));
  return items;
}

function quickRepliesForBrochureDetails() {
  return [
    messageQuickReply("คุยกับเจ้าหน้าที่"),
    messageQuickReply("ดูแผนอื่น"),
    messageQuickReply("เริ่มใหม่"),
  ];
}

function quickRepliesForResult(result) {
  if (result?.action === "ask_missing") {
    return quickRepliesForMissingField(result.missingField);
  }
  if (result?.action === "quote" || result?.action === "quote_handoff") {
    return quickRepliesForQuote(result);
  }
  return [];
}

async function replyToLine(replyToken, message, quickReplyItems = []) {
  const textMessage = {
    type: "text",
    text: sanitizeLineText(message),
  };
  if (Array.isArray(quickReplyItems) && quickReplyItems.length) {
    textMessage.quickReply = { items: quickReplyItems.slice(0, 13) };
  }

  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      replyToken,
      messages: [textMessage],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`LINE reply failed: ${response.status} ${detail}`);
  }
}

function redisConfig() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

async function redis(command) {
  const config = redisConfig();
  if (!config) throw new Error("KV_REST_API_URL or KV_REST_API_TOKEN is missing");

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
    throw new Error(data?.error || `Redis HTTP ${response.status}`);
  }
  return data?.result;
}

function profileKey(userId) {
  return `line:profile:${userId}`;
}

async function loadProfile(userId) {
  try {
    const stored = await redis(["GET", profileKey(userId)]);
    if (!stored) return defaultProfile();
    return { ...defaultProfile(), ...JSON.parse(stored) };
  } catch (error) {
    console.error("loadProfile failed", error);
    return defaultProfile();
  }
}

async function saveProfile(userId, profile) {
  const next = {
    ...defaultProfile(),
    ...(profile || {}),
    updatedAt: new Date().toISOString(),
  };
  await redis([
    "SET",
    profileKey(userId),
    JSON.stringify(next),
    "EX",
    String(SESSION_TTL_SECONDS),
  ]);
  return next;
}

async function clearProfile(userId) {
  await redis(["DEL", profileKey(userId)]);
}

async function claimEvent(eventId) {
  if (!eventId) return true;
  try {
    const result = await redis([
      "SET",
      `line:event:${eventId}`,
      "1",
      "EX",
      String(EVENT_TTL_SECONDS),
      "NX",
    ]);
    return result === "OK";
  } catch (error) {
    console.error("claimEvent failed", error);
    const now = Date.now();
    for (const [key, expiresAt] of fallbackClaimedEvents) {
      if (expiresAt <= now) fallbackClaimedEvents.delete(key);
    }
    if (fallbackClaimedEvents.has(eventId)) return false;
    fallbackClaimedEvents.set(eventId, now + EVENT_TTL_SECONDS * 1000);
    return true;
  }
}

function compact(input) {
  return String(input || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .trim();
}

const RESET_COMMANDS = new Set([
  "เริ่มใหม่",
  "ล้างข้อมูล",
  "ลบข้อมูลเดิม",
  "reset",
]);

const HUMAN_COMMANDS = new Set([
  "คุยกับเจ้าหน้าที่",
  "ขอคุยกับเจ้าหน้าที่",
  "คุยกับหมอกึ๊ก",
]);

const RESUME_COMMANDS = new Set([
  "กลับมาใช้บอต",
  "เปิดผู้ช่วยอัตโนมัติ",
  "เปิดบอต",
]);

async function callLineAgent(requestUrl, message, profile) {
  const url = new URL("/api/line-agent", requestUrl);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, profile }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `line-agent HTTP ${response.status}`);
  }
  return data;
}

export default {
  async fetch(request) {
    if (request.method === "GET") {
      return Response.json({
        ok: true,
        service: "Doctor Gug LINE AI Agent",
        model: process.env.OPENAI_MODEL_LINE || "gpt-5.6-luna",
        mode: "AI every turn + deterministic premium calculator",
      });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const channelSecret = process.env.LINE_CHANNEL_SECRET;
    const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!channelSecret || !accessToken) {
      console.error("Missing LINE environment variables");
      return new Response("Server configuration error", { status: 500 });
    }

    const rawBody = await request.text();
    const signature = request.headers.get("x-line-signature") || "";
    if (!verifyLineSignature(rawBody, signature, channelSecret)) {
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
      const isText =
        event.type === "message" &&
        event.message?.type === "text" &&
        event.replyToken;
      if (!isText) continue;

      const eventId = event.webhookEventId || event.message?.id;
      if (!(await claimEvent(eventId))) continue;

      const userId =
        event.source?.userId ||
        event.source?.groupId ||
        event.source?.roomId;
      if (!userId) continue;

      const message = String(event.message.text || "").trim();
      const command = compact(message);
      let profile = await loadProfile(userId);

      try {
        if (command === "ดูแผนอื่น" && profile.lastPlanCode) {
          profile.pendingBrochureKeys = [];
          await saveProfile(userId, profile);
          await replyToLine(
            event.replyToken,
            "ได้เลยครับ ต้องการปรับงบ ค่าห้อง เพิ่ม OPD หรืออยากเน้นความคุ้มครองด้านไหนเป็นพิเศษครับ",
            [
              messageQuickReply("ลดเบี้ย", "อยากลดเบี้ย"),
              messageQuickReply("เพิ่ม OPD", "ต้องการ OPD"),
              messageQuickReply("ปรับค่าห้อง", "อยากปรับค่าห้อง"),
              messageQuickReply("เริ่มใหม่"),
            ]
          );
          continue;
        }

        if (
          Array.isArray(profile.pendingBrochureKeys) &&
          profile.pendingBrochureKeys.length &&
          isBrochureAcceptance(message)
        ) {
          const brochureMessage = brochureReply(
            profile.pendingBrochureKeys,
            "https://doctor-insurance.com"
          );
          profile.pendingBrochureKeys = [];
          await saveProfile(userId, profile);
          await replyToLine(
            event.replyToken,
            brochureMessage,
            quickRepliesForBrochureDetails()
          );
          continue;
        }

        if (RESET_COMMANDS.has(command)) {
          await clearProfile(userId);
          await replyToLine(
            event.replyToken,
            "ล้างข้อมูลเดิมเรียบร้อยแล้วครับ เริ่มแจ้งข้อมูลใหม่ได้เลยครับ"
          );
          continue;
        }

        if (RESUME_COMMANDS.has(command)) {
          profile.botMode = "ai";
          await saveProfile(userId, profile);
          await replyToLine(
            event.replyToken,
            "เปิดผู้ช่วยอัตโนมัติสำหรับแชตนี้แล้วครับ สอบถามต่อได้เลยครับ"
          );
          continue;
        }

        if (HUMAN_COMMANDS.has(command)) {
          profile.botMode = "human";
          await saveProfile(userId, profile);
          await replyToLine(
            event.replyToken,
            "ปิดผู้ช่วยอัตโนมัติสำหรับแชตนี้ชั่วคราวแล้วครับ หมอกึ๊กหรือเจ้าหน้าที่จะเข้ามาตอบต่อโดยตรงครับ"
          );
          continue;
        }

        if (profile.botMode === "human") {
          console.log("LINE bot paused for user", { userId });
          continue;
        }

        const result = await callLineAgent(request.url, message, profile);

        if (result.action === "reset") {
          await clearProfile(userId);
        } else {
          profile = await saveProfile(userId, result.profile || profile);
        }

        if (result.reply) {
          await replyToLine(
            event.replyToken,
            result.reply,
            quickRepliesForResult(result)
          );
        }
      } catch (error) {
        console.error("Failed to process LINE message", error);
        try {
          await replyToLine(
            event.replyToken,
            "ขออภัยครับ ระบบขัดข้องชั่วคราว ขออนุญาตส่งต่อให้หมอกึ๊กตอบโดยตรงครับ"
          );
        } catch (replyError) {
          console.error("Failed to send fallback reply", replyError);
        }
      }
    }

    return new Response("OK", { status: 200 });
  },
};

export {
  quickRepliesForBrochureDetails,
  quickRepliesForMissingField,
  quickRepliesForResult,
};

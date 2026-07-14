import crypto from "node:crypto";

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
  const response = await fetch(
    "https://api.line.me/v2/bot/message/reply",
    {
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
            text: message,
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LINE reply failed: ${response.status} ${errorText}`
    );
  }
}

function containsAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function forceMalePoliteTone(message) {
  return String(message || "")
    .replace(/นะคะ/g, "นะครับ")
    .replace(/ค่ะ/g, "ครับ")
    .replace(/คะ/g, "ครับ");
}

function getRuleBasedReply(message) {
  const text = message.toLowerCase().trim();

  // คำทักทายทั่วไป: ไม่เรียก OpenAI
  if (
    containsAny(text, [
      "สวัสดี",
      "หวัดดี",
      "hello",
      "hi",
      "ดีครับ",
      "ดีค่ะ",
    ])
  ) {
    return {
      handled: true,
      reply:
        "สวัสดีครับ 😊 หมอกึ๊กจากเมืองไทยประกันชีวิตครับ\n\nสอบถามเรื่องประกันสุขภาพ โรคร้ายแรง ชีวิต หรือการวางแผนความคุ้มครองได้เลยครับ",
    };
  }

  // ช่องทางติดต่อ: ไม่เรียก OpenAI
  if (
    containsAny(text, [
      "ติดต่อ",
      "เบอร์โทร",
      "โทรหา",
      "ไลน์ไอดี",
      "line id",
      "นัดคุย",
    ])
  ) {
    return {
      handled: true,
      reply:
        "สามารถพิมพ์รายละเอียดไว้ในแชตนี้ได้เลยครับ หรือแจ้งว่าต้องการให้หมอกึ๊กติดต่อกลับ พร้อมช่วงเวลาที่สะดวกครับ",
    };
  }

  // พบประวัติสุขภาพหรือคำถามการแพทย์: ไม่ส่งเข้า OpenAI
  if (
    containsAny(text, [
      "ผ่าตัด",
      "มะเร็ง",
      "ก้อน",
      "ไทรอยด์",
      "เบาหวาน",
      "ความดัน",
      "หัวใจ",
      "สโตรก",
      "เส้นเลือดสมอง",
      "กินยา",
      "ทานยา",
      "นอนโรงพยาบาล",
      "แอดมิท",
      "ผลชิ้นเนื้อ",
      "ผลตรวจผิดปกติ",
      "โรคประจำตัว",
      "เคยรักษา",
      "เคยป่วย",
      "ตรวจสุขภาพ",
      "ตั้งครรภ์",
    ])
  ) {
    return {
      handled: true,
      reply:
        "เรื่องการวางแผนประกันเบื้องต้นสามารถช่วยดูให้ได้ครับ แต่เนื่องจากมีประวัติสุขภาพร่วมด้วย ขออนุญาตส่งต่อให้หมอกึ๊กประเมินรายละเอียดโดยตรงนะครับ\n\nสามารถพิมพ์ประวัติ การรักษา ยาที่ใช้ และผลตรวจล่าสุดเพิ่มเติมไว้ได้เลยครับ",
    };
  }

  // คำถามเบี้ยที่ข้อมูลยังไม่ครบ: ไม่เรียก OpenAI
  if (
    containsAny(text, [
      "เบี้ยเท่าไหร่",
      "เบี้ยเท่าไร",
      "ราคาเท่าไหร่",
      "ราคาเท่าไร",
      "ปีละกี่บาท",
      "ค่าเบี้ย",
    ])
  ) {
    return {
      handled: true,
      reply:
        "เพื่อคำนวณเบี้ยให้ใกล้เคียงที่สุด รบกวนแจ้งข้อมูลดังนี้ครับ\n\n1. อายุ\n2. เพศ\n3. อาชีพ\n4. งบประมาณต่อปี\n5. มีประกันกลุ่มหรือสวัสดิการเดิมกี่บาท\n6. สนใจประกันสุขภาพ โรคร้ายแรง หรือทั้งสองแบบ",
    };
  }

  return {
    handled: false,
    reply: null,
  };
}

async function askInsuranceAI(question, requestUrl) {
  const apiUrl = new URL("/api/insurance-chat", requestUrl);

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      question,
      resources: [],
      allowWebSearch: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Insurance AI failed: ${response.status} ${errorText}`
    );
  }

  const data = await response.json();

  if (!data?.answer) {
    throw new Error("Insurance AI returned no answer");
  }

  return data.answer;
}

export default {
  async fetch(request) {
    if (request.method === "GET") {
      return Response.json({
        ok: true,
        service: "Doctor Gug LINE Webhook",
        mode: "Hybrid Rule Engine + AI",
      });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405,
      });
    }

    const channelSecret = process.env.LINE_CHANNEL_SECRET;
    const channelAccessToken =
      process.env.LINE_CHANNEL_ACCESS_TOKEN;

    if (!channelSecret || !channelAccessToken) {
      console.error("Missing LINE environment variables");
      return new Response("Server configuration error", {
        status: 500,
      });
    }

    const rawBody = await request.text();
    const signature =
      request.headers.get("x-line-signature") || "";

    const validSignature = verifyLineSignature(
      rawBody,
      signature,
      channelSecret
    );

    if (!validSignature) {
      console.error("Invalid LINE signature");
      return new Response("Invalid signature", {
        status: 401,
      });
    }

    let body;

    try {
      body = JSON.parse(rawBody);
    } catch {
      return new Response("Invalid JSON", {
        status: 400,
      });
    }

    const events = Array.isArray(body.events)
      ? body.events
      : [];

    for (const event of events) {
      const isTextMessage =
        event.type === "message" &&
        event.message?.type === "text" &&
        event.replyToken;

      if (!isTextMessage) {
        continue;
      }

      const customerMessage =
        event.message.text?.trim() || "";

      try {
        const ruleResult =
          getRuleBasedReply(customerMessage);

        let finalReply;

        if (ruleResult.handled) {
          // ตอบจากกฎโดยตรง ไม่เสีย OpenAI token
          finalReply = ruleResult.reply;

          console.log("LINE reply source: rule", {
            messageId: event.message?.id,
            userId: event.source?.userId,
          });
        } else {
          // เฉพาะคำถามที่กฎจับไม่ได้ จึงเรียก OpenAI
          finalReply = await askInsuranceAI(
            customerMessage,
            request.url
          );

          console.log("LINE reply source: AI", {
            messageId: event.message?.id,
            userId: event.source?.userId,
          });
        }

        await replyToLine(
        event.replyToken,
        forceMalePoliteTone(finalReply)
        );
      } catch (error) {
        console.error(
          "Failed to process LINE message",
          error
        );

        await replyToLine(
          event.replyToken,
          "ขออภัยครับ ระบบไม่สามารถประมวลผลคำถามนี้ได้ในขณะนี้ ขออนุญาตส่งต่อให้หมอกึ๊กตอบโดยตรงนะครับ"
        );
      }
    }

    return new Response("OK", {
      status: 200,
    });
  },
};

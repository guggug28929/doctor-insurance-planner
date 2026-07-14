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
    console.error("LINE reply error:", response.status, errorText);
  }
}

export default {
  async fetch(request) {
    if (request.method === "GET") {
      return Response.json({
        ok: true,
        service: "Doctor Gug LINE Webhook",
      });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
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
      return new Response("Invalid JSON", { status: 400 });
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

      await replyToLine(
        event.replyToken,
        `ได้รับข้อความแล้วครับ 😊\n\nคุณพิมพ์ว่า: ${customerMessage}\n\nขณะนี้ระบบ Doctor Gug LINE Bot อยู่ในช่วงทดสอบครับ`
      );
    }

    return new Response("OK", { status: 200 });
  },
};

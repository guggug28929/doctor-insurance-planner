import { google } from "googleapis";

// -----------------------------------------------------------------------
// Daily reminder cron: birthday (HBD) + premium due-date reminders.
//
// Reads the MTL case-tracker Google Sheet and, for every row that already
// has a LINE User ID captured, pushes a LINE message when:
//   - today matches the customer's birthday (วันเกิด)
//   - today matches the 30-day pre-reminder date (วันแจ้งเตือน (30 วันก่อน))
//
// Smile Point reminders are intentionally NOT implemented yet: there is no
// data source or API access to real Muang Thai Life Smile Club point
// balances. A "Smile Point (แต้มสะสม)" column exists in the sheet as a
// placeholder for when that data becomes available; until then this cron
// does not touch it and sends nothing Smile-Point related.
//
// Required environment variables (set in Vercel > Settings > Environment
// Variables -- never commit real values):
//   GOOGLE_SERVICE_ACCOUNT_EMAIL   service account client_email
//   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY   service account private_key
//                                  (paste with literal \n, code unescapes it)
//   SHEET_ID                       the case-tracker spreadsheet ID
//   SHEET_TAB_NAME                 tab/sheet name (default: "Sheet1")
//   LINE_CHANNEL_ACCESS_TOKEN      already configured for line-webhook.js
//
// The service account must be shared as an Editor on the spreadsheet.
// -----------------------------------------------------------------------

const COLUMNS = {
  CASE_NO: 0,
  FIRST_NAME: 1,
  LAST_NAME: 2,
  BIRTHDAY: 3,
  NEXT_DUE_DATE: 12,
  PRE_REMINDER_DATE: 13,
  PREMIUM_AMOUNT: 14,
  LINE_USER_ID: 15,
  LINE_SEND_STATUS: 16,
};

const HEADER_ROWS = 1;

function todayInBangkok() {
  const now = new Date();
  const bangkok = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" })
    );
  return bangkok;
}

function formatThaiDate(date) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// Sheet dates are stored as DD/MM/YYYY text.
function parseSheetDate(value) {
  if (!value) return null;
  const match = String(value).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, d, m, y] = match;
  return { day: Number(d), month: Number(m), year: Number(y) };
}

function isSameMonthDay(parsed, today) {
  if (!parsed) return false;
  return parsed.day === today.getDate() && parsed.month === today.getMonth() + 1;
}

function isSameCalendarDate(parsed, today) {
  if (!parsed) return false;
  return (
    parsed.day === today.getDate() &&
    parsed.month === today.getMonth() + 1 &&
    parsed.year === today.getFullYear()
    );
}

function sheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !rawKey) {
    throw new Error(
      "Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"
      );
  }
  const privateKey = rawKey.replace(/\\n/g, "\n");
  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

async function pushLineMessage(userId, text) {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) throw new Error("Missing LINE_CHANNEL_ACCESS_TOKEN");

const response = await fetch("https://api.line.me/v2/bot/message/push", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    to: userId,
    messages: [{ type: "text", text: text.slice(0, 4900) }],
  }),
});

if (!response.ok) {
  const detail = await response.text();
  throw new Error(`LINE push failed: ${response.status} ${detail}`);
}
}

function birthdayMessage(firstName) {
  return `สุขสันต์วันเกิดครับคุณ${firstName} 🎉\nขอบคุณที่ไว้วางใจให้หมอกึ๊กดูแลเรื่องประกันนะครับ มีอะไรให้ช่วยแจ้งมาได้เลยครับ`;
}

function premiumDueMessage(firstName, dueDateText, amountText) {
  return `เรียนคุณ${firstName} ครับ\nกรมธรรม์ของคุณครบกำหนดชำระเบี้ยวันที่ ${dueDateText} จำนวน ${amountText} บาท\nหากต้องการให้หมอกึ๊กช่วยตรวจสอบหรือแจ้งช่องทางชำระ แจ้งมาได้เลยครับ`;
}

async function readRows(sheets, spreadsheetId, tab) {
  const range = `${tab}!A${HEADER_ROWS + 1}:Y`;
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });
  return result.data.values || [];
}

async function writeStatus(sheets, spreadsheetId, tab, rowIndex, statusText) {
  // rowIndex is 0-based within the data rows (excludes header)
const rowNumber = rowIndex + HEADER_ROWS + 1;
  const column = String.fromCharCode("A".charCodeAt(0) + COLUMNS.LINE_SEND_STATUS);
  const range = `${tab}!${column}${rowNumber}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "RAW",
    requestBody: { values: [[statusText]] },
  });
}

export default {
  async fetch(request) {
    // Vercel Cron sends a GET request; allow manual POST testing too.
  if (request.method !== "GET" && request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const spreadsheetId = process.env.SHEET_ID;
    const tab = process.env.SHEET_TAB_NAME || "Sheet1";
    if (!spreadsheetId) {
      return Response.json({ ok: false, error: "Missing SHEET_ID" }, { status: 500 });
    }

  let sheets;
    try {
      sheets = sheetsClient();
    } catch (error) {
      console.error("Sheets auth failed", error);
      return Response.json({ ok: false, error: String(error.message || error) }, { status: 500 });
    }

  let rows;
    try {
      rows = await readRows(sheets, spreadsheetId, tab);
    } catch (error) {
      console.error("Failed to read sheet", error);
      return Response.json({ ok: false, error: String(error.message || error) }, { status: 500 });
    }

  const today = todayInBangkok();
    const summary = { birthdaysSent: 0, dueRemindersSent: 0, waitingForLineId: 0, errors: 0 };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const firstName = row[COLUMNS.FIRST_NAME] || "ลูกค้า";
    const lineUserId = row[COLUMNS.LINE_USER_ID];
    const birthday = parseSheetDate(row[COLUMNS.BIRTHDAY]);
    const preReminder = parseSheetDate(row[COLUMNS.PRE_REMINDER_DATE]);
    const dueDate = row[COLUMNS.NEXT_DUE_DATE];
    const amount = row[COLUMNS.PREMIUM_AMOUNT];

    const isBirthdayToday = isSameMonthDay(birthday, today);
    const isDueReminderToday = isSameCalendarDate(preReminder, today);

    if (!isBirthdayToday && !isDueReminderToday) continue;

    if (!lineUserId) {
      summary.waitingForLineId += 1;
      try {
        const currentStatus = row[COLUMNS.LINE_SEND_STATUS];
        if (currentStatus !== "รอ LINE User ID") {
          await writeStatus(sheets, spreadsheetId, tab, i, "รอ LINE User ID");
        }
      } catch (error) {
        console.error("Failed to write waiting status", { row: i, error });
        summary.errors += 1;
      }
      continue;
    }

    try {
      if (isBirthdayToday) {
        await pushLineMessage(lineUserId, birthdayMessage(firstName));
        summary.birthdaysSent += 1;
      }
      if (isDueReminderToday) {
        await pushLineMessage(
          lineUserId,
          premiumDueMessage(firstName, dueDate || "-", amount || "-")
          );
        summary.dueRemindersSent += 1;
      }
      await writeStatus(
        sheets,
        spreadsheetId,
        tab,
        i,
        `ส่งแล้ว ${formatThaiDate(today)}`
        );
    } catch (error) {
      console.error("Failed to send/update row", { row: i, error });
      summary.errors += 1;
    }
  }

  return Response.json({ ok: true, date: formatThaiDate(today), ...summary });
  },
};

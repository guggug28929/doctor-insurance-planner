import { google } from "googleapis";

// -----------------------------------------------------------------------
// Daily reminder cron: birthday (HBD) + premium due-date + Smile Point
// expiry reminders.
//
// Reads the MTL case-tracker Google Sheet
// (MTL_case_tracker_updated_v5_with_birthday -- the authoritative file.
// Spreadsheet ID: 1mbr4g-spYOqlS3yBZuRnyjR3otTCfq28REobg5F_drg. Other
// similarly-named copies were stray/buggy duplicates and have been
// removed -- do not point SHEET_ID at any other file) and, for every row
// that already has a LINE User ID captured, pushes a LINE message when:
// - today matches the customer's birthday
// - today matches the 30-day pre-reminder date
// - the customer's Smile Point balance is expiring within 30 days
//
// Smile Point reminders (columns AB/AC/AD -- balance, expiry date,
// notification status): Muang Thai Life has no public API to fetch a
// customer's real Smile Club point balance or expiry date (checked
// https://www.muangthai.co.th/th/smileclub -- it is a public rewards
// catalog page; the actual per-customer balance requires logging into
// the MTL Click app or the agent portal). So these columns are filled in
// manually by the agent from what they see in their own system, the same
// way the LINE User ID column is filled in later. Once a balance and
// expiry date are entered, this cron sends an automatic reminder when
// the expiry is within 30 days. Never fabricate or guess a point value.
//
// Required environment variables (set in Vercel > Settings > Environment
// Variables -- never commit real values):
// GOOGLE_SERVICE_ACCOUNT_EMAIL service account client_email
// GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY service account private_key
// (paste with literal \n, code unescapes it)
// SHEET_ID the case-tracker spreadsheet ID
// (MTL_case_tracker_updated_v5_with_birthday:
// 1mbr4g-spYOqlS3yBZuRnyjR3otTCfq28REobg5F_drg)
// SHEET_TAB_NAME tab/sheet name (default: "Sheet1")
// LINE_CHANNEL_ACCESS_TOKEN already configured for line-webhook.js
//
// The service account must be shared as an Editor on the spreadsheet.
// -----------------------------------------------------------------------

const COLUMNS = {
      CASE_NO: 0,
      FIRST_NAME: 1,
      LAST_NAME: 2,
      BIRTHDAY: 3,
      PHONE: 4,
      EMAIL: 5,
      NEXT_DUE_DATE: 14,
      PRE_REMINDER_DATE: 15,
      PREMIUM_AMOUNT: 16,
      LINE_USER_ID: 17,
      LINE_SEND_STATUS: 18,
      SMILE_POINT_BALANCE: 27,
      SMILE_POINT_EXPIRY: 28,
      SMILE_POINT_STATUS: 29,
};

const HEADER_ROWS = 1;
const SMILE_POINT_WARNING_DAYS = 30;

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

function daysUntil(parsed, today) {
      if (!parsed) return null;
      const target = new Date(parsed.year, parsed.month - 1, parsed.day);
      const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      return Math.round((target.getTime() - base.getTime()) / 86400000);
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

function smilePointMessage(firstName, balanceText, expiryText) {
      return `เรียนคุณ${firstName} ครับ\nแต้ม Smile Club ของคุณมีอยู่ ${balanceText} แต้ม จะหมดอายุวันที่ ${expiryText}\nรีบแลกของรางวัลผ่านแอป MTL Click ก่อนแต้มหมดอายุนะครับ หากต้องการให้หมอกึ๊กช่วยแนะนำสิทธิพิเศษ แจ้งมาได้เลยครับ`;
}

async function readRows(sheets, spreadsheetId, tab) {
      const range = `${tab}!A${HEADER_ROWS + 1}:AD`;
      const result = await sheets.spreadsheets.values.get({
              spreadsheetId,
              range,
      });
      return result.data.values || [];
}

async function writeCell(sheets, spreadsheetId, tab, rowIndex, columnIndex, value) {
      const rowNumber = rowIndex + HEADER_ROWS + 1;
      const column = String.fromCharCode("A".charCodeAt(0) + columnIndex);
      const range = `${tab}!${column}${rowNumber}`;
      await sheets.spreadsheets.values.update({
              spreadsheetId,
              range,
              valueInputOption: "RAW",
              requestBody: { values: [[value]] },
      });
}

async function writeStatus(sheets, spreadsheetId, tab, rowIndex, statusText) {
      await writeCell(sheets, spreadsheetId, tab, rowIndex, COLUMNS.LINE_SEND_STATUS, statusText);
}

export default {
      async fetch(request) {
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
              const summary = {
                        birthdaysSent: 0,
                        dueRemindersSent: 0,
                        smilePointRemindersSent: 0,
                        waitingForLineId: 0,
                        errors: 0,
              };

        for (let i = 0; i < rows.length; i++) {
                  const row = rows[i];
                  const firstName = row[COLUMNS.FIRST_NAME] || "ลูกค้า";
                  const lineUserId = row[COLUMNS.LINE_USER_ID];
                  const birthday = parseSheetDate(row[COLUMNS.BIRTHDAY]);
                  const preReminder = parseSheetDate(row[COLUMNS.PRE_REMINDER_DATE]);
                  const dueDate = row[COLUMNS.NEXT_DUE_DATE];
                  const amount = row[COLUMNS.PREMIUM_AMOUNT];

                const smilePointBalance = row[COLUMNS.SMILE_POINT_BALANCE];
                  const smilePointExpiryRaw = row[COLUMNS.SMILE_POINT_EXPIRY];
                  const smilePointExpiry = parseSheetDate(smilePointExpiryRaw);
                  const smilePointStatus = row[COLUMNS.SMILE_POINT_STATUS];

                const isBirthdayToday = isSameMonthDay(birthday, today);
                  const isDueReminderToday = isSameCalendarDate(preReminder, today);

                const daysToExpiry = daysUntil(smilePointExpiry, today);
                  const smilePointExpiringSoon =
                              smilePointExpiry &&
                              smilePointBalance &&
                              daysToExpiry !== null &&
                              daysToExpiry >= 0 &&
                              daysToExpiry <= SMILE_POINT_WARNING_DAYS;
                  const expectedSmileMarker = `แจ้งแล้ว ${smilePointExpiryRaw}`;
                  const smilePointAlreadySent = smilePointStatus === expectedSmileMarker;
                  const shouldSendSmilePoint = smilePointExpiringSoon && !smilePointAlreadySent;

                if (!isBirthdayToday && !isDueReminderToday && !shouldSendSmilePoint) continue;

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
                            if (shouldSendSmilePoint) {
                                          await pushLineMessage(
                                                          lineUserId,
                                                          smilePointMessage(firstName, smilePointBalance, smilePointExpiryRaw)
                                                        );
                                          summary.smilePointRemindersSent += 1;
                                          await writeCell(
                                                          sheets,
                                                          spreadsheetId,
                                                          tab,
                                                          i,
                                                          COLUMNS.SMILE_POINT_STATUS,
                                                          expectedSmileMarker
                                                        );
                            }
                            if (isBirthdayToday || isDueReminderToday) {
                                          await writeStatus(
                                                          sheets,
                                                          spreadsheetId,
                                                          tab,
                                                          i,
                                                          `ส่งแล้ว ${formatThaiDate(today)}`
                                                        );
                            }
                } catch (error) {
                            console.error("Failed to send/update row", { row: i, error });
                            summary.errors += 1;
                }
        }

        return Response.json({ ok: true, date: formatThaiDate(today), ...summary });
      },
};

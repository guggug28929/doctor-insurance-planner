import assert from "node:assert/strict";
import test from "node:test";

import {
  appendKnowledgeLinks,
  inferKnowledgeTopics,
} from "../api/line-agent.js";

test("คำถามภูมิแพ้และโรคกระเพาะใน OPD แนบลิงก์ระยะรอคอย", () => {
  const message = "ถ้าเป็นภูมิแพ้หรือโรคกระเพาะในแผน OPD ต้องรอกี่วันครับ";
  assert.deepEqual(inferKnowledgeTopics(message), ["waiting_period"]);

  const reply = appendKnowledgeLinks(
    "โรคเรื้อรังบางโรคใน OPD มีระยะรอคอยตามเงื่อนไขครับ",
    { knowledgeTopics: [] },
    message
  );
  assert.match(
    reply,
    /https:\/\/www\.doctor-insurance\.com\/health-knowledge#waiting-period/
  );
});

test("แนบลิงก์ Fax Claim และ Copayment ตามหัวข้อที่ถาม", () => {
  const message =
    "ถ้าแฟกซ์เคลมไม่ผ่านต้องสำรองจ่ายไหม แล้ว Copayment ปีต่ออายุคิดยังไง";
  assert.deepEqual(inferKnowledgeTopics(message), ["fax_claim", "copayment"]);

  const reply = appendKnowledgeLinks(
    "ระบบทั้งสองมีเงื่อนไขต่างกันครับ",
    { knowledgeTopics: ["fax_claim", "copayment"] },
    message
  );
  assert.match(reply, /#fax-claim/);
  assert.match(reply, /#copayment/);
});

test("คำถามข้อยกเว้นแนบลิงก์ข้อยกเว้น 21 ข้อ", () => {
  const reply = appendKnowledgeLinks(
    "รายละเอียดขึ้นอยู่กับข้อยกเว้นในกรมธรรม์ครับ",
    { knowledgeTopics: ["health_exclusions"] },
    "ประกันสุขภาพไม่คุ้มครองอะไรบ้าง"
  );
  assert.match(reply, /#health-exclusions/);
});

test("ไม่แนบลิงก์ซ้ำและตัดลิงก์รวมเมื่อมีหัวข้อเฉพาะ", () => {
  const existing =
    "อ่านต่อที่ https://www.doctor-insurance.com/health-knowledge#waiting-period ครับ";
  const reply = appendKnowledgeLinks(
    existing,
    { knowledgeTopics: ["waiting_period", "general_faq"] },
    "รวม FAQ เรื่องระยะรอคอย"
  );
  assert.equal(
    reply.match(/health-knowledge#waiting-period/g)?.length,
    1
  );
  assert.doesNotMatch(reply, /health-knowledge ครับ/);
});


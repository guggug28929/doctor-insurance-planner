// เทสต์คู่มือวิธีเลือกประกันสุขภาพ และการแก้พฤติกรรมผู้ช่วยที่ไม่สมเหตุผล
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("หน้าความรู้ต้องมีสองแท็บ และคู่มืออยู่แท็บแรก", () => {
  assert.match(html, /id="knowTabBtn-guide"/);
  assert.match(html, /id="knowTabBtn-faq"/);
  assert.match(html, /id="knowTab-guide"/);
  assert.match(html, /id="knowTab-faq"/);
  assert.match(html, /let knowTab = 'guide';/);
  assert.match(html, /function setKnowTab\(tab\)/);
});

test("คู่มือต้องมีครบห้าหัวข้อ พร้อมสารบัญและตารางแมปแบบของเมืองไทย", () => {
  const ids = [...html.matchAll(/id:'(g-[a-z]+)'/g)].map((m) => m[1]);
  assert.deepEqual(ids, ["g-why", "g-bucket", "g-type", "g-trap", "g-pick"]);
  assert.match(html, /function healthGuideBucketsHtml\(\)/);
  assert.match(html, /function healthGuideTypeTableHtml\(\)/);
  assert.match(html, /function healthGuideMapHtml\(\)/);
  // ตารางแมปต้องอ้างแบบของเมืองไทยจริง ไม่ใช่แบบของบริษัทอื่น
  for (const p of ["D Health Lite", "Elite Health Plus", "Care Plus", "เหมาจ่าย Extra", "Extra Care Plus", "CI Perfect Care"]) {
    assert.ok(html.includes(p), `ตารางแมปควรอ้างถึง ${p}`);
  }
  // ห้ามอ้างชื่อแบบของบริษัทอื่นในคู่มือของเรา
  for (const bad of ["BLA", "Happy Health", "Prestige Health", "releaseyourrisk"]) {
    assert.ok(!html.includes(bad), `ห้ามมีชื่อ ${bad} ในเว็บของเรา`);
  }
});

test("อินโฟกราฟิกสามก้อนต้องใช้ทั้งในคู่มือและบนหน้าผู้ช่วยจัดแผน", () => {
  const keys = [...html.matchAll(/key:'(transfer|depend|keep)'/g)].map((m) => m[1]);
  assert.deepEqual(keys, ["transfer", "depend", "keep"]);
  assert.match(html, /id="advBucketBox"/);
  assert.match(html, /bb\.innerHTML = healthGuideBucketsHtml\(\)/);
  // กรอบเก่าต้องถูกถอดออกแล้ว
  assert.doesNotMatch(html, /สรณะของระบบ:/);
  assert.doesNotMatch(html, /ลำดับการตัดเมื่อเบี้ยเกินงบ/);
});

test("หน้าแผนต้องมีปุ่มลิงก์ไปคู่มือ ข้างหัวข้อสัญญาเพิ่มเติมสุขภาพ", () => {
  assert.match(html, /id = 'guideLinkBtn'/);
  assert.match(html, /วิธีเลือกประกันสุขภาพ →/);
  assert.match(html, /t\.id === 'compareModeToggle' && !document\.getElementById\('guideLinkBtn'\)/);
});

test("ห้ามอ้างว่า AI เป็นคนจัดแผนและคิดเบี้ย เพราะจริง ๆ เป็นกฎที่เขียนตายตัว", () => {
  assert.doesNotMatch(html, /ให้ AI ช่วยจัดแผน/);
  assert.match(html, /จัดแผนให้เลย/);
  assert.match(html, /ไม่ได้ให้ AI เป็นคนเลือกหรือคิดตัวเลข/);
});

test("ผู้ช่วยประกันชีวิตต้องไม่ขึ้นตารางเองตั้งแต่เปิดหน้า ต้องกดปุ่มก่อน", () => {
  assert.match(html, /let lifeShowResult = false;/);
  assert.match(html, /function runLifeAdvisor\(\)/);
  assert.match(html, /if\(!lifeShowResult\)\{/);
  assert.match(html, /onclick="runLifeAdvisor\(\)">คำนวณทุนชีวิตที่ควรมี/);
});

test("ก้อนทุนชั่วคราวต้องคุ้มครองยาวพอกับจำนวนปีที่ครอบครัวต้องพึ่ง", () => {
  assert.match(html, /function lifeCoverYears\(p, age\)/);
  assert.match(html, /const needYears = bucket === 'temporary'/);
  assert.match(html, /const enough = cands\.filter\(p => lifeCoverYears\(p, age\) >= needYears\)/);
});

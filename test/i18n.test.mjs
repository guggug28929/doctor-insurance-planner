// เทสต์โหมดภาษาอังกฤษ (ปุ่ม TH/EN มุมขวาบน + พจนานุกรม data/i18n-en.json)
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const en = JSON.parse(await readFile(new URL("../data/i18n-en.json", import.meta.url), "utf8"));
const TH = /[฀-๿]/;

test("มีปุ่มเปลี่ยนภาษา TH/EN และตัวแปลภาษาโหลดพจนานุกรมจาก data/", () => {
  assert.match(html, /id="langToggle"[^>]*>.*data-lang="th".*data-lang="en"/);
  assert.match(html, /window\.I18N = \(function\(\)\{/);
  assert.match(html, /fetch\('\/data\/i18n-en\.json\?v='/);
  // ชื่อและที่อยู่โรงพยาบาลห้ามผ่านตัวแปล ใช้ชื่ออังกฤษจากข้อมูลแทน
  assert.match(html, /<h3 data-noi18n>\$\{esc\(hnName\(e\)\)\}<\/h3>/);
});

test("คำแปลทุกคำต้องเป็นภาษาอังกฤษล้วน และกฎทุกข้อคอมไพล์ได้", () => {
  assert.ok(Object.keys(en.dict).length > 1400);
  for (const [k, v] of Object.entries(en.dict)) {
    assert.ok(TH.test(k), `คีย์ไม่มีภาษาไทย: ${k}`);
    assert.ok(!TH.test(v), `คำแปลยังมีภาษาไทย: ${k}`);
  }
  for (const [src, rep] of en.rules) {
    assert.doesNotThrow(() => new RegExp(src, "g"), src);
    assert.ok(!TH.test(rep), `กฎแปลแล้วยังเป็นภาษาไทย: ${src}`);
  }
});

test("ตัวเลขเบี้ยในคำแปลต้องตรงกับต้นฉบับ ห้ามเปลี่ยนตัวเลข", () => {
  for (const [k, v] of Object.entries(en.dict)) {
    const nums = s => (s.match(/\d(?:[\d,]*\d)?(?:\.\d+)?/g) || []).filter(n => n.replace(/,/g, "").length >= 4).sort();
    const a = nums(k), b = nums(v);
    for (const n of a) {
      // ปี พ.ศ. แปลงเป็น ค.ศ. ได้ (2569 → 2026)
      const be = Number(n); if (be > 2400 && be < 2700 && b.includes(String(be - 543))) continue;
      assert.ok(b.includes(n), `ตัวเลข ${n} หายไปในคำแปลของ: ${k}`);
    }
  }
});

test("ชื่อการค้าอังกฤษ: เหมาจ่าย Extra ต้องวงเล็บ Maochai Extra และ OPD เหมาจ่ายต้องวงเล็บ OPD Maochai", () => {
  assert.equal(en.dict["เหมาจ่าย Extra"], "Flat-rate Extra (Maochai Extra)");
  assert.match(en.dict["สัญญาเพิ่มเติม โอพีดี เหมาจ่าย"], /\(OPD Maochai\)/);
  assert.match(en.dict["OPD เหมาจ่ายรายปี"], /\(OPD Maochai\)/);
});

test("PDF ตารางเบี้ยต้องต่อท้ายด้วยสรุปแผนและรายละเอียดเต็มของทุกแบบที่เลือก", () => {
  assert.match(html, /function pdfPlanDetailIds\(inp\)/);
  assert.match(html, /host\.insertAdjacentHTML\('beforeend', pdfPlanExtrasHtml\(inp\)\)/);
  assert.match(html, /@page pdfportrait\{size:A4 portrait;/);
  // ตารางเบี้ยต้องวัดความพอดีก่อนต่อรายละเอียด ไม่งั้นตารางในรายละเอียดจะถ่วงการย่ออักษร
  const fit = html.indexOf("dgFitPrintTable(host, cols);\n  // วัดความพอดี");
  assert.ok(fit > 0);
});

test("PDF: เหลือเฉพาะแผนย่อยที่ซื้อ มีลายน้ำและหมายเหตุท้ายทุกหน้า และข้อความ Care Plus ระบุยามุ่งเป้า/Immunotherapy", () => {
  assert.match(html, /function pdfKeepTierColumns\(root, sel\)/);
  assert.match(html, /<div class="pdf-watermark" aria-hidden="true">doctor-insurance\.com<\/div>/);
  assert.match(html, /@bottom-center\{content:var\(--pdf-foot, none\)/);
  assert.match(html, /ยามุ่งเป้า \(Targeted Therapy\) ยาภูมิคุ้มกันบำบัด \(Immunotherapy\) และค่าตรวจวินิจฉัย เช่น CT\/MRI\/PET Scan/);
});

test("EN เฟส 2: หน้ารายละเอียดแผนและหัว PDF แปลครบ", () => {
  const j = en;
  assert.ok(Object.keys(j.dict).length > 5000);
  assert.equal(j.dict["มะเร็ง + ไตวายเรื้อรัง (Care Plus)"], "Cancer + chronic kidney failure (Care Plus)");
  assert.ok(j.rules.some(([src]) => src.startsWith("^อายุเริ่มทำสัญญา")));
  assert.match(html, /function i18nEN\(\)/);
  assert.match(html, /Premium table: \$\{plannerEscapeHtml\(i18nT\(mainLabel\)\)\}/);
});

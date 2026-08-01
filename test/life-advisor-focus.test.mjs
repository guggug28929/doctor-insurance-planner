// บัค: หน้าผู้ช่วยออกแบบประกันชีวิต พิมพ์ตัวเลขได้ทีละตัวแล้วเคอร์เซอร์หลุด
// สาเหตุ: ทุกครั้งที่พิมพ์ ระบบเขียนทับ innerHTML ทั้งก้อน ทำให้ช่องกรอกถูกสร้างใหม่
// เทสต์นี้ล็อกโครงสร้างที่แก้แล้วไว้ คือฟอร์มสร้างครั้งเดียว ผลลัพธ์แยกกล่องต่างหาก
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("ฟอร์มประกันชีวิตต้องสร้างครั้งเดียว ไม่สร้างใหม่ทุกครั้งที่พิมพ์", () => {
  // ต้องแยกกล่องฟอร์มกับกล่องผลลัพธ์
  assert.match(html, /id="lifeAdvForm"/);
  assert.match(html, /id="lifeAdvResult"/);
  // สร้างฟอร์มก็ต่อเมื่อยังไม่มีอยู่จริง
  assert.match(html, /if\(!document\.getElementById\('lifeAdvForm'\)\)\{/);
  // ต้องมีฟังก์ชันอัปเดตเฉพาะผลลัพธ์
  assert.match(html, /function renderLifeAdvisorResultOnly\(\)/);
  // ห้ามกลับไปเขียนทับทั้งก้อนแบบเดิมอีก
  assert.doesNotMatch(html, /box\.innerHTML = renderLifeAdvisorForm\(\) \+ renderLifeAdvisorResult\(\)/);
});

test("การพิมพ์ต้องอัปเดตแค่ผลลัพธ์ และหน่วงไว้เล็กน้อย ไม่คิดใหม่ทุกตัวอักษร", () => {
  assert.match(html, /clearTimeout\(lifeResultTimer\)/);
  assert.match(html, /lifeResultTimer = setTimeout\(renderLifeAdvisorResultOnly, \d+\)/);
  // setLifeField ต้องไม่เรียก renderLifeAdvisor ที่สร้างฟอร์มใหม่
  const fn = html.slice(html.indexOf("function setLifeField(key, val){"));
  const body = fn.slice(0, fn.indexOf("\n}"));
  assert.ok(!/renderLifeAdvisor\(\)/.test(body), "setLifeField ต้องไม่เรียก renderLifeAdvisor()");
});

test("ข้อความช่วยที่ขึ้นกับค่าที่กรอก ต้องอัปเดตด้วยการแก้ข้อความ ไม่ใช่สร้าง input ใหม่", () => {
  assert.match(html, /function lifeSyncFormHints\(\)/);
  assert.match(html, /id="lifeHintAge"/);
  assert.match(html, /id="lifeHintDep"/);
  assert.match(html, /h1\.textContent = `อายุที่คำนวณได้ \$\{age\} ปี`/);
});

test("หน้าอื่นที่มีช่องกรอกแล้วคำนวณสด ต้องไม่เขียนทับฟอร์มตัวเอง", () => {
  // หน้าเทียบโรคร้ายแรงเขียนผลลงกล่องแยก จึงไม่เจอปัญหาเดียวกัน
  const fn = html.slice(html.indexOf("function renderCiAdvisor(){"));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.ok(/getElementById\('ciAdvisorOut'\)/.test(body));
  assert.ok(!/getElementById\('ciAge'\)\.outerHTML/.test(body));
});

import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("กรอบหลักการบนหน้าผู้ช่วยจัดแผน ต้องเป็นอินโฟกราฟิก ไม่ใช่ก้อนข้อความ", () => {
  assert.match(html, /function advPrincipleInfographic\(\)/);
  // ต้องถูกเรียกใช้จริง ไม่ใช่เขียนไว้เฉย ๆ
  assert.match(html, /bb\.innerHTML = advPrincipleInfographic\(\)/);
  // สองส่วน: เส้นความเสี่ยง กับ ลำดับการตัด
  assert.match(html, /เงินก้อนไหนควรโอนให้ประกัน/);
  assert.match(html, /ถ้าเบี้ยเกินงบ ระบบจะตัดตามลำดับนี้/);
});

test("ลำดับการตัดในอินโฟกราฟิก ต้องตรงกับที่ระบบทำจริง", () => {
  const steps = [...html.matchAll(/\{n:'(\d)', t:'([^']+)'/g)].map((m) => m[2]);
  assert.deepEqual(steps, [
    "OPD",
    "PA อุบัติเหตุ",
    "ทุนประกันชีวิต",
    "เงินก้อนโรคร้าย",
    "เพิ่ม Deductible",
    "ลดวงเงิน IPD",
    "ลดขอบเขต Care Plus",
  ]);
  // เพดาน Deductible ที่ตกลงกันไว้ ต้องบอกผู้ใช้ด้วย
  assert.match(html, /ไม่ดันเกิน 30,000 บาท/);
  // ต้องย้ำว่าแกนหลักถูกแตะท้ายสุด
  assert.match(html, /จึงถูกแตะเป็นลำดับท้ายสุดเสมอ/);
});

test("อินโฟกราฟิกต้องอ่านได้บนมือถือ ไม่ใช่สามคอลัมน์บีบ", () => {
  assert.match(html, /@media\(max-width:640px\)\{\s*\.ig-cols\{grid-template-columns:1fr;\}/);
});

test("สามกล่องต้องใช้สีไฟจราจรชุดเดียวกับหน้าคู่มือ", () => {
  // ใช้คลาส hg-go / hg-mid / hg-stop ร่วมกัน จะได้ไม่ต้องดูแลสองชุด
  assert.match(html, /<div class="ig-col hg-\$\{g\.tone\}">/);
  assert.match(html, /\.hg-go\{background:#e9f6ee/);
  assert.match(html, /\.hg-mid\{background:#fff8e8/);
  assert.match(html, /\.hg-stop\{background:#fdeef0/);
  // แถบไล่สีต้องไปทางเดียวกับกล่อง เขียวไปแดง
  assert.match(html, /linear-gradient\(90deg,#3f9c68/);
});

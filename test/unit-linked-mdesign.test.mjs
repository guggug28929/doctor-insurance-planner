import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* เครื่องจำลอง mDesign ต้องให้ผลตรงกับเอกสารประกอบการขาย (SI) ของบริษัท
   SI Proposal 26200018444: ชาย 20 ปี เบี้ยหลัก 25,000 Top Up ปีแรก 25,000 ทุน 500,000 เริ่ม พ.ย. 2569
   ค่าสัญญาเพิ่มเติมที่หักรายเดือนตาม SI: ปีที่ 1 = 1,373.34 ปีที่ 2 = 1,419.84
   แถว: [เดือนกรมธรรม์, มูลค่าส่วนเบี้ยหลัก, มูลค่าส่วน Top Up, COI] */
const SI = {"-1": [[1, 13438.43, 23730.12, 48.99], [2, 12867.07, 22721.18, 49.16], [3, 12295.19, 21711.36, 49.33], [4, 11723.73, 20702.27, 49.5], [5, 11152.69, 19693.92, 49.67], [6, 10582.06, 18686.31, 49.83], [7, 10011.86, 17679.43, 50.0], [8, 9442.08, 16673.28, 50.17], [9, 8872.72, 15667.86, 50.34], [10, 8303.76, 14663.19, 50.5], [11, 7735.23, 13659.25, 50.67], [12, 7167.11, 12656.04, 50.84], [13, 24817.28, 11623.83, 51.13], [24, 12626.62, 5914.03, 53.12]], "2": [[1, 13471.9, 23789.23, 48.99], [2, 12932.64, 22836.99, 49.15], [3, 12391.5, 21881.45, 49.31], [4, 11849.41, 20924.23, 49.47], [5, 11306.37, 19965.32, 49.63], [6, 10762.38, 19004.73, 49.79], [7, 10217.44, 18042.44, 49.95], [8, 9671.54, 17078.46, 50.11], [9, 9124.67, 16112.8, 50.27], [10, 8576.85, 15145.42, 50.43], [11, 8028.07, 14176.34, 50.59], [12, 7478.31, 13205.57, 50.75], [13, 25190.85, 12203.27, 51.04], [24, 13641.68, 6608.53, 52.93]], "5": [[1, 13504.49, 23846.76, 48.99], [2, 12996.65, 22950.0, 49.14], [3, 12485.75, 22047.85, 49.29], [4, 11972.71, 21141.94, 49.44], [5, 11457.53, 20232.23, 49.59], [6, 10940.2, 19318.72, 49.74], [7, 10420.7, 18401.39, 49.9], [8, 9899.04, 17480.22, 50.05], [9, 9375.2, 16555.19, 50.2], [10, 8849.17, 15626.3, 50.36], [11, 8320.94, 14693.52, 50.51], [12, 7790.5, 13756.84, 50.67], [13, 25565.26, 12786.37, 50.94], [24, 14676.66, 7340.54, 52.74]]};
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const R = JSON.parse(readFileSync(new URL("../data/premium-rates.json", import.meta.url), "utf8"));
const U = R.unit_linked_mdesign;
function extract(name){
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, name);
  let d = 0, i = html.indexOf("{", start);
  for(; i < html.length; i++){ if(html[i] === "{") d++; else if(html[i] === "}" && --d === 0) break; }
  return html.slice(start, i + 1);
}
const ctx = {Math, Number, String, Object};
vm.createContext(ctx);
vm.runInContext(extract("ulSimulate") + "\n" + extract("ulMinSa"), ctx);

test("จำลองรายเดือนตรงกับ SI ทุกเดือนในปีกรมธรรม์ที่ 1-2 ที่ผลตอบแทน -1% 2% 5%", () => {
  const rider = {1: 1373.34, 2: 1419.84};
  for (const [rate, rows] of Object.entries(SI)) {
    const tr = [];
    ctx.ulSimulate({gender:"m", age:20, premium:25000, sa:500000, topup:25000, topupUntilAge:20, rate:Number(rate)/100,
      riderMonthlyByYear: py => rider[py] || 0, startBE:2569, startMonth:11, months:24, _trace:tr}, U);
    for (const [m, main, top, coi] of rows) {
      const t = tr[m - 1];
      assert.ok(Math.abs(t.coi - coi) < 0.011, `${rate}% เดือน ${m} COI ${t.coi} vs ${coi}`);
      assert.ok(Math.abs(t.main - main) < 0.1, `${rate}% เดือน ${m} มูลค่าเบี้ยหลัก ${t.main} vs ${main}`);
      assert.ok(Math.abs(t.top - top) < 0.1, `${rate}% เดือน ${m} มูลค่า Top Up ${t.top} vs ${top}`);
    }
  }
});

test("ตัวอย่างในเอกสารอบรม: ชาย 30 ปี เบี้ย 100,000 ทุน 2 ล้าน เดือนแรก COI 251.66 มูลค่าสิ้นเดือน 62,378.44", () => {
  const tr = [];
  ctx.ulSimulate({gender:"m", age:30, premium:100000, sa:2000000, rate:0.05, startBE:2567, startMonth:1, months:1, _trace:tr}, U);
  assert.equal(tr[0].coi, 251.66);
  assert.equal(Math.round(tr[0].main * 100) / 100, 62378.44);
});

test("ทุนขั้นต่ำและค่าธรรมเนียมเวนคืนตามตาราง SI", () => {
  assert.equal(ctx.ulMinSa(U, 35, 100000, 0), 1500000);
  assert.equal(ctx.ulMinSa(U, 45, 100000, 20000), 1025000);
  assert.equal(ctx.ulMinSa(U, 65, 100000, 0), 500000);
  const res = ctx.ulSimulate({gender:"m", age:20, premium:25000, sa:500000, topup:0, rate:0.05, startBE:2569, startMonth:11, months:24}, U);
  const y1 = res.rows[0];
  assert.equal(Math.round((y1.valueMain - y1.surrender) * 100) / 100, 12500, "ปีที่ 1 หักค่าเวนคืน 50% ของเบี้ยหลัก");
});

test("หน้าเว็บมีแท็บประกันควบการลงทุนและ route", () => {
  assert.match(html, /<button data-page="unitlinked">ประกันควบการลงทุน<\/button>/);
  assert.match(html, /unitlinked: '\/unit-linked'/);
  assert.match(html, /<div id="page-unitlinked" class="page">/);
  assert.equal(U.coi_per_1000.m.length, 100);
  assert.equal(U.coi_per_1000.m[30], 1.5586);
  assert.equal(U.coi_per_1000.f[40], 0.9024);
});

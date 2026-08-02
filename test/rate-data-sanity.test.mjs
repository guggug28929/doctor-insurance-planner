import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const R = JSON.parse(readFileSync(new URL('../data/premium-rates.json', import.meta.url), 'utf8'));

/* กวาดคุณภาพตารางเบี้ยแบบไม่ต้องรู้ล่วงหน้าว่าแบบไหนผิด
   จับบัคที่ตาดูไม่เห็น เช่น คอลัมน์เลื่อน คอลัมน์ที่ปั้นขึ้นมา และเบี้ยแพงกว่าวงเงิน */

test('D Health Lite Copayment ตารางสองชุดต้องให้คำตอบตรงกัน', () => {
  // เคยพลาด: คอลัมน์ f_1m_8020 ในตารางเก่าเป็น m_1m_8020 x 1.2 เป๊ะทุกช่วง
  // ซึ่งเป็นค่าที่ปั้นขึ้น ไม่ใช่ตารางจริง ทำให้ผู้หญิงโดนเสนอเบี้ยสูงเกินจริง 13%
  const L = R.dhl_copay;
  const ps = R.dhl_payment_schedules.occupations['1_2'].annual;
  let compared = 0;
  for (const sum of Object.keys(ps)) {
    for (const ck of Object.keys(ps[sum])) {
      if (!ck.startsWith('copay_')) continue;
      for (const g of ['m', 'f']) {
        const legacy = L[`${g}_${sum}_${ck.slice(6)}`];
        const detail = ps[sum][ck][g];
        if (!legacy || !detail) continue;
        L.band_upper_age.forEach((upper, i) => {
          const age = Math.min(upper, 98);
          if (legacy[i] == null || detail[age] == null) return;
          compared++;
          assert.ok(Math.abs(legacy[i] - detail[age]) <= 0.5,
            `${g}_${sum}_${ck} ที่อายุ ${age}: ตารางเก่า ${legacy[i]} ไม่ตรงกับตารางละเอียด ${detail[age]}`);
        });
      }
    }
  }
  assert.ok(compared > 100, `เทียบได้แค่ ${compared} จุด น้อยเกินไป น่าจะอ่านตารางไม่เจอ`);
});

test('อัตราส่วนหญิงต่อชายต้องแปรผันตามอายุ ไม่ใช่ค่าคงที่', () => {
  // ถ้าอัตราส่วนคงที่เป๊ะทั้งคอลัมน์ แปลว่าน่าจะเอาคอลัมน์หนึ่งไปคูณตัวเลขแล้วใส่เป็นอีกคอลัมน์
  const L = R.dhl_copay;
  for (const k of Object.keys(L)) {
    if (!k.startsWith('f_') || !Array.isArray(L[k])) continue;
    const mk = 'm_' + k.slice(2);
    if (!Array.isArray(L[mk])) continue;
    const ratios = new Set();
    L[k].forEach((v, i) => { if (v != null && L[mk][i]) ratios.add((v / L[mk][i]).toFixed(4)); });
    assert.ok(ratios.size > 3,
      `${k} มีอัตราส่วนหญิง/ชายแค่ ${ratios.size} ค่า (${[...ratios]}) ตารางจริงต้องแปรผันตามอายุมากกว่านี้`);
  }
});

test('OPD เหมาจ่าย เบี้ยต้องไม่แพงกว่าวงเงินที่ได้', () => {
  // ชื่อแผนคือวงเงินต่อปี ถ้าเบี้ยแพงกว่าวงเงินแปลว่าตารางผิดแน่นอน
  const g = R['opd_เหมา'];
  const bad = [];
  for (const key of Object.keys(g)) {
    const m = key.match(/^([mf])_(\d+)$/);
    if (!m || !Array.isArray(g[key])) continue;
    const ceiling = Number(m[2]);
    g[key].forEach((v, i) => {
      if (v != null && v >= ceiling) bad.push(`${key} อายุ ${g.age_start + i}: เบี้ย ${v} ≥ วงเงิน ${ceiling}`);
    });
  }
  // ยังแก้ตัวเลขไม่ได้จนกว่าจะยืนยันกับตารางทางการ จึงบันทึกไว้เป็นหนี้ที่ค้างอยู่
  assert.ok(g.data_issue && g.data_issue.status === 'needs_verification',
    'ตารางนี้ยังมีเลขที่ต้องยืนยัน ต้องคง data_issue ไว้จนกว่าจะแก้จริง');
  assert.ok(bad.length > 0 ? g.data_issue.scope.includes('81') : true,
    'ถ้ายังมีเลขผิดอยู่ ขอบเขตใน data_issue ต้องระบุช่วงที่ถูกต้อง');
});

test('แอปต้องไม่เสนอราคา OPD เหมาจ่าย ในช่วงที่เบี้ยแพงกว่าวงเงิน', () => {
  assert.match(html, /const ceiling = parseInt\(cfg\.plan, 10\);/);
  assert.match(html, /if\(v != null && freq === 'annual' && ceiling && v >= ceiling\)\{/);
  assert.match(html, /return \{label:'OPD เหมาจ่าย', premium:null, needsVerify:true\};/);
});

test('D Health Lite Copayment ต้องใช้ตารางละเอียดเป็นหลัก', () => {
  // ตารางเก่าเป็นแบบช่วงอายุ หยาบกว่า จึงต้องเป็นตัวสำรอง ไม่ใช่ตัวหลัก
  const i = html.indexOf("if(cfg.mode === 'copay')");
  const seg = html.slice(i, i + 1200);
  const detailAt = seg.indexOf('dhl_payment_schedules');
  const legacyAt = seg.indexOf('RATES.dhl_copay');
  assert.ok(detailAt > -1 && legacyAt > -1, 'หาโค้ดสองเส้นทางไม่เจอ');
  assert.ok(detailAt < legacyAt,
    'ตารางละเอียดต้องถูกลองก่อนตารางเก่า ไม่งั้นเคสที่ลูกค้าเจอบ่อยที่สุดจะไปอ่านตารางหยาบ');
});

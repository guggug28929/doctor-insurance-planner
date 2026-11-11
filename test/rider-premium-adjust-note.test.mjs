import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* ข้อความเตือนว่าสัญญาเพิ่มเติมอาจถูกปรับเบี้ยยกพอร์ต ต้องอยู่ครบทุกจุดที่ลูกค้าเห็นตัวเลขเบี้ย
   (หน้าคำนวณ ข้อความสรุป PDF Excel) และใช้ข้อความเดียวกันจากค่าคงที่เดียว */

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function grab(marker){
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, `ไม่พบ ${marker}`);
  let depth = 0;
  for(let i = html.indexOf('{', start); i < html.length; i++){
    if(html[i] === '{') depth++;
    else if(html[i] === '}'){ depth--; if(depth === 0) return html.slice(start, i + 1); }
  }
  throw new Error(`วงเล็บไม่ครบสำหรับ ${marker}`);
}

const NOTE = html.match(/const RIDER_PREMIUM_ADJUST_NOTE = '([^']+)';/)[1];

test('ข้อความต้องครบประเด็นตามเงื่อนไขการปรับเบี้ยของสัญญาเพิ่มเติม', () => {
  for(const part of [
    'ณ วันครบรอบปีกรมธรรม์ประกันภัย',
    'อายุและชั้นอาชีพ',
    'ค่าใช้จ่ายในการรักษาพยาบาลที่สูงขึ้น',
    'ประสบการณ์การจ่ายค่าสินไหมทดแทนโดยรวมของพอร์ตโฟลิโอ',
    'ปรับเบี้ยประกันภัยยกพอร์ต',
    'ล่วงหน้าเป็นลายลักษณ์อักษรไม่น้อยกว่า 30 วัน',
    'ได้รับความเห็นชอบจากนายทะเบียน',
  ]) assert.ok(NOTE.includes(part), `ขาด: ${part}`);
});

test('ข้อความอยู่ในหน้าคำนวณ PDF และ Excel (ไม่ใส่ในข้อความสรุปที่คัดลอก)', () => {
  assert.match(html, /<p class="meta rider-adjust-note"[^>]*>\$\{plannerEscapeHtml\(RIDER_PREMIUM_ADJUST_NOTE\)\}<\/p>/);
  assert.doesNotMatch(html, /^\s*RIDER_PREMIUM_ADJUST_NOTE,$/m, 'ข้อความสรุปสำหรับคัดลอกยาวเกินไป ไม่ต้องใส่');
  assert.match(html, /<div class="print-foot print-adjust-note">\$\{plannerEscapeHtml\(RIDER_PREMIUM_ADJUST_NOTE\)\}<\/div>/);
  // Excel ใส่หมายเหตุจาก data.notes ถ้าไม่ส่งมาใช้ข้อความนี้เป็นค่าตั้งต้นเสมอ
  assert.match(html, /data\.notes \|\| \[RIDER_PREMIUM_ADJUST_NOTE\]/);
  assert.match(html, /xlsxWrapNote\(note, 120\)/);
});

test('ตัดบรรทัดสำหรับ Excel ไม่ทำข้อความหายหรือซ้ำ', () => {
  const ctx = vm.createContext({String});
  vm.runInContext(grab('function xlsxWrapNote(') + '\nthis.f = xlsxWrapNote;', ctx);
  const lines = ctx.f(NOTE, 120);
  assert.ok(lines.length >= 2);
  assert.equal(lines.join(' ').replace(/\s+/g, ' '), NOTE.replace(/\s+/g, ' '));
});

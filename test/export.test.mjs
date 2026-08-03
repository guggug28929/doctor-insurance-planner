import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* ไฟล์ Excel ที่ส่งให้ลูกค้าแล้วเปิดไม่ออก เสียหายกว่าไม่มีปุ่มดาวน์โหลดเลย
   สาเหตุจริงคือหัวตารางกลางของ ZIP ขาดฟิลด์วันที่ไป 2 ไบต์
   ทุกฟิลด์หลังจากนั้นจึงเลื่อน ไฟล์เสียทั้งไฟล์ */

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('หัวตารางกลางของ ZIP ต้องครบทุกฟิลด์', () => {
  const fn = html.slice(html.indexOf('function dgZip(files)'));
  const body = fn.slice(0, fn.indexOf('\n}\n') + 3);
  // ตัดคอมเมนต์และช่องว่างออกก่อน จะได้ตรวจที่ลำดับไบต์จริง ไม่ใช่การจัดรูปแบบ
  const flat = body.replace(/\/\/[^\n]*/g, '').replace(/\s+/g, '');
  // หัวไฟล์: ลายเซ็น 4 + เวอร์ชันที่ต้องใช้ + แฟล็ก + วิธีบีบอัด + เวลา + วันที่ = 14 ไบต์ก่อน CRC
  assert.ok(flat.includes('newUint8Array([0x50,0x4B,0x03,0x04]),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc)'),
    'หัวไฟล์ไม่ครบตามลำดับที่ ZIP กำหนด');
  // หัวตารางกลาง: มี versionMadeBy เพิ่มอีกหนึ่งช่อง รวมเป็น 16 ไบต์ก่อน CRC
  assert.ok(flat.includes('newUint8Array([0x50,0x4B,0x01,0x02]),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(x.crc)'),
    'หัวตารางกลางไม่ครบ ขาดฟิลด์ไหนก็ทำให้ไฟล์เปิดไม่ออกทั้งไฟล์');
  assert.ok(!/80,75,1,2,20,0,20,0,0,0,0,0,0,0\]/.test(html),
    'หัวตารางกลางแบบเก่าที่ขาดฟิลด์วันที่ ต้องไม่หลงเหลืออยู่');
});

test('ตาราง CRC32 ต้องคำนวณล่วงหน้า ไม่วนบิตทุกไบต์', () => {
  // ตารางเบี้ยยาว 50 กว่าแถว การวนทีละบิตทำให้หน่วงโดยไม่จำเป็น
  assert.match(html, /const crcTable = \(\(\) => \{/);
  assert.match(html, /crcTable\[\(c \^ bytes\[i\]\) & 0xFF\] \^ \(c >>> 8\)/);
});

test('ไฟล์ Excel ต้องจัดหน้าแนวนอนและย่อให้พอดีกว้างหนึ่งหน้า', () => {
  assert.match(html, /orientation="landscape"/);
  assert.match(html, /fitToWidth="1" fitToHeight="0"/);
  assert.match(html, /<sheetPr><pageSetUpPr fitToPage="1"\/><\/sheetPr>/);
  // ความยาวปล่อยให้ขึ้นหน้าใหม่ได้ แต่หัวตารางต้องซ้ำทุกหน้า
  assert.match(html, /_xlnm\.Print_Titles/);
  assert.match(html, /state="frozen"/);
});

test('ต้องตั้งความกว้างคอลัมน์ ไม่งั้นตัวเลขขึ้นเป็น #####', () => {
  assert.match(html, /customWidth="1"/);
  // ตัวอักษรไทยกว้างกว่าตัวเลข ต้องคิดน้ำหนักเพิ่ม ไม่ใช่นับจำนวนตัวอักษรดิบ
  assert.match(html, /\/\[฀-๿\]\/\.test\(t\)/);
});

test('ตัวเลขต้องเก็บเป็นตัวเลขจริง ลูกค้าจะได้เอาไปคำนวณต่อได้', () => {
  assert.match(html, /const numeric = \/\^-\?\[\\d,\]\+\(\\\.\\d\+\)\?\$\/\.test\(raw\)/);
  assert.match(html, /<v>\$\{raw\.replace\(\/,\/g,''\)\}<\/v>/);
  assert.match(html, /<numFmt numFmtId="164" formatCode="#,##0"\/>/);
  // แต่ค่าที่เป็นข้อความล้วน เช่น "700,000 บาท" ต้องไม่ถูกแปลง
  assert.match(html, /xlsxCell\('B' \+ r, v, XLSX_STYLE\.NORMAL, true\)/);
});

test('อักขระควบคุมต้องถูกตัดออก ไม่งั้นไฟล์เสีย', () => {
  assert.match(html, /replace\(\/\[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\]\/g, ''\)/);
});

/* ---------- PDF ---------- */

test('PDF ต้องเป็นแนวนอน ขอบแคบ และหัวตารางซ้ำทุกหน้า', () => {
  assert.match(html, /@page\{size:A4 landscape;margin:9mm 8mm;\}/);
  assert.match(html, /body\.dg-printing \.print-doc thead\{display:table-header-group;\}/);
  assert.match(html, /body\.dg-printing \.print-doc tr\{page-break-inside:avoid;\}/);
  assert.match(html, /body\.dg-printing > \*:not\(#printArea\)\{display:none !important;\}/);
});

test('ห้ามตัดข้อความด้วย ellipsis เพราะตัวเลขเบี้ยจะหายบางหลัก', () => {
  const css = html.slice(html.indexOf('.print-doc table{'), html.indexOf('.print-foot{'));
  assert.ok(!/text-overflow:ellipsis/.test(css), 'ห้ามใช้ ellipsis ในตารางที่พิมพ์');
  assert.match(css, /table-layout:auto/);
});

test('ขนาดอักษรต้องวัดจริงแล้วย่อ ไม่ใช่เดาจากจำนวนคอลัมน์', () => {
  assert.match(html, /function dgFitPrintTable\(host, cols\)/);
  // ต้องวัดความกว้างตามธรรมชาติ ไม่ใช่ความกว้างที่ถูกบังคับด้วย width 100%
  assert.match(html, /t\.style\.width = 'max-content';/);
  assert.match(html, /const PRINT_FONT_MAX = 10, PRINT_FONT_MIN = 6\.5;/);
  assert.match(html, /natural = Math\.max\(\.\.\.tables\.map\(t => t\.getBoundingClientRect\(\)\.width\)\)/);
});

test('คอลัมน์เยอะเกินหน้ากระดาษ ต้องแบ่งชุดแล้วขึ้นหน้าใหม่', () => {
  assert.match(html, /function dgSplitPrintColumns\(host, head, rows\)/);
  assert.match(html, /const PRINT_KEY_COLS = 2;/);
  // ทุกชุดต้องพ่วงคอลัมน์อายุกับปีกรมธรรม์ ไม่งั้นหน้าที่สองอ่านไม่รู้เรื่อง
  assert.match(html, /let cur = keys\.slice\(\);/);
  assert.match(html, /cur = keys\.concat\(ci\);/);
  assert.match(html, /\.print-sec-next\{break-before:page;page-break-before:always;/);
  // ต้องบอกผู้อ่านว่าเป็นชุดที่เท่าไรจากทั้งหมด
  assert.match(html, /\(ชุดที่ \$\{i\+1\} จาก \$\{groups\.length\}\)/);
});

test('ต้องมีทางออกเสมอ ไม่ค้างสถานะพิมพ์', () => {
  assert.match(html, /window\.addEventListener\('afterprint', cleanup\);/);
  // บางเบราว์เซอร์ไม่ยิง afterprint ต้องมีตัวจับเวลาสำรอง
  assert.match(html, /setTimeout\(cleanup, 60000\);/);
  assert.match(html, /document\.body\.classList\.remove\('dg-printing'\)/);
});

test('หน้าเว็บต้องมีปุ่มดาวน์โหลดทั้งสองแบบ', () => {
  assert.match(html, /onclick="exportPremiumTableExcel\(\)"/);
  assert.match(html, /onclick="exportPremiumTablePdf\(\)"/);
  assert.match(html, /class="btn btn-export-pdf"/);
});

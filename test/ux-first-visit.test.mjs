import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* ลูกค้าที่กดจาก TikTok เข้ามาครั้งแรก ต้องไม่เจอสามอย่างนี้
   หนึ่ง กล่องแดงตั้งแต่ยังไม่ได้แตะอะไร  สอง ไม่รู้ว่าต้องกดตรงไหนต่อ  สาม ไม่มีทางติดต่อ */

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('เปิดหน้าคำนวณมาต้องไม่เจอกล่องแดงทันที', () => {
  // ต้นเหตุเดิมคือทุนเริ่มต้น 200,000 ไปชนกฎ 99/20 ที่ต่ำกว่า 1 ล้านต้องแนบ CI หรือ PA
  assert.match(html, /<input type="number" id="mainCapital" value="1000000"/);
  assert.ok(!html.includes('id="mainCapital" value="200000"'), 'ยังใช้ทุนเริ่มต้นที่ทำให้ขึ้นแดง');
  // และต้องมีตัวกันไว้อีกชั้น เผื่อกฎอื่นในอนาคตมาชนตอนเปิดหน้า
  assert.match(html, /let calcTouched = false;/);
  assert.match(html, /if\(issues\.length && !calcTouched\)\{/);
  assert.match(html, /calcTouched = true; renderAll\(\);/);
});

test('ข้อความตอนยังไม่แตะฟอร์ม ต้องไม่พูดเหมือนผู้ใช้ทำพลาด', () => {
  assert.match(html, /tableWrap\.innerHTML = calcTouched/);
  assert.match(html, /ระบบจะคำนวณเบี้ยจากตารางจริงของบริษัทให้ทันที/);
});

test('กฎ 99/20 ต้องมีทางออกให้กดปุ่มเดียวจบ', () => {
  // ลูกค้าไม่รู้จักชื่อ Care Plus หรือ D Care จะไปต่อไม่ถูกถ้าบอกแค่ว่าให้แนบ
  assert.match(html, /function fixCiRequirement\(\)\{/);
  assert.match(html, /onclick="fixCiRequirement\(\)"/);
  assert.match(html, /el\.value = 1000000;/);
  assert.match(html, /\.fix-btn\{/);
});

test('ปุ่มทักไลน์ต้องลอยอยู่ทุกหน้า ไม่ใช่มีเฉพาะบางหน้า', () => {
  assert.match(html, /class="line-fab" id="lineFab"/);
  assert.match(html, /href="https:\/\/line\.me\/R\/ti\/p\/@doctorguginsurance"[\s\S]{0,80}aria-label="ทักไลน์/);
  assert.match(html, /\.line-fab\{position:fixed;right:16px;bottom:16px;/);
  // ต้องไม่ทับกล่องค้นหาบนมือถือ
  assert.match(html, /if\(fab\) fab\.hidden = true;/);
  assert.match(html, /if\(fab\) fab\.hidden = false;/);
  // ปุ่มค้นหาอยู่บนขวา ปุ่มไลน์อยู่ล่างขวา จึงไม่ชนกัน
  assert.match(html, /\.ss-btn\{position:fixed;top:14px;right:14px;/);
});

test('หน้าแรกต้องมีปุ่มหลักบอกว่าให้ทำอะไรต่อ', () => {
  assert.match(html, /class="btn home-cta-main" onclick="showPage\('ai'\)"/);
  assert.match(html, /class="btn home-cta-alt" onclick="showPage\('calc'\)"/);
  assert.match(html, /ไม่รู้จะเริ่มตรงไหน เริ่มตรงนี้/);
});

test('ตารางไซซ์ต้องมีตัวเลขเบี้ยจริง และคำนวณสดจากตารางของบริษัท', () => {
  assert.match(html, /const HOME_SIZES = \[/);
  assert.match(html, /function homeSizeBlock\(\)\{/);
  assert.match(html, /if\(name === 'home' && typeof setHomeGender === 'function'\)/);
  const i = html.indexOf('const HOME_SIZES = [');
  const seg = html.slice(i, html.indexOf('function setHomeGender'));
  // ต้องเรียกฟังก์ชันคิดเบี้ยจริง ห้ามพิมพ์ตัวเลขค้างไว้
  for(const f of ['healthRiderPremium', 'careplusPremium', 'cipcPremium'])
    assert.ok(seg.includes(f), `ตารางไซซ์ไม่ได้เรียก ${f}`);
  assert.ok(!/\d{2},\d{3}/.test(seg), 'ต้องไม่มีตัวเลขเบี้ยพิมพ์ค้างไว้ในตารางไซซ์');
  // ต้องบอกให้ชัดว่าเป็นเบี้ยเฉพาะสัญญาเพิ่มเติม ไม่รวมสัญญาหลัก ไม่งั้นลูกค้าเข้าใจว่านี่คือทั้งหมด
  assert.match(html, /เบี้ยเฉพาะสัญญาเพิ่มเติมสุขภาพและโรคร้ายแรง<\/b>\s*\n?\s*ยังไม่รวมเบี้ยสัญญาหลัก/);
  assert.match(html, /class="gender-pill/);
});

test('บนมือถือต้องสลับตารางไซซ์เป็นการ์ด ไม่ให้ต้องเลื่อนซ้ายขวา', () => {
  // ตารางเดิมกว้าง 1,344px คอลัมน์โฟกัสหลักอยู่ขวาสุดจึงมองไม่เห็นบนจอ 390px
  assert.match(html, /\.home-size-cards\{display:none;\}/);
  assert.match(html, /@media\(max-width:760px\)\{[\s\S]{0,200}\.home-size-table\{display:none;\}/);
  assert.match(html, /\.home-size-cards\{display:block;\}/);
  assert.match(html, /class="home-size-cards"/);
  assert.match(html, /class="size-card"/);
});

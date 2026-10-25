import {test} from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
const dir=new URL('../data/hospital-network/',import.meta.url);
const meta=JSON.parse(fs.readFileSync(new URL('meta.json',dir),'utf8'));
const rows=meta.companies.flatMap(c=>JSON.parse(fs.readFileSync(new URL(c.id+'.json',dir),'utf8')));
test('ข้อมูลครบทุกแถวและทุกบริษัท',()=>{
  assert.equal(meta.companies.length,10);
  assert.equal(rows.length,7351);
});
test('ศรีนครินทร์ มข. รวมเป็นที่เดียวครบ 10 บริษัท',()=>{
  const keys=new Set(rows.filter(r=>r.province==='ขอนแก่น'&&/ศรีนครินทร์|srinagarind/i.test(r.name)).map(r=>r.entity_key));
  assert.equal(keys.size,1);
  const ins=new Set(rows.filter(r=>keys.has(r.entity_key)).map(r=>r.insurer));
  assert.equal(ins.size,10);
});
test('เปาโลเกษตรกับคลินิกเปาโลโชคชัย 4 ไม่ปนกัน',()=>{
  const k=rows.filter(r=>/เปาโล\s*เกษตร/.test(r.name)).map(r=>r.entity_key);
  assert.ok(rows.filter(r=>k.includes(r.entity_key)).every(r=>!/โชคชัย/.test(r.name)));
});

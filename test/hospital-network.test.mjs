import {test} from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
const dir=new URL('../data/hospital-network/',import.meta.url);
const meta=JSON.parse(fs.readFileSync(new URL('meta.json',dir),'utf8'));
const rows=meta.companies.flatMap(c=>JSON.parse(fs.readFileSync(new URL(c.id+'.json',dir),'utf8')));
test('ข้อมูลครบทุกแถวและทุกบริษัท',()=>{
  assert.equal(meta.companies.length,10);
  assert.equal(rows.length,7377);
});
test('ศรีนครินทร์ มข. รวมเป็นที่เดียวครบ 10 บริษัท',()=>{
  const keys=new Set(rows.filter(r=>r.province==='ขอนแก่น'&&/ศรีนครินทร์|srinagarind/i.test(r.name)).map(r=>r.entity_key));
  assert.equal(keys.size,1);
  const ins=new Set(rows.filter(r=>keys.has(r.entity_key)).map(r=>r.insurer));
  assert.equal(ins.size,10);
});
const keyOf=(prov,re)=>new Set(rows.filter(r=>r.province===prov&&re.test(r.name)).map(r=>r.entity_key));
test('ชื่อต่างกันแต่เป็น รพ. เดียวกัน ต้องรวมเป็นการ์ดเดียว',()=>{
  for(const [prov,re] of [
    ['กรุงเทพมหานคร',/เด็กสินแพทย์|เด็กสินเเพทย์/],
    ['กรุงเทพมหานคร',/^(โรงพยาบาล)?พระราม\s*(9|เก้า)$/],
    ['กรุงเทพมหานคร',/^(โรงพยาบาล)?ธนบุรี( 1)?$|ธนบุรี \(ธนบุรี 1\)/],
    ['กรุงเทพมหานคร',/^(โรงพยาบาล)?กล้วยน้ำไท( 1)?$/],
    ['กรุงเทพมหานคร',/^(โรงพยาบาล)?นวมินทร์( 1)?$/],
    ['กรุงเทพมหานคร',/^(โรงพยาบาล)?บางนา 1$|^โรงพยาบาลบางนา$/],
    ['ชลบุรี',/^(โรงพยาบาล)?เอกชล( 1)?$/],
    ['เชียงใหม่',/เชียงใหม่ ?ราม( 1)?$|Chiangmai Ram 1/],
    ['ตราด',/^(โรงพยาบาล)?ตราด$|พระปิยมหาราช/],
  ]) assert.equal(keyOf(prov,re).size,1,String(re));
});
test('รพ. คนละแห่งที่ชื่อขึ้นต้นเหมือนกัน ต้องไม่ถูกรวม',()=>{
  const mh=['มหาชัย 2','มหาชัย 3','มหาชัย'].map(n=>keyOf('สมุทรสาคร',new RegExp('^(โรงพยาบาล)?'+n+'$')));
  assert.equal(new Set(mh.flatMap(s=>[...s])).size,3);
  assert.ok(keyOf('สุราษฎร์ธานี',/ไทยอินเตอร์เนชั่นแนล$|^ไทยอินเตอร์เนชั่นแนล$/).size>=1);
  const samui=keyOf('สุราษฎร์ธานี',/เกาะสมุย|^(โรงพยาบาล)?ไทยอินเตอร์เนชั่นแนล$/), phangan=keyOf('สุราษฎร์ธานี',/พะงัน|เกาะพงัน/);
  assert.equal([...samui].filter(k=>phangan.has(k)).length,0);
  assert.equal([...keyOf('พะเยา',/^(โรงพยาบาล)?พะเยา$/)].filter(k=>keyOf('พะเยา',/มหาวิทยาลัยพะเยา/).has(k)).length,0);
});
test('บริษัทเดียวกันไม่มีสองแถวที่เลขที่ที่อยู่คนละที่อยู่ใน entity เดียว (กัน รพ./สาขาคนละแห่งโดนรวม)',()=>{
  const by=new Map();
  for(const r of rows){
    const m=(r.address||'').match(/\d+/); if(!m) continue;
    const k=r.entity_key+'|'+r.insurer; if(!by.has(k)) by.set(k,new Set()); by.get(k).add(m[0]);
  }
  const bad=[...by].filter(([k,s])=>s.size>1).map(([k])=>k);
  // ข้อมูลต้นทางของ MTL/Allianz ที่อยู่ไม่ตรงกันเองในแถวเดียวกันอยู่ 1 กรณี (ขอนแก่น)
  assert.ok(bad.length<=2,bad.join('\n'));
});
test('เปาโลเกษตรกับคลินิกเปาโลโชคชัย 4 ไม่ปนกัน',()=>{
  const k=rows.filter(r=>/เปาโล\s*เกษตร/.test(r.name)).map(r=>r.entity_key);
  assert.ok(rows.filter(r=>k.includes(r.entity_key)).every(r=>!/โชคชัย/.test(r.name)));
});

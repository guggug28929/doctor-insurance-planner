#!/usr/bin/env python3
"""ตรวจว่าตัวเลขและกติกาในเว็บไม่ขัดกันเอง

เว็บนี้พูดถึงตัวเลขชุดเดียวกันจากหลายที่ หน้าแผน เครื่องคำนวณ และหน้าเปรียบเทียบ
ถ้าวันหนึ่งบริษัทปรับเกณฑ์แล้วแก้ไม่ครบทุกที่ ลูกค้าจะเห็นสองหน้าที่บอกไม่ตรงกัน
ซึ่งเสียหายกว่าเว็บพัง เพราะไม่มีใครรู้ตัวจนกว่าจะถึงตอนยื่นใบคำขอ

สคริปต์นี้จับเฉพาะกรณีที่ยืนยันได้ด้วยเครื่อง ไม่เดาแทนคน
รันด้วย  python3 tools/check-consistency.py
ออก 0 ถ้าไม่พบปัญหา ออก 1 ถ้าพบ
"""
import json, re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
HTML = (ROOT / 'index.html').read_text(encoding='utf8')
RATES = json.loads((ROOT / 'data' / 'premium-rates.json').read_text(encoding='utf8'))

problems = []
checks = 0


def note(msg):
    problems.append(msg)


def num(s):
    """อ่านตัวเลขจากข้อความไทยที่อาจมีคอมมาและแท็ก"""
    s = re.sub(r'<[^>]*>', '', str(s))
    d = re.sub(r'[^\d]', '', s)
    return int(d) if d else None


# ---------- 1) เพดานและขั้นต่ำของ D Care ----------
m = re.search(r'const DCARE_STAGES = \{(.*?)\n\};', HTML, re.S)
if not m:
    note('หาตาราง DCARE_STAGES ไม่เจอ โครงไฟล์เปลี่ยนไปแล้ว')
else:
    stages = {}
    for line in m.group(1).splitlines():
        g = re.search(r"(\w+):\s*\{label:'([^']+)',\s*minSum:\s*(\d+),\s*maxSum:\s*(\d+),\s*payPct:\s*(\d+)", line)
        if g:
            stages[g.group(1)] = dict(label=g.group(2), minSum=int(g.group(3)),
                                      maxSum=int(g.group(4)), payPct=int(g.group(5)))
    checks += 1
    if set(stages) != {'early_and_severe', 'severe'}:
        note(f'D Care ควรมีสองแบบเท่านั้น พบ {sorted(stages)}')
    for k, v in stages.items():
        checks += 1
        if v['minSum'] > v['maxSum']:
            note(f"D Care แบบ {v['label']} ทุนขั้นต่ำสูงกว่าเพดาน")
        if v['payPct'] not in (100, 200):
            note(f"D Care แบบ {v['label']} เปอร์เซ็นต์การจ่ายผิดปกติ ({v['payPct']}%)")
    # แบบสองระยะต้องจ่ายมากกว่าและเพดานทุนต่ำกว่าเสมอ ถ้ากลับด้านแปลว่าสลับค่ากัน
    if stages:
        es, sv = stages['early_and_severe'], stages['severe']
        checks += 2
        if not es['payPct'] > sv['payPct']:
            note('D Care แบบสองระยะควรจ่ายเปอร์เซ็นต์สูงกว่าแบบระยะรุนแรง')
        if not es['maxSum'] < sv['maxSum']:
            note('D Care แบบสองระยะควรมีเพดานทุนต่ำกว่าแบบระยะรุนแรง')


# ---------- 2) เกณฑ์วงเงิน HB ----------
m = re.search(r'const HB_TIERS = \[(.*?)\n\];', HTML, re.S)
if not m:
    note('หาตาราง HB_TIERS ไม่เจอ')
else:
    tiers = []
    for g in re.finditer(r'\{amt:(\d+),\s*ipdMin:(\d+),\s*noIpdMin:(null|\d+)\}', m.group(1)):
        tiers.append(dict(amt=int(g.group(1)), ipd=int(g.group(2)),
                          noipd=None if g.group(3) == 'null' else int(g.group(3))))
    checks += 1
    if len(tiers) < 8:
        note(f'ระดับวงเงิน HB เหลือ {len(tiers)} ระดับ น้อยผิดปกติ')
    prev_i = prev_n = 0
    for t in tiers:
        checks += 2
        if t['ipd'] < prev_i:
            note(f"HB วงเงิน {t['amt']} ทุนขั้นต่ำกรณีมีสุขภาพลดลงเมื่อวงเงินสูงขึ้น")
        prev_i = t['ipd']
        if t['noipd'] is not None:
            if t['noipd'] < prev_n:
                note(f"HB วงเงิน {t['amt']} ทุนขั้นต่ำกรณีไม่มีสุขภาพลดลงเมื่อวงเงินสูงขึ้น")
            prev_n = t['noipd']
            if t['ipd'] > t['noipd']:
                note(f"HB วงเงิน {t['amt']} เกณฑ์กลับด้าน กรณีมีสุขภาพควรผ่อนกว่าหรือเท่ากับกรณีไม่มี")
    # ข้อความบนหน้าแผนต้องบอกเพดานตรงกับตาราง
    checks += 1
    no_ipd_max = max((t['amt'] for t in tiers if t['noipd'] is not None), default=0)
    all_max = max((t['amt'] for t in tiers), default=0)
    txt = HTML
    if f'สูงสุด {no_ipd_max:,} บาท/วัน' not in txt:
        note(f'หน้าแผน HB ไม่ได้บอกเพดานกรณีไม่มีสุขภาพเหมาจ่าย ({no_ipd_max:,} บาท/วัน)')
    if f'สูงสุด {all_max:,} บาท/วัน' not in txt:
        note(f'หน้าแผน HB ไม่ได้บอกเพดานกรณีมีสุขภาพเหมาจ่าย ({all_max:,} บาท/วัน)')


# ---------- 3) ทุนขั้นต่ำของสัญญาหลัก ----------
m = re.search(r'const LIFE_COMPARE_PRODUCTS = \{(.*?)\nconst LIFE_COMPARE_ROW_DEFS', HTML, re.S)
if not m:
    note('หาทะเบียนสัญญาหลักไม่เจอ')
else:
    body = m.group(1)
    for g in re.finditer(r"\n  (\w+): \{title:'([^']+)'.*?tiers:\[(.*?)\].*?minSum:'([^']*)'", body, re.S):
        key, title, tiers_raw, minsum = g.groups()
        checks += 1
        tier_vals = [int(x) for x in re.findall(r"value:'(\d+)'", tiers_raw)]
        mn = num(minsum)
        if mn is None:
            note(f'{title}: แถวทุนขั้นต่ำอ่านเป็นตัวเลขไม่ได้ ("{minsum}") การ์ดจะไปใช้ทุนของตารางเปรียบเทียบแทน')
        elif tier_vals and mn > min(tier_vals):
            note(f'{title}: ทุนขั้นต่ำ {mn:,} สูงกว่าทุนต่ำสุดในตารางเปรียบเทียบ {min(tier_vals):,}')


# ---------- 4) ทุกแบบที่มีหน้ารายละเอียด ต้องมีเส้นทางของตัวเอง ----------
detail_ids = set(re.findall(r'\n  (\w+): \{\n?\s*title:', HTML))
routes = set(re.findall(r"\n  (\w+): '/plans/[a-z0-9-]+'", HTML))
checks += 1
missing = sorted(detail_ids - routes - {'main9920'})
if detail_ids and routes:
    orphan = [d for d in missing if f"showPlanDetail('{d}')" in HTML]
    if orphan:
        note('แบบที่เปิดหน้ารายละเอียดได้แต่ไม่มีเส้นทางถาวรของตัวเอง: ' + ', '.join(orphan[:8]))


# ---------- 5) ไฟล์อัตราเบี้ยต้องบันทึกแหล่งที่มา ----------
for key, val in RATES.items():
    if not isinstance(val, dict):
        continue
    if 'rates' in val or 'plans' in val:
        checks += 1
        if not (val.get('source') or val.get('source_url')):
            note(f'data/premium-rates.json คีย์ {key} ไม่ได้บันทึกแหล่งที่มา')


print(f'ตรวจ {checks} จุด')
if problems:
    print(f'\nพบ {len(problems)} เรื่องที่ต้องดู:')
    for p in problems:
        print('  •', p)
    sys.exit(1)
print('ไม่พบตัวเลขหรือกติกาที่ขัดกันเอง')

import { mkdir, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const indexUrl = new URL("index.html", root);
const ratesUrl = new URL("data/premium-rates.json", root);

const indexHtml = await readFile(indexUrl, "utf8");
let rates;

const embedded = indexHtml.match(
  /<script[^>]*id=["']rates-data["'][^>]*>([\s\S]*?)<\/script>/i
);
if (embedded) {
  rates = JSON.parse(embedded[1].trim());
} else {
  rates = JSON.parse(await readFile(ratesUrl, "utf8"));
}

function setAgeRange(array, startAge, endAge, value, arrayStartAge = 0) {
  for (let age = startAge; age <= endAge; age += 1) {
    array[age - arrayStartAge] = value;
  }
}

rates.metadata = {
  version: "2026-07-15.1",
  updatedAt: "2026-07-15",
  currency: "THB",
  sourceOfTruth: "https://www.muangthai-agent.com/",
  policy: "Do not estimate, interpolate, or invent premiums.",
  sources: {
    dHealthLite: "https://www.muangthai-agent.com/product/386290/d-health-lite",
    extraCarePlus: "https://www.muangthai-agent.com/product/300161/extra-care-plus",
    smartProtection9920:
      "https://www.muangthai-agent.com/product/311695/smart-protection-99-20",
    flexiProtection9920:
      "https://www.muangthai-agent.com/product/348865/flexi-protection-99-20",
    ciPerfectCare: "https://www.muangthai-agent.com/product/300449/ci-perfect-care",
    multipleCi: "https://www.muangthai-agent.com/product/313916/multiple-ci/",
    dCare: "https://www.muangthai-agent.com/product/300452/d-care",
    maternityPlus: "https://www.muangthai-agent.com/product/318094/maternity-plus",
    wellBeingPlus: "https://www.muangthai-agent.com/product/318092/well-being-plus",
    smartLink153: "https://www.muangthai-agent.com/product/314160/smart-linked-15-3",
    smartLink156: "https://www.muangthai-agent.com/product/313767/smart-link-156-global",
  },
};

// Official Smart Protection 99/20 table: 500k and 1m are exact multiples of 200k.
for (const gender of ["m", "f"]) {
  rates.main_99_20[`${gender}_500k`] = rates.main_99_20[`${gender}_200k`].map(
    (value) => (value === null ? null : value * 2.5)
  );
  rates.main_99_20[`${gender}_1m`] = rates.main_99_20[`${gender}_200k`].map(
    (value) => (value === null ? null : value * 5)
  );
}

// Cells that differed from the official D Health Lite table.
setAgeRange(rates.dhl_1m.m_d20k, 41, 45, 11551);
setAgeRange(rates.dhl_5m.m_d0, 46, 50, 23053);
setAgeRange(rates.dhl_5m.m_d100k, 46, 50, 3959);
setAgeRange(rates.dhl_5m.f_d50k, 36, 40, 9305);

// Official Extra Care Plus Plan 1, male age 81-85.
setAgeRange(rates.ecp.m_p1, 81, 85, 59364, 11);

const flexiMale500k = [
  11785,11855,11965,12075,12185,12300,12420,12540,12665,12790,12920,13055,
  13190,13325,13465,13605,13745,13885,14025,14165,14305,14450,14595,14745,
  14895,15045,15380,15725,16070,16430,16795,16980,17165,17355,17555,17750,
  17950,18155,18365,18580,18795,19015,19240,19465,19700,19955,
];
const flexiFemale500k = [
  11115,11180,11275,11375,11470,11575,11675,11780,11890,12000,12110,12225,
  12345,12460,12585,12705,12830,12960,13090,13220,13355,13495,13630,13775,
  13920,14065,14385,14710,15040,15380,15725,15900,16080,16265,16450,16640,
  16835,17030,17235,17440,17745,18060,18280,18500,18730,18960,
];
rates.flexi_99_20 = {
  age_start: 0,
  age_end: 45,
  allowed_capitals: [500000, 1000000, 5000000],
  m_500k: flexiMale500k,
  m_1m: flexiMale500k.map((value) => value * 2),
  m_5m: flexiMale500k.map((value) => value * 10),
  f_500k: flexiFemale500k,
  f_1m: flexiFemale500k.map((value) => value * 2),
  f_5m: flexiFemale500k.map((value) => value * 10),
};

rates.multiple_ci = {
  age_start: 7,
  age_end: 69,
  allowed_capitals: [500000, 1000000, 2000000],
  m: [
    [7,12,440,880,1760],[13,14,460,920,1840],[15,15,480,960,1920],
    [16,16,500,1000,2000],[17,17,500,1000,2000],[18,34,750,1500,3000],
    [35,39,1325,2650,5300],[40,44,2060,4120,8240],[45,49,3810,7620,15240],
    [50,54,6265,12530,25060],[55,59,10695,21390,42780],
    [60,64,17885,35770,71540],[65,69,24085,48170,96340],
  ],
  f: [
    [7,12,335,670,1340],[13,14,355,710,1420],[15,15,395,790,1580],
    [16,16,420,840,1680],[17,17,440,880,1760],[18,34,750,1500,3000],
    [35,39,1735,3470,6940],[40,44,2250,4500,9000],[45,49,3455,6910,13820],
    [50,54,4685,9370,18740],[55,59,5725,11450,22900],
    [60,64,8380,16760,33520],[65,69,12710,25420,50840],
  ],
};

rates.maternity_plus = {
  gender: "f",
  age_start: 15,
  age_end: 49,
  waiting_days: 280,
  allowed_health_plans: ["dhl", "elite"],
  bands: [[15,19,54482,88280],[20,24,66480,106048],[25,34,60681,96128],[35,49,58135,85809]],
};

rates.well_being_plus = {
  age_start: 11,
  age_end: 90,
  allowed_health_plans: ["dhl", "elite"],
  bands: [[11,18,9789,12131],[19,90,14856,21063]],
  benefits: {
    p1: { healthCheck: 5000, vaccine: 4000, dental: 10000, vision: 5000 },
    p2: { healthCheck: 10000, vaccine: 6000, dental: 15000, vision: 7500 },
  },
};

rates.smart_link_15_3 = {
  age_start: 0,
  age_end: 80,
  pay_years: 3,
  coverage_years: 15,
  capitals: [20000, 200000, 500000, 1000000],
  bands: [[0,70,18900,189000,472500,945000],[71,80,19560,195600,489000,978000]],
};

rates.smart_link_15_6 = {
  age_start: 0,
  age_end: 80,
  pay_years: 6,
  coverage_years: 15,
  capitals: [20000, 100000, 500000, 1000000],
  bands: [[0,70,18900,94500,472500,945000],[71,80,19560,97800,489000,978000]],
};

await mkdir(new URL("data/", root), { recursive: true });
await writeFile(ratesUrl, `${JSON.stringify(rates, null, 2)}\n`);

if (embedded) {
  const loader = `<script>\nconst ratesRequest = new XMLHttpRequest();\nratesRequest.open("GET", "/data/premium-rates.json", false);\nratesRequest.send(null);\nif (ratesRequest.status < 200 || ratesRequest.status >= 300) {\n  throw new Error("โหลดตารางเบี้ย data/premium-rates.json ไม่สำเร็จ");\n}\nconst RATES = JSON.parse(ratesRequest.responseText);`;
  const withoutEmbedded = indexHtml.replace(`${embedded[0]}\n`, "");
  const migrated = withoutEmbedded.replace(
    /<script>\s*const RATES = JSON\.parse\(document\.getElementById\('rates-data'\)\.textContent\);/,
    loader
  );
  if (migrated === withoutEmbedded) throw new Error("Could not replace index rate loader");
  await writeFile(indexUrl, migrated);
}

console.log(`Wrote ${ratesUrl.pathname}`);

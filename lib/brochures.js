const BROCHURE_CATALOG = [
  { key: "d_health_lite", label: "D Health Lite", file: "d-health-lite.pdf", match: /d\s*health\s*lite/i },
  { key: "elite_health_plus", label: "Elite Health Plus", file: "elite-health-plus.pdf", match: /elite\s*health\s*plus/i },
  { key: "care_plus", label: "Care Plus", file: "care-plus.pdf", match: /care\s*plus/i },
  { key: "opd_maochai", label: "OPD เหมาจ่าย", file: "opd-maochai.pdf", match: /opd\s*เหมาจ่าย/i },
  { key: "opd_per_visit", label: "OPD รายครั้ง", file: "opd-per-visit.pdf", match: /opd\s*รายครั้ง/i },
  { key: "extra_care_plus", label: "Extra Care Plus", file: "extra-care-plus.pdf", match: /extra\s*care\s*plus/i },
  { key: "maochai_extra", label: "เหมาจ่าย Extra", file: "maochai-extra.pdf", match: /เหมาจ่าย\s*extra/i },
  { key: "ci_perfect_care", label: "CI Perfect Care", file: "ci-perfect-care.pdf", match: /ci\s*perfect\s*care/i },
  { key: "multiple_ci", label: "Multiple CI", file: "multiple-ci.pdf", match: /multiple\s*ci/i },
  { key: "d_care", label: "D Care", file: "d-care.pdf", match: /d\s*care|ดี\s*แคร์/i },
  { key: "cancer", label: "ความคุ้มครองโรคมะเร็ง", file: "cancer.pdf", match: /โรคมะเร็ง|cancer/i },
  { key: "pa_easy", label: "PA Easy Plan", file: "pa-easy.pdf", match: /pa\s*easy\s*plan/i },
  { key: "hb_rider", label: "HB Rider", file: "hb-rider.pdf", match: /hb\s*rider/i },
];

export function brochureKeysForQuote(quote) {
  const names = [
    ...(quote?.items || []).map((item) => item?.product),
    ...(quote?.alternatives || []).map((item) => item?.product),
    quote?.text || "",
  ].filter(Boolean);
  const source = names.join("\n");
  return BROCHURE_CATALOG.filter((brochure) => brochure.match.test(source)).map(
    (brochure) => brochure.key
  );
}

export function brochureLinks(keys, baseUrl = "https://doctor-insurance.com") {
  const base = String(baseUrl).replace(/\/$/, "");
  const wanted = new Set(Array.isArray(keys) ? keys : []);
  return BROCHURE_CATALOG.filter((brochure) => wanted.has(brochure.key)).map((brochure) => ({
    ...brochure,
    url: `${base}/brochures/${brochure.file}`,
  }));
}

export function brochurePrompt() {
  return "ต้องการโบรชัวร์ของแผนที่แนะนำไหมครับ";
}

export function brochureReply(keys, baseUrl) {
  const links = brochureLinks(keys, baseUrl);
  if (!links.length) return "ยังไม่มีโบรชัวร์สำหรับแผนที่แนะนำในครั้งนี้ครับ";
  return [
    "ได้เลยครับ นี่คือโบรชัวร์เฉพาะแผนที่แนะนำครับ",
    ...links.map((brochure) => `- ${brochure.label}\n${brochure.url}`),
  ].join("\n");
}

export function isBrochureAcceptance(message) {
  const value = String(message || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s!！?？。\.]/g, "")
    .trim();
  return new Set([
    "ใช่ครับ", "ใช่ค่ะ", "โอเคครับ", "โอเคค่ะ", "okครับ", "okค่ะ",
    "ได้ครับ", "ได้ค่ะ", "ครับ", "ค่ะ", "ส่งมาเลยครับ", "ส่งมาเลยค่ะ",
    "ขอรายละเอียด", "ดูรายละเอียด",
  ]).has(value);
}

export { BROCHURE_CATALOG };

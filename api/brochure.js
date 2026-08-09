// Files larger than Vercel's static-asset limit are kept in the public GitHub
// repository.  The customer still receives the approved doctor-insurance.com
// URL; this endpoint redirects only the known oversized brochures.
const FALLBACK_BROCHURE_URLS = Object.freeze({
  "d-health-lite.pdf":
    "https://raw.githubusercontent.com/guggug28929/doctor-insurance-planner/main/public/brochures/d-health-lite.pdf",
  "cancer.pdf":
    "https://raw.githubusercontent.com/guggug28929/doctor-insurance-planner/main/public/brochures/cancer.pdf",
});

export function fallbackBrochureUrl(file) {
  return FALLBACK_BROCHURE_URLS[String(file || "")] || null;
}

export default function handler(req, res) {
  const requestUrl = new URL(req.url || "/api/brochure", "https://doctor-insurance.com");
  const target = fallbackBrochureUrl(requestUrl.searchParams.get("file"));
  if (!target) {
    res.status(404).json({ error: "Brochure not found" });
    return;
  }

  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
  res.writeHead(302, { Location: target });
  res.end();
}

export { FALLBACK_BROCHURE_URLS };

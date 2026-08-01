import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));

test("ทุก route ในเว็บต้องมี rewrite ใน vercel.json ไม่งั้นเปิดตรง ๆ แล้ว 404", () => {
  const routes = [...html.matchAll(/^\s+'?([\w-]+)'?: '(\/[^']*)',$/gm)]
    .map((m) => m[2])
    .filter((r) => r !== "/");
  const sources = vercel.rewrites.map((r) => r.source);
  const covered = (route) =>
    sources.includes(route) ||
    sources.some((s) => s.endsWith("/:path*") && route.startsWith(s.replace("/:path*", "/")));
  const missing = routes.filter((r) => !covered(r));
  assert.deepEqual(missing, [], `route ที่ยังไม่มี rewrite: ${missing.join(", ")}`);
});

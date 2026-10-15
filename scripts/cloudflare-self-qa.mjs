import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicSiteUrl = process.env.PUBLIC_SITE_URL?.trim() || "https://orenda-cherepashka-live.pages.dev";
const env = {
  ...process.env,
  PAGES_BASE_PATH: "/",
  PUBLIC_SITE_URL: publicSiteUrl,
  SUPABASE_PRODUCT_METADATA_MODE: "seed"
};

for (const script of ["build-cloudflare.mjs", "pages-self-qa.mjs"]) {
  const result = spawnSync(process.execPath, [resolve(rootDir, "scripts", script)], {
    cwd: rootDir,
    env,
    stdio: "inherit"
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const adminRoutes = [
  "/admin",
  "/admin/login",
  "/admin/reset-password",
  "/admin/dashboard",
  "/admin/products",
  "/admin/categories",
  "/admin/faqs",
  "/admin/news",
  "/admin/reviews",
  "/admin/leads",
  "/admin/settings"
];
for (const route of adminRoutes) {
  for (const routeFile of [`${route.slice(1)}.html`, `${route.slice(1)}/index.html`]) {
    const html = readFileSync(resolve(rootDir, "dist", routeFile), "utf8");
    assert.match(html, /<meta name="robots" content="noindex,nofollow" \/>/,
      `Static admin route ${routeFile} must not be indexed.`);
    assert.ok(html.includes(`rel="canonical" href="${publicSiteUrl}${route}"`),
      `Static admin route ${routeFile} must use its own canonical URL.`);
  }
}

console.log("Cloudflare Pages root-path build, static admin deep links, and browser QA passed.");

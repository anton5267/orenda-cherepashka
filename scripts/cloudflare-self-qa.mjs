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

const redirects = readFileSync(resolve(rootDir, "dist", "_redirects"), "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);
assert(redirects.includes("/admin /index.html 200"), "Cloudflare Pages must serve the SPA shell at /admin with HTTP 200.");
assert(redirects.includes("/admin/* /index.html 200"), "Cloudflare Pages must serve the SPA shell for direct admin routes with HTTP 200.");

console.log("Cloudflare Pages root-path build, admin-route rewrites, and browser QA passed.");

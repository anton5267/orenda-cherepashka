import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicSiteUrl = process.env.PUBLIC_SITE_URL?.trim() || "https://orenda-cherepashka.pages.dev";
const env = {
  ...process.env,
  PAGES_BASE_PATH: "/",
  PUBLIC_SITE_URL: publicSiteUrl
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

console.log("Cloudflare Pages root-path build and browser QA passed.");

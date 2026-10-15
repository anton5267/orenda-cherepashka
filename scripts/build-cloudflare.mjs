import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicSiteUrl = (process.env.PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "");

if (!publicSiteUrl) {
  throw new Error("Set PUBLIC_SITE_URL to the stable HTTPS URL of the Cloudflare Pages project.");
}

let parsedSiteUrl;
try {
  parsedSiteUrl = new URL(publicSiteUrl);
} catch {
  throw new Error("PUBLIC_SITE_URL must be a valid HTTPS origin, for example https://your-project.pages.dev.");
}

if (
  parsedSiteUrl.protocol !== "https:" ||
  parsedSiteUrl.origin !== publicSiteUrl ||
  /(^|\.)orenda-cherepashka\.shop$/i.test(parsedSiteUrl.hostname)
) {
  throw new Error("PUBLIC_SITE_URL must be an HTTPS site origin and must not use the .shop domain.");
}

const env = {
  ...process.env,
  PUBLIC_SITE_URL: publicSiteUrl,
  VITE_BASE_PATH: "/",
  VITE_STATIC_SITE: "true"
};

const feedResult = spawnSync(process.execPath, [resolve(rootDir, "scripts/fetch-telegram-news.mjs")], {
  cwd: rootDir,
  env,
  stdio: "inherit"
});

if (feedResult.error) throw feedResult.error;
if (feedResult.status !== 0) {
  console.warn("Telegram refresh did not complete; continuing with the last bundled news snapshot.");
}

const buildResult = spawnSync(process.execPath, [resolve(rootDir, "scripts/build-pages.mjs")], {
  cwd: rootDir,
  env,
  stdio: "inherit"
});

if (buildResult.error) throw buildResult.error;
if (buildResult.status !== 0) process.exit(buildResult.status ?? 1);

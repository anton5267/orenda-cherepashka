import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const supabaseUrl = "https://pages-api-smoke.supabase.co";

function runScript(scriptPath, env) {
  const result = spawnSync(process.execPath, [resolve(rootDir, scriptPath)], {
    cwd: rootDir,
    env,
    stdio: "inherit"
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const buildEnv = {
  ...process.env,
  VITE_STATIC_SITE: "true",
  VITE_SUPABASE_URL: supabaseUrl,
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_pages_smoke",
  SUPABASE_PRODUCT_METADATA_MODE: "seed"
};

runScript("scripts/build-pages.mjs", buildEnv);
runScript("scripts/pages-self-qa.mjs", {
  ...buildEnv,
  PAGES_API_SMOKE: "true"
});

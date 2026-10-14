import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiBaseUrl = "https://orenda-cherepashka.onrender.com";

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
  VITE_API_BASE_URL: apiBaseUrl
};

runScript("scripts/build-pages.mjs", buildEnv);
runScript("scripts/pages-self-qa.mjs", {
  ...buildEnv,
  PAGES_API_SMOKE: "true"
});

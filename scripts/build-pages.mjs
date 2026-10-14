import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env, VITE_STATIC_SITE: "true" };
const commands = [
  [resolve(rootDir, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json", "--noEmit"],
  [resolve(rootDir, "node_modules/vite/bin/vite.js"), "build"],
  [resolve(rootDir, "scripts/copy-pages-fallback.mjs")]
];

for (const [entry, ...args] of commands) {
  const result = spawnSync(process.execPath, [entry, ...args], {
    cwd: rootDir,
    env,
    stdio: "inherit"
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

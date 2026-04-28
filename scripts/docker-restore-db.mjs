import { existsSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { ensureDockerEnvFile, runCompose, waitForDockerHealth } from "./docker-ops-lib.mjs";

const args = process.argv.slice(2);
const backupArg = args.find((arg) => !arg.startsWith("--"));

if (!backupArg) {
  console.error("Usage: npm run docker:restore -- <path-to-backup.db>");
  process.exit(1);
}

const backupPath = resolve(backupArg);
if (!existsSync(backupPath)) {
  console.error(`Backup file not found: ${backupPath}`);
  process.exit(1);
}

ensureDockerEnvFile();

runCompose(["up", "-d"]);
await waitForDockerHealth();

runCompose([
  "exec",
  "-T",
  "app",
  "sh",
  "-lc",
  "if [ -f /app/data/site.db ]; then cp /app/data/site.db /app/data/site.db.before-restore; fi"
]);
runCompose(["cp", backupPath, "app:/app/data/site.db.restore"]);
runCompose([
  "exec",
  "-T",
  "app",
  "sh",
  "-lc",
  "mv /app/data/site.db.restore /app/data/site.db"
]);
runCompose(["restart", "app"]);
await waitForDockerHealth();

console.log(`Database restored from: ${backupPath}`);
console.log("Previous live database snapshot inside container: /app/data/site.db.before-restore");

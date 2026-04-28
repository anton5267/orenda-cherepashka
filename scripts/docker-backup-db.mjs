import { copyFileSync, existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import process from "node:process";
import {
  backupsDir,
  ensureBackupsDir,
  ensureDockerEnvFile,
  runCompose,
  timestampFileSafe,
  waitForDockerHealth
} from "./docker-ops-lib.mjs";

const args = process.argv.slice(2);
const outputArg = args.find((arg) => !arg.startsWith("--"));

ensureDockerEnvFile();
ensureBackupsDir();

runCompose(["up", "-d"]);
await waitForDockerHealth();

const destinationPath = outputArg
  ? resolve(outputArg)
  : resolve(backupsDir, `site-${timestampFileSafe()}.db`);

runCompose(["cp", "app:/app/data/site.db", destinationPath]);

if (!existsSync(destinationPath)) {
  throw new Error(`Backup file was not created: ${destinationPath}`);
}

const latestPath = resolve(backupsDir, "latest-site.db");
copyFileSync(destinationPath, latestPath);

console.log(`Database backup created: ${destinationPath}`);
console.log(`Latest backup alias updated: ${latestPath}`);
console.log(`Filename: ${basename(destinationPath)}`);

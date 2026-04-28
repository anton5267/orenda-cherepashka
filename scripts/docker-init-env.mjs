import process from "node:process";
import { composeEnvFile, createRandomSecret, readDockerEnv, writeDockerEnv } from "./docker-ops-lib.mjs";
import { existsSync } from "node:fs";

const args = process.argv.slice(2);
const force = args.includes("--force");
const passwordArg = args.find((arg) => !arg.startsWith("--"))?.trim();
const adminPassword = passwordArg || createRandomSecret(20);

if (existsSync(composeEnvFile) && !force) {
  console.error(`${composeEnvFile} already exists. Use --force to overwrite it.`);
  process.exit(1);
}

const current = existsSync(composeEnvFile) ? readDockerEnv() : {};
writeDockerEnv({
  SESSION_SECRET: current.SESSION_SECRET || createRandomSecret(48),
  ADMIN_PASSWORD: adminPassword,
  SECURE_COOKIES: current.SECURE_COOKIES || "false"
});

console.log(`Created ${composeEnvFile}`);
console.log(`Admin password: ${adminPassword}`);

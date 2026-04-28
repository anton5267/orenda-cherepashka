import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

export const dockerCommand = process.platform === "win32" ? "docker.exe" : "docker";
export const composeEnvFile = resolve(".env.docker");
export const dockerBaseUrl = process.env.DOCKER_BASE_URL ?? "http://127.0.0.1:8080";
export const backupsDir = resolve("backups");

export function ensureDockerEnvFile() {
  if (!existsSync(composeEnvFile)) {
    throw new Error(`Missing ${composeEnvFile}. Copy .env.docker.example to .env.docker or run npm run docker:init-env.`);
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "pipe",
    encoding: "utf8",
    ...options
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    const details = [stderr, stdout].filter(Boolean).join("\n");
    throw new Error(
      `${command} ${args.join(" ")} failed with ${
        result.signal ? `signal ${result.signal}` : `code ${result.status}`
      }${details ? `\n${details}` : ""}.`
    );
  }

  return result.stdout ?? "";
}

export function runCompose(args, options = {}) {
  return runCommand(dockerCommand, ["compose", ...args], options);
}

export function getDockerStackStatus() {
  let envPresent = false;
  let psEntries = [];

  try {
    ensureDockerEnvFile();
    envPresent = true;
  } catch {
    envPresent = false;
  }

  try {
    psEntries = parseComposePsJson(runCompose(["ps", "--format", "json"]));
  } catch {
    psEntries = [];
  }

  return {
    envPresent,
    services: psEntries
  };
}

export async function waitForDockerHealth(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  const healthUrl = `${dockerBaseUrl}/api/health`;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // Stack is still starting.
    }

    await sleep(1_000);
  }

  throw new Error(`Timed out waiting for ${healthUrl}.`);
}

export function parseComposePsJson(raw) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return trimmed
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
}

export function createRandomSecret(length = 32) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%*_-+=";
  let value = "";

  for (let index = 0; index < length; index += 1) {
    value += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return value;
}

export function ensureBackupsDir() {
  mkdirSync(backupsDir, { recursive: true });
}

export function timestampFileSafe(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function readDockerEnv() {
  ensureDockerEnvFile();
  const content = readFileSync(composeEnvFile, "utf8");
  const values = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1);
    values[key] = value;
  }

  return values;
}

export function writeDockerEnv(values) {
  const lines = [
    `SESSION_SECRET=${values.SESSION_SECRET ?? ""}`,
    `ADMIN_PASSWORD=${values.ADMIN_PASSWORD ?? ""}`,
    `SECURE_COOKIES=${values.SECURE_COOKIES ?? "false"}`
  ];
  writeFileSync(composeEnvFile, `${lines.join("\n")}\n`, "utf8");
}

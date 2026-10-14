import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import process from "node:process";
import { hashSync } from "bcryptjs";

const host = process.env.SELF_QA_LOCAL_HOST ?? "127.0.0.1";
const port = process.env.SELF_QA_LOCAL_PORT ?? "4318";
const baseUrl = `http://${host}:${port}`;
const logDir = resolve(".local");
const stdoutLogPath = resolve(logDir, "self-qa-local-server.stdout.log");
const stderrLogPath = resolve(logDir, "self-qa-local-server.stderr.log");
const tempDataDir = mkdtempSync(join(tmpdir(), "orenda-self-qa-"));

mkdirSync(logDir, { recursive: true });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function forwardStream(stream, writer, output) {
  if (!stream) {
    return;
  }

  stream.on("data", (chunk) => {
    writer.write(chunk);
    output.write(chunk);
  });
}

function printLogTail(label, path, lines = 40) {
  try {
    const content = readFileSync(path, "utf8").trim();
    if (!content) {
      return;
    }

    const tail = content.split(/\r?\n/).slice(-lines).join("\n");
    console.error(`\n--- ${label} tail (${path}) ---\n${tail}\n--- end ${label} tail ---`);
  } catch {
    // Best-effort debug output only.
  }
}

async function waitForHealth(serverProcess, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  const healthUrl = `${baseUrl}/api/health`;

  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`Local production server exited early with code ${serverProcess.exitCode}.`);
    }

    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // Server is still starting.
    }

    await sleep(500);
  }

  throw new Error(`Timed out waiting for ${healthUrl}.`);
}

async function verifyPagesApiCors() {
  const pagesOrigin = "https://anton5267.github.io";
  const preflight = await fetch(`${baseUrl}/api/leads`, {
    method: "OPTIONS",
    headers: {
      Origin: pagesOrigin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type"
    }
  });
  assert.equal(preflight.status, 204, "Pages lead preflight was not accepted.");
  assert.equal(preflight.headers.get("access-control-allow-origin"), pagesOrigin);
  assert.equal(preflight.headers.get("access-control-allow-credentials"), null);

  const analyticsPreflight = await fetch(`${baseUrl}/api/analytics/events`, {
    method: "OPTIONS",
    headers: {
      Origin: pagesOrigin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type"
    }
  });
  assert.equal(analyticsPreflight.status, 204, "Pages analytics preflight was not accepted.");
  const analyticsEvent = await fetch(`${baseUrl}/api/analytics/events`, {
    method: "POST",
    headers: {
      Origin: pagesOrigin,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ eventName: "page_view", path: "/", utmSource: "cors-smoke" })
  });
  assert.equal(analyticsEvent.status, 204, "Pages analytics event was not accepted.");
  assert.equal(analyticsEvent.headers.get("access-control-allow-origin"), pagesOrigin);

  const publicRead = await fetch(`${baseUrl}/api/products`, {
    headers: { Origin: pagesOrigin }
  });
  assert.equal(publicRead.status, 200, "Pages public API read did not succeed.");
  assert.equal(publicRead.headers.get("access-control-allow-origin"), pagesOrigin);

  const untrustedPreflight = await fetch(`${baseUrl}/api/leads`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://untrusted.example",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type"
    }
  });
  assert.equal(untrustedPreflight.status, 403, "Untrusted CORS origin was not blocked.");

  const adminPreflight = await fetch(`${baseUrl}/api/admin/login`, {
    method: "OPTIONS",
    headers: {
      Origin: pagesOrigin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type"
    }
  });
  assert.equal(adminPreflight.status, 403, "Cross-origin admin access was not blocked.");

  const proxiedSameOriginLogin = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST",
    headers: {
      Origin: `https://${host}:${port}`,
      "X-Forwarded-Proto": "https",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ password: "" })
  });
  assert.equal(proxiedSameOriginLogin.status, 401, "Same-origin admin login was rejected behind the HTTPS proxy.");

  const effectiveClientIp = "203.0.113.42";
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const failure = await fetch(`${baseUrl}/api/admin/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-Proto": "https",
        "X-Forwarded-For": `198.51.100.${attempt}, ${effectiveClientIp}`
      },
      body: JSON.stringify({ password: "wrong-password" })
    });
    assert.equal(failure.status, 401, `Invalid login attempt ${attempt} was unexpectedly blocked.`);
  }

  const spoofedRetry = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-Proto": "https",
      "X-Forwarded-For": `198.51.100.99, ${effectiveClientIp}`
    },
    body: JSON.stringify({ password: "wrong-password" })
  });
  assert.equal(spoofedRetry.status, 429, "Changing the untrusted forwarded IP bypassed the login rate limit.");
}

function runCommand(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env
    });

    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(" ")} failed with ${signal ? `signal ${signal}` : `code ${code}`}.`
        )
      );
    });
    child.on("error", reject);
  });
}

async function stopServer(serverProcess) {
  if (serverProcess.exitCode !== null) {
    return;
  }

  serverProcess.kill("SIGTERM");

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (serverProcess.exitCode !== null) {
      return;
    }
    await sleep(250);
  }

  if (serverProcess.exitCode === null) {
    serverProcess.kill("SIGKILL");
  }
}

async function main() {
  const nodeCommand = process.execPath;
  const serverEntry = resolve("server-dist", "server", "index.js");
  const stdoutLog = createWriteStream(stdoutLogPath, { flags: "w" });
  const stderrLog = createWriteStream(stderrLogPath, { flags: "w" });

  const serverProcess = spawn(nodeCommand, [serverEntry], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_ENV: "production",
      HOST: host,
      PORT: port,
      SECURE_COOKIES: "false",
      SESSION_SECRET: process.env.SELF_QA_LOCAL_SESSION_SECRET ?? "self-qa-local-session-secret",
      ADMIN_PASSWORD_HASH:
        process.env.SELF_QA_LOCAL_ADMIN_PASSWORD_HASH ?? hashSync("admin1234", 10),
      DATABASE_PATH: resolve(tempDataDir, "site.db"),
      DATABASE_BACKUP_DIR: resolve(tempDataDir, "backups"),
      PUBLIC_SITE_URL: baseUrl,
      PUBLIC_API_ALLOWED_ORIGINS: "https://anton5267.github.io"
    }
  });
  forwardStream(serverProcess.stdout, stdoutLog, process.stdout);
  forwardStream(serverProcess.stderr, stderrLog, process.stderr);

  const cleanup = async () => {
    await stopServer(serverProcess);
    await Promise.allSettled([
      new Promise((resolve) => stdoutLog.end(resolve)),
      new Promise((resolve) => stderrLog.end(resolve))
    ]);
  };

  process.on("SIGINT", () => {
    void cleanup().finally(() => process.exit(130));
  });
  process.on("SIGTERM", () => {
    void cleanup().finally(() => process.exit(143));
  });

  try {
    await waitForHealth(serverProcess);
    await verifyPagesApiCors();
    console.log("GitHub Pages API CORS checks passed.");
    const qaEnv = {
      ...process.env,
      SELF_QA_URL: baseUrl
    };
    await runCommand(nodeCommand, [resolve("scripts", "self-qa.mjs")], qaEnv);
    await runCommand(nodeCommand, [resolve("scripts", "admin-api-smoke.mjs")], qaEnv);
    console.log(`Local self-QA logs: ${stdoutLogPath} | ${stderrLogPath}`);
  } catch (error) {
    printLogTail("local-self-qa stdout", stdoutLogPath);
    printLogTail("local-self-qa stderr", stderrLogPath);
    throw error;
  } finally {
    await cleanup();
    const safeTempRoot = resolve(tmpdir());
    if (
      dirname(resolve(tempDataDir)) === safeTempRoot &&
      basename(tempDataDir).startsWith("orenda-self-qa-")
    ) {
      rmSync(tempDataDir, { recursive: true, force: true });
    }
  }
}

await main();

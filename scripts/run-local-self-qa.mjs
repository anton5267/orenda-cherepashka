import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { hashSync } from "bcryptjs";

const host = process.env.SELF_QA_LOCAL_HOST ?? "127.0.0.1";
const port = process.env.SELF_QA_LOCAL_PORT ?? "4318";
const baseUrl = `http://${host}:${port}`;
const logDir = resolve(".local");
const stdoutLogPath = resolve(logDir, "self-qa-local-server.stdout.log");
const stderrLogPath = resolve(logDir, "self-qa-local-server.stderr.log");

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
        process.env.SELF_QA_LOCAL_ADMIN_PASSWORD_HASH ?? hashSync("admin1234", 10)
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
  }
}

await main();

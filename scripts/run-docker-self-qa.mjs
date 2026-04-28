import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const composeEnvFile = resolve(".env.docker");
const baseUrl = process.env.DOCKER_SELF_QA_URL ?? "http://127.0.0.1:8080";
const keepRunning = process.env.DOCKER_SELF_QA_KEEP_RUNNING === "true";
const dockerCommand = process.platform === "win32" ? "docker.exe" : "docker";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runCommand(args, env = process.env) {
  const result = spawnSync(dockerCommand, args, {
    stdio: "inherit",
    env
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `${dockerCommand} ${args.join(" ")} failed with ${
        result.signal ? `signal ${result.signal}` : `code ${result.status}`
      }.`
    );
  }
}

function runNodeScript(scriptPath, env = process.env) {
  const result = spawnSync(process.execPath, [scriptPath], {
    stdio: "inherit",
    env
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `${scriptPath} failed with ${
        result.signal ? `signal ${result.signal}` : `code ${result.status}`
      }.`
    );
  }
}

async function waitForHealth(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  const healthUrl = `${baseUrl}/api/health`;

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

async function main() {
  if (!existsSync(composeEnvFile)) {
    throw new Error(`Missing ${composeEnvFile}. Copy .env.docker.example to .env.docker first.`);
  }

  const composeArgs = ["compose"];
  const qaEnv = {
    ...process.env,
    SELF_QA_URL: baseUrl
  };

  try {
    runCommand([...composeArgs, "up", "--build", "-d"]);
    await waitForHealth();
    runNodeScript(resolve("scripts", "self-qa.mjs"), qaEnv);
    runNodeScript(resolve("scripts", "admin-api-smoke.mjs"), qaEnv);
  } finally {
    if (!keepRunning) {
      try {
        runCommand([...composeArgs, "down", "-v"]);
      } catch (error) {
        console.error(error);
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

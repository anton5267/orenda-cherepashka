import net from "node:net";
import { dockerBaseUrl, getDockerStackStatus, readDockerEnv, runCommand, runCompose } from "./docker-ops-lib.mjs";

const asJson = process.argv.includes("--json");
const checks = [];

function addCheck(name, status, details, hint) {
  checks.push({ name, status, details, hint });
}

function isLikelyPlaceholder(value, placeholders) {
  return !value || placeholders.includes(value.trim());
}

function probePort(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", (error) => {
      if (error && typeof error === "object" && "code" in error) {
        resolve({ ok: false, code: error.code });
        return;
      }

      resolve({ ok: false, code: "UNKNOWN" });
    });

    server.once("listening", () => {
      server.close(() => resolve({ ok: true, code: "FREE" }));
    });

    server.listen(port, host);
  });
}

async function main() {
  try {
    const dockerVersion = runCommand(process.platform === "win32" ? "docker.exe" : "docker", ["--version"]).trim();
    addCheck("docker", "ok", dockerVersion);
  } catch (error) {
    addCheck(
      "docker",
      "error",
      error instanceof Error ? error.message : String(error),
      "Install Docker Desktop or ensure docker is on PATH."
    );
  }

  try {
    const composeVersion = runCompose(["version"]).trim();
    addCheck("docker-compose", "ok", composeVersion);
  } catch (error) {
    addCheck(
      "docker-compose",
      "error",
      error instanceof Error ? error.message : String(error),
      "Ensure the Docker Compose plugin is available."
    );
  }

  let envValues = null;
  try {
    envValues = readDockerEnv();
    addCheck("env-file", "ok", ".env.docker is present.");

    if (isLikelyPlaceholder(envValues.SESSION_SECRET, ["replace-with-a-long-random-secret"])) {
      addCheck(
        "session-secret",
        "error",
        "SESSION_SECRET is missing or still uses the example placeholder.",
        "Run npm run docker:init-env -- your-admin-password or replace SESSION_SECRET manually."
      );
    } else if ((envValues.SESSION_SECRET?.length ?? 0) < 32) {
      addCheck(
        "session-secret",
        "warn",
        `SESSION_SECRET looks short (${envValues.SESSION_SECRET.length} chars).`,
        "Use at least 32 characters for production-like self-host setups."
      );
    } else {
      addCheck("session-secret", "ok", `SESSION_SECRET length: ${envValues.SESSION_SECRET.length}`);
    }

    if (isLikelyPlaceholder(envValues.ADMIN_PASSWORD, ["change-me-now"])) {
      addCheck(
        "admin-password",
        "error",
        "ADMIN_PASSWORD is missing or still uses the example placeholder.",
        "Run npm run docker:init-env -- your-admin-password or replace ADMIN_PASSWORD manually."
      );
    } else if ((envValues.ADMIN_PASSWORD?.length ?? 0) < 8) {
      addCheck(
        "admin-password",
        "warn",
        `ADMIN_PASSWORD looks weak (${envValues.ADMIN_PASSWORD.length} chars).`,
        "Use a stronger password before exposing the service outside localhost."
      );
    } else {
      addCheck("admin-password", "ok", `ADMIN_PASSWORD length: ${envValues.ADMIN_PASSWORD.length}`);
    }

    addCheck(
      "secure-cookies",
      envValues.SECURE_COOKIES === "false" ? "warn" : "ok",
      `SECURE_COOKIES=${envValues.SECURE_COOKIES ?? "undefined"}`,
      envValues.SECURE_COOKIES === "false"
        ? "Keep false only for localhost or non-HTTPS testing."
        : undefined
    );
  } catch (error) {
    addCheck(
      "env-file",
      "error",
      error instanceof Error ? error.message : String(error),
      "Create it with npm run docker:init-env -- your-admin-password."
    );
  }

  if (envValues) {
    try {
      runCompose(["config"]);
      addCheck("compose-config", "ok", "docker compose config resolved successfully.");
    } catch (error) {
      addCheck(
        "compose-config",
        "error",
        error instanceof Error ? error.message : String(error),
        "Fix docker-compose.yml or .env.docker values until config resolves."
      );
    }
  }

  const stack = getDockerStackStatus();
  const stackUsesPort8080 = stack.services.some(
    (service) =>
      service.Publishers?.some((publisher) => publisher.PublishedPort === 8080) ||
      String(service.Ports ?? "").includes(":8080")
  );
  const stackIsStarting = stack.services.some(
    (service) =>
      String(service.Health ?? "").toLowerCase() === "starting" ||
      String(service.Status ?? "").toLowerCase().includes("starting")
  );
  addCheck(
    "stack",
    stack.services.length > 0 ? "ok" : "warn",
    stack.services.length > 0
      ? `Services detected: ${stack.services.map((service) => service.Service).join(", ")}`
      : "Docker stack is not running."
  );

  const portProbe = await probePort(8080);
  if (stackUsesPort8080) {
    addCheck("port-8080", "ok", "Port 8080 is published by the running Docker stack.");
  } else if (portProbe.ok) {
    addCheck("port-8080", "ok", "Port 8080 is free.");
  } else {
    addCheck(
      "port-8080",
      "error",
      `Port 8080 is occupied (${portProbe.code ?? "EADDRINUSE"}).`,
      "Stop the conflicting process or change the published port in docker-compose.yml."
    );
  }

  try {
    const response = await fetch(`${dockerBaseUrl}/api/health`);
    addCheck(
      "health-endpoint",
      response.ok ? "ok" : "warn",
      response.ok ? `${dockerBaseUrl}/api/health responded 200.` : `${dockerBaseUrl}/api/health responded ${response.status}.`,
      response.ok ? undefined : "Start the stack with npm run docker:up and check docker:logs."
    );
  } catch {
    addCheck(
      "health-endpoint",
      stack.services.length > 0 ? (stackIsStarting ? "info" : "warn") : "info",
      `${dockerBaseUrl}/api/health is not reachable.`,
      stack.services.length > 0
        ? stackIsStarting
          ? "The stack is still starting. Re-run docker:doctor in a few seconds."
          : "Check npm run docker:logs for startup failures."
        : "This is expected while the stack is stopped."
    );
  }

  const summary = {
    ok: !checks.some((check) => check.status === "error"),
    counts: {
      ok: checks.filter((check) => check.status === "ok").length,
      warn: checks.filter((check) => check.status === "warn").length,
      error: checks.filter((check) => check.status === "error").length,
      info: checks.filter((check) => check.status === "info").length
    },
    checks
  };

  if (asJson) {
    console.log(JSON.stringify(summary, null, 2));
    if (!summary.ok) {
      process.exitCode = 1;
    }
    return;
  }

  console.log("Docker doctor summary:");
  for (const check of checks) {
    console.log(`[${check.status}] ${check.name}: ${check.details}`);
    if (check.hint) {
      console.log(`  hint: ${check.hint}`);
    }
  }
  console.log(
    `Counts -> ok: ${summary.counts.ok}, warn: ${summary.counts.warn}, error: ${summary.counts.error}, info: ${summary.counts.info}`
  );

  if (!summary.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

import { dockerBaseUrl, ensureDockerEnvFile, parseComposePsJson, runCompose } from "./docker-ops-lib.mjs";

const asJson = process.argv.includes("--json");

let psEntries = [];
let health = "down";
let envPresent = false;

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

try {
  const response = await fetch(`${dockerBaseUrl}/api/health`);
  health = response.ok ? "ok" : `http-${response.status}`;
} catch {
  health = "down";
}

const status =
  psEntries.length === 0
    ? "stopped"
    : health === "ok"
      ? "running"
      : "degraded";

const result = {
  ok: status === "running" || status === "stopped",
  status,
  envFilePresent: envPresent,
  baseUrl: dockerBaseUrl,
  health,
  services: psEntries
};

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`Docker stack status: ${status}`);
  console.log(`Base URL: ${dockerBaseUrl}`);
  console.log(`Health: ${health}`);
  console.log(`.env.docker: ${envPresent ? "present" : "missing"}`);

  if (psEntries.length > 0) {
    console.log("Services:");
    for (const entry of psEntries) {
      const port = entry.Publishers?.map((publisher) => publisher.PublishedPort).join(", ") || "n/a";
      console.log(`- ${entry.Service}: ${entry.State} (${entry.Health ?? "no-health"}) ports: ${port}`);
    }
  }
}

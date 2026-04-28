import {
  dockerBaseUrl,
  ensureDockerEnvFile,
  getDockerStackStatus,
  runCompose,
  waitForDockerHealth
} from "./docker-ops-lib.mjs";

const args = process.argv.slice(2);
const skipBuild = args.includes("--no-build");

async function main() {
  ensureDockerEnvFile();

  const composeArgs = ["up"];
  if (skipBuild) {
    composeArgs.push("--no-build");
  } else {
    composeArgs.push("--build");
  }
  composeArgs.push("-d");

  runCompose(composeArgs, { stdio: "inherit" });
  await waitForDockerHealth();

  const status = getDockerStackStatus();
  console.log(`Docker stack is running at ${dockerBaseUrl}`);
  if (status.services.length > 0) {
    console.log("Services:");
    for (const entry of status.services) {
      console.log(`- ${entry.Service}: ${entry.Status ?? entry.State ?? "unknown"}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

import { getDockerStackStatus, runCompose } from "./docker-ops-lib.mjs";

const args = process.argv.slice(2);
const removeVolumes = args.includes("--volumes");

async function main() {
  const statusBefore = getDockerStackStatus();
  const composeArgs = ["down"];
  if (removeVolumes) {
    composeArgs.push("-v");
  }

  if (statusBefore.services.length === 0) {
    console.log("Docker stack is already stopped.");
    return;
  }

  runCompose(composeArgs, { stdio: "inherit" });

  const statusAfter = getDockerStackStatus();
  console.log(
    statusAfter.services.length === 0
      ? "Docker stack stopped."
      : "Docker stack stop requested, but some services are still listed by docker compose."
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

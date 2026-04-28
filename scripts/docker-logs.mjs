import process from "node:process";
import { getDockerStackStatus, runCompose } from "./docker-ops-lib.mjs";

const args = process.argv.slice(2);
const follow = args.includes("--follow");
const tailValue = args.find((arg) => arg.startsWith("--tail="))?.slice("--tail=".length) ?? "200";

async function main() {
  const status = getDockerStackStatus();
  if (status.services.length === 0) {
    console.log("Docker stack is stopped. Start it with npm run docker:up first.");
    return;
  }

  const composeArgs = ["logs", `--tail=${tailValue}`];
  if (follow) {
    composeArgs.push("--follow");
  }
  composeArgs.push("app");

  runCompose(composeArgs, { stdio: "inherit" });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

import { mkdtempSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexerDir = path.resolve(__dirname, "..");
const composeFile = path.join(indexerDir, "docker-compose.indexer.yml");
const imageName = process.env.INDEXER_DOCKER_IMAGE ?? "agentpact-indexer:local";
const builderTarget = process.env.INDEXER_DOCKER_TARGET ?? "builder";
const runtimeTarget = "runtime";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: indexerDir,
    stdio: "inherit",
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }
}

function build(target) {
  run("docker", ["build", "--target", target, "-t", imageName, "."]);
}

function copyGeneratedFromImage() {
  const containerName = `agentpact-indexer-codegen-${Date.now()}`;
  const tempRoot = mkdtempSync(path.join(tmpdir(), "agentpact-indexer-"));
  const tempGeneratedDir = path.join(tempRoot, "generated");
  const hostGeneratedDir = path.join(indexerDir, "generated");

  try {
    run("docker", [
      "create",
      "--name",
      containerName,
      imageName,
      "tail",
      "-f",
      "/dev/null",
    ]);
    run("docker", ["start", containerName]);
    run("docker", [
      "exec",
      containerName,
      "sh",
      "-lc",
      "rm -rf /app/generated/node_modules /app/generated/persisted_state.envio.json",
    ]);
    run("docker", ["cp", `${containerName}:/app/generated`, tempRoot]);
    rmSync(hostGeneratedDir, { recursive: true, force: true });
    cpSync(tempGeneratedDir, hostGeneratedDir, { recursive: true });
  } finally {
    spawnSync("docker", ["rm", "-f", containerName], { cwd: indexerDir, stdio: "ignore" });
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function start() {
  run("docker", ["compose", "-f", composeFile, "up", "--build", "indexer"]);
}

function down() {
  run("docker", ["compose", "-f", composeFile, "down", "-v"]);
}

const command = process.argv[2];

switch (command) {
  case "codegen":
    build(builderTarget);
    copyGeneratedFromImage();
    break;
  case "start":
    start();
    break;
  case "down":
    down();
    break;
  default:
    console.error("Usage: node ./scripts/docker-envio.mjs <codegen|start|down>");
    process.exit(1);
}

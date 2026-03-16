import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const SOURCES = [
    {
        source: path.resolve(root, "../contracts/artifacts/src/AgentPactEscrowV2.sol/AgentPactEscrowV2.json"),
        output: path.resolve(root, "abis/AgentPactEscrowV2.json"),
    },
    {
        source: path.resolve(root, "../contracts/artifacts/src/AgentPactTipJar.sol/AgentPactTipJar.json"),
        output: path.resolve(root, "abis/AgentPactTipJar.json"),
    },
];

await mkdir(path.resolve(root, "abis"), { recursive: true });

for (const { source, output } of SOURCES) {
    const raw = JSON.parse(await readFile(source, "utf8"));
    await writeFile(output, JSON.stringify(raw.abi, null, 2) + "\n", "utf8");
    console.log(`synced abi -> ${path.relative(root, output)}`);
}

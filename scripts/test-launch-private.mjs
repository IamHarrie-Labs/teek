// Explicit devnet proof runner. Uses the supplied wallet; never prints secrets.
import { spawnSync, spawn } from "node:child_process";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
if (!process.env.ANCHOR_WALLET) throw new Error("Set ANCHOR_WALLET to the funded devnet wallet path");
const built = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.json",
  "--outDir", "target/launch-test-js"], { cwd: root, stdio: "inherit" });
if (built.status !== 0) process.exit(built.status ?? 1);
const runner = spawn(process.execPath, ["node_modules/mocha/bin/mocha.js", "-t", "480000",
  "target/launch-test-js/tests/launch.private.js"], { cwd: root, stdio: "inherit", env: {
    ...process.env, RUN_TICK_PRIVATE: "1", ANCHOR_PROVIDER_URL: "https://api.devnet.solana.com",
} });
runner.on("exit", code => process.exit(code ?? 1));

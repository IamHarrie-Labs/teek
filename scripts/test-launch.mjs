// Uses a disposable local wallet. Never reads or changes the devnet wallet.
import { spawnSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { Keypair } from "@solana/web3.js";

const root = resolve(import.meta.dirname, "..");
const built = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.json",
  "--outDir", "target/launch-test-js"], { cwd: root, stdio: "inherit" });
if (built.status !== 0) process.exit(built.status ?? 1);
const endpoint = process.env.LAUNCH_LOCAL_RPC ?? "http://127.0.0.1:8899";
const url = new URL(endpoint);
if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
  throw new Error("Local escrow tests only accept a loopback validator");
}
mkdirSync(resolve(root, "target"), { recursive: true });
const walletFile = resolve(root, `target/launch-test-${process.pid}-keypair.json`);
writeFileSync(walletFile, JSON.stringify(Array.from(Keypair.generate().secretKey)), { mode: 0o600 });
const args = ["node_modules/mocha/bin/mocha.js", "-t", "120000", "target/launch-test-js/tests/launch.js",
  "target/launch-test-js/tests/launch.private.js", "target/launch-test-js/tests/private-transaction.test.js"];
args.push("target/launch-test-js/tests/dbc-abi.test.js");
// Including the original local market checks is useful after program changes.
if (process.argv.includes("--with-market")) args.push("target/launch-test-js/tests/tick.js");
const runner = spawn(process.execPath, args, { cwd: root, stdio: "inherit", env: {
  ...process.env, RUN_TICK_PRIVATE: "0", ANCHOR_PROVIDER_URL: endpoint, ANCHOR_WALLET: walletFile,
} });
runner.on("exit", code => {
  unlinkSync(walletFile);
  process.exit(code ?? 1);
});

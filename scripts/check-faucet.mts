// Local devnet check of api/fund.ts (not deployed). Run from the repo root:
//   FAUCET_SECRET_KEY="$(cat target/faucet/faucet-keypair.json)" node --experimental-strip-types scripts/check-faucet.mts
import { Keypair, PublicKey } from "@solana/web3.js";
import { POST } from "../api/fund.ts";

const site = "https://teek.example";
const call = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new Request(`${site}/api/fund`, {
    method: "POST",
    headers: { "Content-Type": "application/json", host: "teek.example", origin: site, "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200)}`, ...headers },
    body: JSON.stringify(body),
  }));

const fresh = Keypair.generate().publicKey.toBase58();
const pda = PublicKey.findProgramAddressSync([Buffer.from("x")], new PublicKey("B6eqSCBhokuZLKqBrzwhquUho183P3Fvu8pgC4a9PFkY"))[0].toBase58();
const results: [string, number, unknown][] = [];
const run = async (name: string, p: Promise<Response>) => { const r = await p; results.push([name, r.status, await r.json()]); };

await run("foreign origin", call({ wallet: fresh }, { origin: "https://evil.example" }));
await run("invalid wallet", call({ wallet: "not-a-key" }));
await run("wrong mint", call({ wallet: fresh, quoteMint: "So11111111111111111111111111111111111111112" }));
await run("program address", call({ wallet: pda }));
await run("fresh wallet", call({ wallet: fresh, quoteMint: "GR5J9vsRr4WauZMaj6NvqYJHxRQjVjzcsTuwv2LgADPj" }));
await run("same wallet again", call({ wallet: fresh }));
for (const [name, status, body] of results) console.log(name.padEnd(18), status, JSON.stringify(body));

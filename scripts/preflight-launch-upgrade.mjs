// Read-only rent/authority check before a devnet upgrade. No secret-key reads.
import { readFileSync } from "node:fs";
import { PublicKey } from "@solana/web3.js";
const program = "B6eqSCBhokuZLKqBrzwhquUho183P3Fvu8pgC4a9PFkY";
const authority = "BtiHqodafgFR34jUhTMRgdgRnEcGvYjHARYPFq5GzeG2";
const endpoint = "https://api.devnet.solana.com";
async function rpc(method, params) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(12000) });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(`RPC ${method} failed`);
      return data.result;
    } catch (error) { if (attempt === 2) throw error; }
  }
}
const genesis = await rpc("getGenesisHash", []);
if (genesis !== "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG") throw new Error("Not Solana devnet");
const p = (await rpc("getAccountInfo", [program, { encoding: "base64", commitment: "confirmed" }])).value;
if (!p?.executable || p.owner !== "BPFLoaderUpgradeab1e11111111111111111111111") throw new Error("Unexpected program owner");
const pdAddress = new PublicKey(Buffer.from(p.data[0], "base64").subarray(4, 36)).toBase58();
const pd = (await rpc("getAccountInfo", [pdAddress, { encoding: "base64", commitment: "confirmed" }])).value;
const bytes = Buffer.from(pd.data[0], "base64");
if (bytes[12] !== 1 || new PublicKey(bytes.subarray(13, 45)).toBase58() !== authority) throw new Error("Upgrade authority mismatch");
const binaryBytes = readFileSync("target/deploy/teek.so").length;
const bufferRent = await rpc("getMinimumBalanceForRentExemption", [binaryBytes + 37]);
const programRent = await rpc("getMinimumBalanceForRentExemption", [binaryBytes + 45]);
const balance = (await rpc("getBalance", [authority, { commitment: "confirmed" }])).value;
const extensionRent = Math.max(0, programRent - pd.lamports);
const needed = bufferRent + extensionRent + 100_000_000; // fees + test-funding headroom
console.log(JSON.stringify({ program, authority, currentBytes: bytes.length - 45, binaryBytes,
  balanceLamports: balance, bufferRentLamports: bufferRent, extensionRentLamports: extensionRent,
  requiredWithHeadroomLamports: needed, sufficient: balance >= needed }));
if (balance < needed) process.exitCode = 2;

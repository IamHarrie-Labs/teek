// Read-only service check with a disposable signing identity. Never logs tokens.
import { Keypair } from "@solana/web3.js";
import { getAuthToken } from "@magicblock-labs/ephemeral-rollups-sdk";
import nacl from "tweetnacl";

const url = "https://devnet-tee.magicblock.app";
const key = Keypair.generate();
try {
  const { token } = await getAuthToken(url, key.publicKey,
    async message => nacl.sign.detached(message, key.secretKey));
  const endpoint = new URL(url);
  endpoint.searchParams.set("token", token);
  for (const method of ["getIdentity", "getHealth"]) {
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }) });
    const data = await response.json();
    console.log(JSON.stringify({ method, httpStatus: response.status,
      identity: data.result?.identity, healthy: data.result === "ok", errorCode: data.error?.code }));
    if (!response.ok || data.error) process.exitCode = 1;
  }
} catch {
  console.error("Private RPC authentication/service check failed; credentials and raw responses omitted.");
  process.exitCode = 1;
}

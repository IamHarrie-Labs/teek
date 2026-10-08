// Inspect public staging/deployed bytes; no signing and no credentials.
import { readFileSync } from "node:fs";
import { Connection, PublicKey } from "@solana/web3.js";
const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const binary = readFileSync("target/deploy/teek.so");
const info = await connection.getAccountInfo(new PublicKey("E7zBofUZLRpUqfeUdEDHFTCkP5L9tcjBjC2MeN1QoBWX"));
if (info) {
  let different = 0;
  for (let i = 0; i < binary.length; i++) if (binary[i] !== info.data[i + 37]) different++;
  console.log(JSON.stringify({ bufferLamports: info.lamports, binaryBytes: binary.length,
    mismatchedBytes: different, uploadComplete: different === 0 }));
} else console.log("Staging buffer closed or absent");
const deployed = await connection.getAccountInfo(new PublicKey("2sBr8QDtS6vmbKX5n5aaKsTk342vjxT3Pmx3o2xFxh9b"));
console.log(JSON.stringify({ deployedMatches: Boolean(deployed && deployed.data.subarray(45, 45 + binary.length).equals(binary)) }));

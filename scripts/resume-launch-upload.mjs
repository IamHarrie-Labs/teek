// Rate-limited, idempotent writes to the existing devnet staging buffer.
// This does not upgrade or create any account. Uses only the supplied authority.
import { readFileSync } from "node:fs";
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
const connection = new Connection("https://api.devnet.solana.com", { commitment: "confirmed", disableRetryOnRateLimit: true });
const loader = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const buffer = new PublicKey("E7zBofUZLRpUqfeUdEDHFTCkP5L9tcjBjC2MeN1QoBWX");
if (!process.env.ANCHOR_WALLET) throw new Error("Set the devnet authority wallet path");
const signer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(process.env.ANCHOR_WALLET, "utf8"))));
if (signer.publicKey.toBase58() !== "BtiHqodafgFR34jUhTMRgdgRnEcGvYjHARYPFq5GzeG2") throw new Error("Authority mismatch");
if (await connection.getGenesisHash() !== "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG") throw new Error("Not devnet");
const binary = readFileSync("target/deploy/tick.so");
const info = await connection.getAccountInfo(buffer);
if (!info?.owner.equals(loader) || info.data.readUInt32LE(0) !== 1 || info.data[4] !== 1
  || !new PublicKey(info.data.subarray(5, 37)).equals(signer.publicKey)
  || info.data.length !== binary.length + 37) throw new Error("Existing staging buffer mismatch");
const chunks = [];
for (let offset = 0; offset < binary.length; offset += 900) {
  const data = binary.subarray(offset, Math.min(offset + 900, binary.length));
  if (!info.data.subarray(37 + offset, 37 + offset + data.length).equals(data)) chunks.push({ offset, data });
}
console.log(`Resuming ${chunks.length} missing chunks in the existing buffer`);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
for (let start = 0; start < chunks.length; start += 4) {
  const batch = chunks.slice(start, start + 4);
  let completed = false;
  for (let attempt = 0; attempt < 4 && !completed; attempt++) {
    try {
      const block = await connection.getLatestBlockhash("confirmed");
      const signatures = [];
      for (const chunk of batch) {
        // bincode UpgradeableLoaderInstruction::Write: variant, offset, Vec length, bytes.
        const header = Buffer.alloc(16);
        header.writeUInt32LE(1, 0); header.writeUInt32LE(chunk.offset, 4);
        header.writeBigUInt64LE(BigInt(chunk.data.length), 8);
        const tx = new Transaction({ feePayer: signer.publicKey, recentBlockhash: block.blockhash }).add(
          new TransactionInstruction({ programId: loader, keys: [
            { pubkey: buffer, isSigner: false, isWritable: true },
            { pubkey: signer.publicKey, isSigner: true, isWritable: false },
          ], data: Buffer.concat([header, chunk.data]) }));
        tx.sign(signer);
        signatures.push(await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 }));
        await sleep(650);
      }
      for (let poll = 0; poll < 25; poll++) {
        const statuses = (await connection.getSignatureStatuses(signatures)).value;
        if (statuses.some(status => status?.err)) throw new Error("Staging write transaction failed");
        if (statuses.every(status => status && ["confirmed", "finalized"].includes(status.confirmationStatus))) {
          completed = true; break;
        }
        await sleep(800);
      }
      if (!completed) throw new Error("Staging writes not confirmed");
    } catch {
      if (attempt === 3) throw new Error(`Could not confirm staging batch at byte ${batch[0].offset}`);
      await sleep(5000);
    }
  }
  console.log(`Confirmed missing chunks ${Math.min(start + 4, chunks.length)}/${chunks.length}`);
}
const final = await connection.getAccountInfo(buffer);
if (!final?.data.subarray(37).equals(binary)) throw new Error("Final staging byte comparison failed");
console.log("Staging buffer exactly matches the local binary; ready for CLI upgrade");

// One-time setup: creates a persistent devnet market for the browser
// demo (tick/src/main.ts + tick/src/chain.ts) to trade against, and
// writes its addresses to tick/src/idl/demo-market.json. Run once with
// `node scripts/seed-demo-market.mjs` from the `tick/` directory,
// using the same funded devnet wallet the test suite uses
// (~/.config/solana/id.json).
//
// Also mints demo base/quote tokens and deposits some into the demo
// browser wallet's TraderAccount (tick/src/chain.ts generates and
// persists that wallet in localStorage; pass its pubkey as argv[2] once
// you've opened the page once so it exists).
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import os from "os";
import BN from "bn.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "..", "..");
const idl = JSON.parse(fs.readFileSync(path.join(workspaceRoot, "target/idl/tick.json"), "utf8"));

const DEVNET_URL = "https://api.devnet.solana.com";
const connection = new Connection(DEVNET_URL, "confirmed");

const walletPath = path.join(os.homedir(), ".config/solana/id.json");
const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf8"))));
const provider = new AnchorProvider(connection, new Wallet(authority), { commitment: "confirmed" });
const program = new Program(idl, provider);

const demoTraderPubkey = process.argv[2] ? new PublicKey(process.argv[2]) : null;
const outPath = path.join(__dirname, "..", "src", "idl", "demo-market.json");

function loadSeededMarket() {
  if (!fs.existsSync(outPath)) return null;
  const parsed = JSON.parse(fs.readFileSync(outPath, "utf8"));
  if (!parsed.market || parsed.market === "11111111111111111111111111111111111111111") return null;
  return {
    market: new PublicKey(parsed.market),
    baseMint: new PublicKey(parsed.baseMint),
    quoteMint: new PublicKey(parsed.quoteMint),
    baseVault: new PublicKey(parsed.baseVault),
    quoteVault: new PublicKey(parsed.quoteVault),
    orderBook: new PublicKey(parsed.orderBook),
    reveal: new PublicKey(parsed.reveal),
    raw: parsed,
  };
}

async function main() {
  console.log("authority:", authority.publicKey.toBase58());

  let seeded = process.env.TICK_FORCE_NEW_MARKET === "1" ? null : loadSeededMarket();
  if (!seeded) {
    const baseMint = await createMint(connection, authority, authority.publicKey, null, 6);
    const quoteMint = await createMint(connection, authority, authority.publicKey, null, 6);
    console.log("baseMint:", baseMint.toBase58());
    console.log("quoteMint:", quoteMint.toBase58());

    const [market] = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), baseMint.toBuffer(), quoteMint.toBuffer()],
      program.programId
    );
    const [baseVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("base_vault"), market.toBuffer()],
      program.programId
    );
    const [quoteVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("quote_vault"), market.toBuffer()],
      program.programId
    );
    const [orderBook] = PublicKey.findProgramAddressSync(
      [Buffer.from("order_book"), market.toBuffer()],
      program.programId
    );
    const [reveal] = PublicKey.findProgramAddressSync(
      [Buffer.from("reveal"), market.toBuffer()],
      program.programId
    );

    await program.methods
      .initializeMarket(new BN(Number(process.env.TICK_BATCH_PERIOD_SLOTS ?? 10000)))
      .accounts({
        authority: authority.publicKey,
        baseMint,
        quoteMint,
        market,
        baseVault,
        quoteVault,
        orderBook,
        reveal,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("market:", market.toBase58());

    const out = {
      market: market.toBase58(),
      baseMint: baseMint.toBase58(),
      quoteMint: quoteMint.toBase58(),
      baseVault: baseVault.toBase58(),
      quoteVault: quoteVault.toBase58(),
      orderBook: orderBook.toBase58(),
      reveal: reveal.toBase58(),
    };
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
    console.log("wrote", outPath);
    seeded = loadSeededMarket();
  } else {
    console.log("using existing market:", seeded.market.toBase58());
  }
  if (!seeded) throw new Error("demo market was not available after seeding");

  if (demoTraderPubkey) {
    console.log("funding demo wallet:", demoTraderPubkey.toBase58());
    await sendAndConfirmTransaction(
      connection,
      new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: authority.publicKey,
          toPubkey: demoTraderPubkey,
          lamports: 0.05 * anchor.web3.LAMPORTS_PER_SOL,
        })
      ),
      [authority]
    );

    // Associated (not arbitrary) token accounts on purpose — the demo
    // wallet's own base/quote ATAs are deterministic from mint + owner,
    // so tick/src/chain.ts can compute their addresses directly with
    // getAssociatedTokenAddressSync instead of needing them recorded
    // here.
    const baseAtaInfo = await getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      seeded.baseMint,
      demoTraderPubkey
    );
    const quoteAtaInfo = await getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      seeded.quoteMint,
      demoTraderPubkey
    );
    await mintTo(connection, authority, seeded.baseMint, baseAtaInfo.address, authority, 1_000_000);
    await mintTo(connection, authority, seeded.quoteMint, quoteAtaInfo.address, authority, 1_000_000);
    console.log("demo base token account:", baseAtaInfo.address.toBase58());
    console.log("demo quote token account:", quoteAtaInfo.address.toBase58());
    console.log(
      "Demo wallet funded with 0.05 SOL + 1,000,000 units each of base/quote demo tokens."
    );
  } else {
    console.log(
      "No demo wallet pubkey passed — open the page once to generate one (stored in " +
        "localStorage), then re-run: node scripts/seed-demo-market.mjs <demoWalletPubkey>"
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


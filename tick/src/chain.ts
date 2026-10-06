// Real, on-chain client for the deployed Tick program — no simulation
// here. Talks directly to devnet using @coral-xyz/anchor against the
// same program the test suite exercises (see ../../tick/PLAN.md for the
// full build history). The demo wallet is a plain devnet Keypair kept in
// this browser's localStorage rather than a browser-extension wallet
// (Phantom etc.) — that keeps the demo self-contained (no extension
// required to try it) at the cost of needing a one-time funding step,
// documented in scripts/seed-demo-wallet.mjs.
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program, type Idl } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
  type TransactionInstruction,
  clusterApiUrl,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { ConnectionMagicRouter, GetCommitmentSignature } from "@magicblock-labs/ephemeral-rollups-sdk";
import idl from "./idl/tick.json";
import demoMarket from "./idl/demo-market.json";

const DEVNET_URL = clusterApiUrl("devnet");
const ER_URL = "https://devnet-us.magicblock.app/";
export const ER_VALIDATOR = new PublicKey("MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd");
export const PROGRAM_ID = new PublicKey((idl as any).address ?? "B6eqSCBhokuZLKqBrzwhquUho183P3Fvu8pgC4a9PFkY");

// A single, persistent demo market seeded once on devnet by
// scripts/seed-demo-market.mjs (see that file for how these addresses
// were produced) — the UI trades on this real market rather than
// spinning up a throwaway one per page load.
export const MARKET = new PublicKey(demoMarket.market);
export const BASE_MINT = new PublicKey(demoMarket.baseMint);
export const QUOTE_MINT = new PublicKey(demoMarket.quoteMint);
export const BASE_VAULT = new PublicKey(demoMarket.baseVault);
export const QUOTE_VAULT = new PublicKey(demoMarket.quoteVault);
export const ORDER_BOOK = new PublicKey(demoMarket.orderBook);
export const REVEAL = new PublicKey(demoMarket.reveal);
export const VRF_ORACLE_QUEUE = new PublicKey("Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh");
export const EPHEMERAL_VRF_QUEUE = new PublicKey("5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc");

const WALLET_STORAGE_KEY = "tick-demo-wallet-secret-key";

function loadOrCreateWallet(): Keypair {
  const stored = localStorage.getItem(WALLET_STORAGE_KEY);
  if (stored) {
    try {
      return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(stored)));
    } catch {
      // fall through and mint a fresh one
    }
  }
  const kp = Keypair.generate();
  localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(Array.from(kp.secretKey)));
  return kp;
}

export const connection = new Connection(DEVNET_URL, "confirmed");
export const router = new ConnectionMagicRouter(ER_URL, "confirmed");
export const wallet = loadOrCreateWallet();
const browserWallet = {
  publicKey: wallet.publicKey,
  signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
    if (tx instanceof VersionedTransaction) tx.sign([wallet]);
    else tx.partialSign(wallet);
    return tx;
  },
  signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
    txs.forEach((tx) => {
      if (tx instanceof VersionedTransaction) tx.sign([wallet]);
      else tx.partialSign(wallet);
    });
    return txs;
  },
};
const provider = new AnchorProvider(connection, browserWallet, {
  commitment: "confirmed",
});
const erProvider = new AnchorProvider(router, browserWallet, {
  commitment: "confirmed",
});
export const program = new Program(idl as Idl, provider);
export const erProgram = new Program(idl as Idl, erProvider);

export function traderAccountPda(owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("trader"), MARKET.toBuffer(), owner.toBuffer()],
    PROGRAM_ID
  )[0];
}

export async function getSolBalance(): Promise<number> {
  return connection.getBalance(wallet.publicKey);
}

export async function fetchTraderAccount(): Promise<{
  baseBalance: number;
  quoteBalance: number;
  baseLocked: number;
  quoteLocked: number;
} | null> {
  try {
    const acc = await (program.account as any).traderAccount.fetch(traderAccountPda(wallet.publicKey));
    return {
      baseBalance: acc.baseBalance.toNumber(),
      quoteBalance: acc.quoteBalance.toNumber(),
      baseLocked: acc.baseLocked.toNumber(),
      quoteLocked: acc.quoteLocked.toNumber(),
    };
  } catch {
    return null;
  }
}

export async function fetchErTraderAccount(): Promise<{
  baseBalance: number;
  quoteBalance: number;
  baseLocked: number;
  quoteLocked: number;
} | null> {
  try {
    const acc = await (erProgram.account as any).traderAccount.fetch(traderAccountPda(wallet.publicKey));
    return {
      baseBalance: acc.baseBalance.toNumber(),
      quoteBalance: acc.quoteBalance.toNumber(),
      baseLocked: acc.baseLocked.toNumber(),
      quoteLocked: acc.quoteLocked.toNumber(),
    };
  } catch {
    return null;
  }
}

export async function ensureTraderAccount(): Promise<void> {
  const existing = await fetchTraderAccount();
  if (existing) return;
  await program.methods
    .initTraderAccount()
    .accounts({
      trader: wallet.publicKey,
      market: MARKET,
      traderAccount: traderAccountPda(wallet.publicKey),
    } as any)
    .rpc();
}

export async function fetchMarket() {
  const acc = await (program.account as any).market.fetch(MARKET);
  return {
    batchPeriodSlots: acc.batchPeriodSlots.toNumber(),
    batchOpenSlot: acc.batchOpenSlot.toNumber(),
    currentBatchId: acc.currentBatchId.toNumber(),
  };
}

export async function fetchOrderBook() {
  const acc = await (program.account as any).orderBook.fetch(ORDER_BOOK);
  return {
    orderCount: acc.orderCount as number,
    orders: acc.orders.slice(0, acc.orderCount).map((o: any) => ({
      trader: o.trader as PublicKey,
      price: o.price.toNumber(),
      qty: o.qty.toNumber(),
      side: o.side === 0 ? "buy" : "sell",
    })),
  };
}

export async function fetchErOrderBook() {
  const acc = await (erProgram.account as any).orderBook.fetch(ORDER_BOOK);
  return {
    orderCount: acc.orderCount as number,
    orders: acc.orders.slice(0, acc.orderCount).map((o: any) => ({
      trader: o.trader as PublicKey,
      price: o.price.toNumber(),
      qty: o.qty.toNumber(),
      side: o.side === 0 ? "buy" : "sell",
    })),
  };
}

export async function fetchErReveal() {
  const acc = await (erProgram.account as any).reveal.fetch(REVEAL);
  return {
    batchId: acc.batchId.toNumber(),
    hadTrade: acc.hadTrade === 1,
    clearingPrice: acc.clearingPrice.toNumber(),
    matchedQty: acc.matchedQty.toNumber(),
    fillCount: acc.fillCount as number,
    fills: acc.fills.slice(0, acc.fillCount).map((f: any) => ({
      trader: f.trader as PublicKey,
      side: f.side === 0 ? "buy" : "sell",
      qty: f.qty.toNumber(),
      price: f.price.toNumber(),
    })),
  };
}

export async function fetchReveal() {
  const acc = await (program.account as any).reveal.fetch(REVEAL);
  return {
    batchId: acc.batchId.toNumber(),
    hadTrade: acc.hadTrade === 1,
    clearingPrice: acc.clearingPrice.toNumber(),
    matchedQty: acc.matchedQty.toNumber(),
    fillCount: acc.fillCount as number,
    fills: acc.fills.slice(0, acc.fillCount).map((f: any) => ({
      trader: f.trader as PublicKey,
      side: f.side === 0 ? "buy" : "sell",
      qty: f.qty.toNumber(),
      price: f.price.toNumber(),
    })),
  };
}

export async function submitOrder(side: "buy" | "sell", price: number, qty: number) {
  await program.methods
    .submitOrder(side === "buy" ? { buy: {} } : { sell: {} }, new anchor.BN(price), new anchor.BN(qty))
    .accounts({
      trader: wallet.publicKey,
      market: MARKET,
      orderBook: ORDER_BOOK,
      traderAccount: traderAccountPda(wallet.publicKey),
    } as any)
    .rpc();
}

async function sendThroughRouter(ix: TransactionInstruction): Promise<string> {
  const tx = new Transaction().add(ix);
  tx.feePayer = wallet.publicKey;
  const writableAccounts = Array.from(
    new Set(
      tx.instructions.flatMap((instruction) =>
        instruction.keys.filter((key) => key.isWritable).map((key) => key.pubkey.toBase58())
      )
    )
  );
  const blockhashResponse = await fetch(ER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getBlockhashForAccounts",
      params: [writableAccounts],
    }),
  }).then((response) => response.json());
  const blockhash = blockhashResponse.result?.value ?? blockhashResponse.result;
  if (!blockhash?.blockhash) {
    throw new Error(`ER blockhash lookup failed: ${JSON.stringify(blockhashResponse)}`);
  }
  tx.recentBlockhash = blockhash.blockhash;
  tx.lastValidBlockHeight = blockhash.lastValidBlockHeight;
  tx.sign(wallet);

  // In Node tests, router.simulateTransaction(tx) gives useful logs before
  // spending a fee. In the browser bundle, web3.js can misclassify this legacy
  // Transaction while simulating and throw before it reaches the ER. The hosted
  // router path itself is already proven in tests, so the browser demo sends the
  // signed wire transaction directly and relies on confirmation errors for
  // user-facing feedback.
  const signature = await router.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  const confirmation = await router.confirmTransaction({ signature, ...blockhash }, "confirmed");
  if (confirmation.value.err) {
    throw new Error(`ER transaction ${signature} failed: ${JSON.stringify(confirmation.value.err)}`);
  }
  return signature;
}

export async function getErIdentity(): Promise<string> {
  const identity = await router.getClosestValidator();
  return identity.identity;
}

async function getDelegationStatusBrowserSafe(key: PublicKey): Promise<boolean> {
  const response = await fetch(`${ER_URL}/getDelegationStatus`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getDelegationStatus",
      params: [key.toBase58()],
    }),
  });
  const payload = await response.json();
  if (payload.error) throw new Error(`delegation status failed: ${JSON.stringify(payload.error)}`);
  return Boolean(payload.result?.isDelegated);
}

export async function getDelegationStatuses(): Promise<Record<string, boolean>> {
  const entries = await Promise.all(
    [MARKET, ORDER_BOOK, REVEAL, traderAccountPda(wallet.publicKey)].map(async (key) => {
      const isDelegated = await getDelegationStatusBrowserSafe(key);
      return [key.toBase58(), isDelegated] as const;
    })
  );
  return Object.fromEntries(entries);
}

export async function delegateToHostedEr() {
  await program.methods
    .delegateTraderAccount(MARKET, ER_VALIDATOR)
    .accounts({
      payer: wallet.publicKey,
      traderAccount: traderAccountPda(wallet.publicKey),
    } as any)
    .rpc();
  await program.methods
    .delegateAccounts(BASE_MINT, QUOTE_MINT, ER_VALIDATOR)
    .accounts({
      payer: wallet.publicKey,
      market: MARKET,
      orderBook: ORDER_BOOK,
      reveal: REVEAL,
    } as any)
    .rpc();
}

export async function fetchErMarket() {
  const acc = await (erProgram.account as any).market.fetch(MARKET);
  return {
    batchPeriodSlots: acc.batchPeriodSlots.toNumber(),
    batchOpenSlot: acc.batchOpenSlot.toNumber(),
    currentBatchId: acc.currentBatchId.toNumber(),
  };
}

export async function getErSlot(): Promise<number> {
  return router.getSlot("confirmed");
}

export async function openErSubmitWindow() {
  const ix = await erProgram.methods
    .clearBatch()
    .accounts({
      cranker: wallet.publicKey,
      market: MARKET,
      orderBook: ORDER_BOOK,
      reveal: REVEAL,
      oracleQueue: EPHEMERAL_VRF_QUEUE,
    } as any)
    .instruction();
  return sendThroughRouter(ix);
}

export async function submitOrderOnEr(side: "buy" | "sell", price: number, qty: number) {
  const ix = await erProgram.methods
    .submitOrder(side === "buy" ? { buy: {} } : { sell: {} }, new anchor.BN(price), new anchor.BN(qty))
    .accounts({
      trader: wallet.publicKey,
      market: MARKET,
      orderBook: ORDER_BOOK,
      traderAccount: traderAccountPda(wallet.publicKey),
    } as any)
    .instruction();
  return sendThroughRouter(ix);
}

export async function clearBatchOnEr() {
  const { orders } = await fetchErOrderBook();
  const traderKeys: string[] = orders.map((o: { trader: PublicKey }) => o.trader.toBase58());
  const uniqueTraderAccounts = Array.from(new Set(traderKeys)).map((s: string) =>
    traderAccountPda(new PublicKey(s))
  );
  const ix = await erProgram.methods
    .clearBatch()
    .accounts({
      cranker: wallet.publicKey,
      market: MARKET,
      orderBook: ORDER_BOOK,
      reveal: REVEAL,
      oracleQueue: EPHEMERAL_VRF_QUEUE,
    } as any)
    .remainingAccounts(uniqueTraderAccounts.map((pubkey) => ({ pubkey, isWritable: true, isSigner: false })))
    .instruction();
  return sendThroughRouter(ix);
}

export async function commitAndUndelegateFromEr(): Promise<{ schedulingSignature: string; commitmentSignature: string }> {
  const ix = await erProgram.methods
    .commitAndUndelegate()
    .accounts({
      payer: wallet.publicKey,
      market: MARKET,
      orderBook: ORDER_BOOK,
      reveal: REVEAL,
    } as any)
    .remainingAccounts([{ pubkey: traderAccountPda(wallet.publicKey), isWritable: true, isSigner: false }])
    .instruction();
  const schedulingSignature = await sendThroughRouter(ix);
  const commitmentSignature = await GetCommitmentSignature(schedulingSignature, router);
  return { schedulingSignature, commitmentSignature };
}

export async function depositQuote(amount: number) {
  const traderTokenAccount = getAssociatedTokenAddressSync(QUOTE_MINT, wallet.publicKey);
  await program.methods
    .depositQuote(new anchor.BN(amount))
    .accounts({
      trader: wallet.publicKey,
      market: MARKET,
      quoteVault: QUOTE_VAULT,
      traderTokenAccount,
      traderAccount: traderAccountPda(wallet.publicKey),
      tokenProgram: TOKEN_PROGRAM_ID,
    } as any)
    .rpc();
}

export async function depositBase(amount: number) {
  const traderTokenAccount = getAssociatedTokenAddressSync(BASE_MINT, wallet.publicKey);
  await program.methods
    .depositBase(new anchor.BN(amount))
    .accounts({
      trader: wallet.publicKey,
      market: MARKET,
      baseVault: BASE_VAULT,
      traderTokenAccount,
      traderAccount: traderAccountPda(wallet.publicKey),
      tokenProgram: TOKEN_PROGRAM_ID,
    } as any)
    .rpc();
}

export async function getTokenBalances(): Promise<{ base: number; quote: number }> {
  const baseAta = getAssociatedTokenAddressSync(BASE_MINT, wallet.publicKey);
  const quoteAta = getAssociatedTokenAddressSync(QUOTE_MINT, wallet.publicKey);
  const [baseInfo, quoteInfo] = await Promise.all([
    connection.getTokenAccountBalance(baseAta).catch(() => null),
    connection.getTokenAccountBalance(quoteAta).catch(() => null),
  ]);
  return {
    base: baseInfo ? Number(baseInfo.value.amount) : 0,
    quote: quoteInfo ? Number(quoteInfo.value.amount) : 0,
  };
}

/// Cranks clear_batch once the batch window has elapsed. Anyone can call
/// this — matches the program's own design (see lib.rs): there's no
/// privileged party gating when a batch clears, which is part of why
/// speed within a batch can't be bought. Needs every unique trader in
/// the current order book passed as remaining accounts so the VRF
/// oracle's callback can settle their balances (see PLAN.md).
export async function clearBatch() {
  const { orders } = await fetchOrderBook();
  const traderKeys: string[] = orders.map((o: { trader: PublicKey }) => o.trader.toBase58());
  const uniqueTraderAccounts = Array.from(new Set(traderKeys)).map((s: string) =>
    traderAccountPda(new PublicKey(s))
  );
  await program.methods
    .clearBatch()
    .accounts({
      cranker: wallet.publicKey,
      market: MARKET,
      orderBook: ORDER_BOOK,
      reveal: REVEAL,
      oracleQueue: VRF_ORACLE_QUEUE,
    } as any)
    .remainingAccounts(uniqueTraderAccounts.map((pubkey) => ({ pubkey, isWritable: true, isSigner: false })))
    .rpc();
}



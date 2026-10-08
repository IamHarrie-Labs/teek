// Hosted devnet faucet for judges: 0.05 test SOL plus 100 synthetic quote tokens per wallet.
// Spends only from a dedicated faucet wallet (its balances are the hard budget); the secret
// lives in the FAUCET_SECRET_KEY environment variable and never reaches the browser.
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";


const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const QUOTE_MINT = new PublicKey(process.env.FAUCET_QUOTE_MINT ?? "GR5J9vsRr4WauZMaj6NvqYJHxRQjVjzcsTuwv2LgADPj");
const QUOTE_DECIMALS = 6;
const QUOTE_AMOUNT = 100_000_000n;
const SOL_TOP_UP = 50_000_000;
const SOL_FLOOR = 20_000_000;
const FAUCET_SOL_RESERVE = 10_000_000;
const PER_IP_LIMIT = 5;
const PER_IP_WINDOW_MS = 60 * 60 * 1000;

// Same policy as clients/rpc.ts: resend the identical body on 429/5xx (signatures stay valid).
const retryingFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(input, init);
      if (![429, 502, 503, 504].includes(response.status) || attempt >= 5) return response;
      await response.body?.cancel();
    } catch (error) {
      if (attempt >= 5) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** attempt, 8000)));
  }
};

const connection = new Connection(process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com", {
  commitment: "confirmed",
  disableRetryOnRateLimit: true,
  fetch: retryingFetch as any,
});

// Best effort only: counts live per warm function instance. The faucet balance is the real cap.
const ipHits = new Map<string, number[]>();
let devnetChecked = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function faucetKeypair(): Keypair {
  const secret = process.env.FAUCET_SECRET_KEY;
  if (!secret) throw new Error("Faucet is not configured.");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret)));
}

function sameSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const allowed = (process.env.FAUCET_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return allowed.includes(origin) || new URL(origin).host === request.headers.get("host");
}

function rateLimited(request: Request): boolean {
  const ip = (request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const now = Date.now();
  const recent = (ipHits.get(ip) ?? []).filter((t) => now - t < PER_IP_WINDOW_MS);
  if (recent.length >= PER_IP_LIMIT) return true;
  recent.push(now);
  ipHits.set(ip, recent);
  return false;
}

export async function POST(request: Request): Promise<Response> {
  try {
    if (!sameSite(request)) return json(403, { error: "Requests must come from the Teek site." });
    if (rateLimited(request)) return json(429, { error: "Too many funding requests from this network. Try again later." });

    const body = (await request.json().catch(() => null)) as { wallet?: string; quoteMint?: string } | null;
    let owner: PublicKey;
    try {
      owner = new PublicKey(body?.wallet ?? "");
    } catch {
      return json(400, { error: "Send a valid Solana wallet address." });
    }
    if (!PublicKey.isOnCurve(owner.toBytes())) return json(400, { error: "Send a wallet address, not a program account." });
    if (body?.quoteMint && body.quoteMint !== QUOTE_MINT.toBase58()) {
      return json(400, { error: "Only the published synthetic demo token is supported." });
    }

    if (!devnetChecked) {
      if ((await connection.getGenesisHash()) !== DEVNET_GENESIS) return json(500, { error: "Faucet is devnet-only." });
      devnetChecked = true;
    }

    const faucet = faucetKeypair();
    const faucetQuote = getAssociatedTokenAddressSync(QUOTE_MINT, faucet.publicKey);
    const ownerQuote = getAssociatedTokenAddressSync(QUOTE_MINT, owner);
    const [ownerSol, ownerQuoteInfo, faucetSol, faucetQuoteBalance] = await Promise.all([
      connection.getBalance(owner),
      connection.getTokenAccountBalance(ownerQuote).catch(() => null),
      connection.getBalance(faucet.publicKey),
      connection.getTokenAccountBalance(faucetQuote).catch(() => null),
    ]);
    const ownerHasQuote = BigInt(ownerQuoteInfo?.value.amount ?? "0") >= QUOTE_AMOUNT;
    const needsSol = ownerSol < SOL_FLOOR;
    if (ownerHasQuote && !needsSol) {
      return json(200, { status: "already-funded", quoteAccount: ownerQuote.toBase58() });
    }

    const tx = new Transaction();
    if (needsSol) {
      if (faucetSol < SOL_TOP_UP + FAUCET_SOL_RESERVE) return json(503, { error: "The test-SOL budget is used up. Please try again later." });
      tx.add(SystemProgram.transfer({ fromPubkey: faucet.publicKey, toPubkey: owner, lamports: SOL_TOP_UP }));
    }
    if (!ownerHasQuote) {
      if (BigInt(faucetQuoteBalance?.value.amount ?? "0") < QUOTE_AMOUNT) return json(503, { error: "The test-token budget is used up. Please try again later." });
      tx.add(
        createAssociatedTokenAccountIdempotentInstruction(faucet.publicKey, ownerQuote, owner, QUOTE_MINT),
        createTransferCheckedInstruction(faucetQuote, QUOTE_MINT, ownerQuote, faucet.publicKey, QUOTE_AMOUNT, QUOTE_DECIMALS),
      );
    }
    const signature = await sendAndConfirmTransaction(connection, tx, [faucet], { commitment: "confirmed" });
    return json(200, {
      status: "funded",
      signature,
      quoteAccount: ownerQuote.toBase58(),
      testSol: needsSol ? SOL_TOP_UP : 0,
      testQuoteAmount: ownerHasQuote ? "0" : QUOTE_AMOUNT.toString(),
    });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : "Funding failed." });
  }
}

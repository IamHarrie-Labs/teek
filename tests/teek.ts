// Real Anchor integration test against a plain local validator (`anchor
// test`). No ER or VRF oracle here — a bare `solana-test-validator`
// doesn't have MagicBlock's VRF program deployed at all, so `clear_batch`
// (which now CPIs into it to request randomness) and `clear_batch_callback`
// (which only the oracle itself can ever invoke) genuinely cannot be
// exercised here. See tests/teek.devnet.ts for the real, full round-trip
// against devnet's actual VRF oracle. What's still meaningfully testable
// on a plain local validator: market setup and the batch-window guard on
// `submit_order`.

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
// Imported directly from its own package rather than `anchor.BN` — under
// ts-mocha's CJS/ESM interop, `anchor.BN` comes through as a wrapped
// module namespace object rather than the raw constructor.
import BN from "bn.js";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createMint,
  createAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { assert } from "chai";
import type { Teek } from "../teek/src/idl/teek";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("teek", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Teek as Program<Teek>;
  const connection = provider.connection;

  const authority = (provider.wallet as anchor.Wallet).payer;
  let baseMint: PublicKey;
  let quoteMint: PublicKey;
  let market: PublicKey;
  let baseVault: PublicKey;
  let quoteVault: PublicKey;
  let orderBook: PublicKey;
  let reveal: PublicKey;
  let buyerTraderAccount: PublicKey;
  let sellerTraderAccount: PublicKey;
  let buyerQuoteAccount: PublicKey;
  let sellerBaseAccount: PublicKey;

  // Two traders on opposite sides of the same batch — a buyer willing to
  // pay up to 110, a seller willing to go as low as 90. The whole claim
  // is that both fill at ONE price, not at their own aggressive limits.
  const buyer = Keypair.generate();
  const seller = Keypair.generate();

  // Wider than strictly needed for the seal check itself — submitting
  // orders now happens after opening + funding each trader's
  // TraderAccount (4 extra transactions), so the window needs enough
  // slack for those to land first.
  const BATCH_PERIOD_SLOTS = new BN(40);

  before(async () => {
    for (const kp of [buyer, seller]) {
      const sig = await connection.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, "confirmed");
    }

    baseMint = await createMint(connection, authority, authority.publicKey, null, 6);
    quoteMint = await createMint(connection, authority, authority.publicKey, null, 6);

    [market] = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), baseMint.toBuffer(), quoteMint.toBuffer()],
      program.programId
    );
    [baseVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("base_vault"), market.toBuffer()],
      program.programId
    );
    [quoteVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("quote_vault"), market.toBuffer()],
      program.programId
    );
    [orderBook] = PublicKey.findProgramAddressSync(
      [Buffer.from("order_book"), market.toBuffer()],
      program.programId
    );
    [reveal] = PublicKey.findProgramAddressSync(
      [Buffer.from("reveal"), market.toBuffer()],
      program.programId
    );
    [buyerTraderAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("trader"), market.toBuffer(), buyer.publicKey.toBuffer()],
      program.programId
    );
    [sellerTraderAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("trader"), market.toBuffer(), seller.publicKey.toBuffer()],
      program.programId
    );
  });

  it("initializes a market", async () => {
    await program.methods
      .initializeMarket(BATCH_PERIOD_SLOTS)
      .accountsPartial({
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

    const marketAccount = await program.account.market.fetch(market);
    assert.equal(marketAccount.currentBatchId.toNumber(), 0);
  });

  it("seals a batch: orders land, then submit_order rejects once the window elapses", async () => {
    // submit_order now locks a trader's balance against their
    // TraderAccount (qty*price of quote for a buy, qty of base for a
    // sell) — so both traders need an account opened and funded before
    // they can place the orders below.
    await program.methods
      .initTraderAccount()
      .accounts({ trader: buyer.publicKey, market, traderAccount: buyerTraderAccount } as any)
      .signers([buyer])
      .rpc();
    await program.methods
      .initTraderAccount()
      .accounts({ trader: seller.publicKey, market, traderAccount: sellerTraderAccount } as any)
      .signers([seller])
      .rpc();

    buyerQuoteAccount = await createAccount(connection, buyer, quoteMint, buyer.publicKey);
    await mintTo(connection, authority, quoteMint, buyerQuoteAccount, authority, 10_000);
    await program.methods
      .depositQuote(new BN(2_000))
      .accounts({
        trader: buyer.publicKey,
        market,
        quoteVault,
        traderTokenAccount: buyerQuoteAccount,
        traderAccount: buyerTraderAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .signers([buyer])
      .rpc();

    sellerBaseAccount = await createAccount(connection, seller, baseMint, seller.publicKey);
    await mintTo(connection, authority, baseMint, sellerBaseAccount, authority, 10_000);
    await program.methods
      .depositBase(new BN(2_000))
      .accounts({
        trader: seller.publicKey,
        market,
        baseVault,
        traderTokenAccount: sellerBaseAccount,
        traderAccount: sellerTraderAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .signers([seller])
      .rpc();

    // Buyer bids aggressively at 110, seller asks conservatively at 90 —
    // both land in the same sealed batch. Actually clearing them (and
    // checking they settle at one uniform price) needs clear_batch's VRF
    // request to succeed, which needs the VRF program deployed and an
    // oracle servicing it — neither exists on a bare local validator. See
    // tests/teek.devnet.ts for that assertion against the real thing.
    await program.methods
      .submitOrder({ buy: {} }, new BN(110), new BN(10))
      .accounts({ trader: buyer.publicKey, market, orderBook, traderAccount: buyerTraderAccount } as any)
      .signers([buyer])
      .rpc();

    await program.methods
      .submitOrder({ sell: {} }, new BN(90), new BN(10))
      .accounts({ trader: seller.publicKey, market, orderBook, traderAccount: sellerTraderAccount } as any)
      .signers([seller])
      .rpc();

    const orderBookAccount = await program.account.orderBook.fetch(orderBook);
    assert.equal(orderBookAccount.orderCount, 2);

    // Wait for the batch window to elapse (BATCH_PERIOD_SLOTS slots),
    // then confirm the seal actually holds: no further orders accepted.
    await sleep(22000);

    let threw = false;
    try {
      await program.methods
        .submitOrder({ buy: {} }, new BN(100), new BN(1))
        .accounts({ trader: buyer.publicKey, market, orderBook, traderAccount: buyerTraderAccount } as any)
        .signers([buyer])
        .rpc();
    } catch (err) {
      threw = true;
      assert.include(JSON.stringify(err), "BatchSealed");
    }
    assert.isTrue(threw, "submit_order should reject once the window has elapsed");
  });
});

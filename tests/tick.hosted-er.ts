import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import BN from "bn.js";
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  getAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  ConnectionMagicRouter,
  GetCommitmentSignature,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import type { Tick } from "../target/types/tick";

const idl = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "target/idl/tick.json"), "utf8")
);

const BASE_URL = "https://api.devnet.solana.com";
const ER_URL = "https://devnet-us.magicblock.app/";
const ER_VALIDATOR = new PublicKey("MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd");
const DELEGATION_PROGRAM_ID = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
const EPHEMERAL_VRF_QUEUE = new PublicKey("5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("tick (hosted MagicBlock ER)", function () {
  this.timeout(420_000);

  const authority = (AnchorProvider.env().wallet as Wallet).payer;
  const baseConnection = new Connection(BASE_URL, "confirmed");
  const baseProvider = new AnchorProvider(baseConnection, new Wallet(authority), {
    commitment: "confirmed",
  });
  const baseProgram = new Program(idl as anchor.Idl, baseProvider) as unknown as Program<Tick>;

  const router = new ConnectionMagicRouter(ER_URL, "confirmed");
  const erProvider = new AnchorProvider(router, new Wallet(authority), {
    commitment: "confirmed",
  });
  const erProgram = new Program(idl as anchor.Idl, erProvider) as unknown as Program<Tick>;

  async function sendThroughRouter(ix: TransactionInstruction): Promise<string> {
    const tx = new Transaction().add(ix);
    tx.feePayer = authority.publicKey;

    const writableAccounts = Array.from(
      new Set(
        tx.instructions.flatMap((instruction) =>
          instruction.keys
            .filter((key) => key.isWritable)
            .map((key) => key.pubkey.toBase58())
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
      throw new Error(
        `ER blockhash lookup failed for writable accounts ${writableAccounts.join(", ")}: ${JSON.stringify(
          blockhashResponse
        )}`
      );
    }
    tx.recentBlockhash = blockhash.blockhash;
    tx.lastValidBlockHeight = blockhash.lastValidBlockHeight;
    tx.sign(authority);

    // Simulate the exact routed transaction before spending a fee. This also
    // produces useful logs if an account was delegated to the wrong validator.
    const simulation = await router.simulateTransaction(tx);
    if (simulation.value.err) {
      throw new Error(
        `ER simulation failed: ${JSON.stringify(simulation.value.err)}\n${
          simulation.value.logs?.join("\n") ?? "(no logs)"
        }`
      );
    }

    const signature = await router.sendRawTransaction(tx.serialize(), {
      skipPreflight: true,
    });
    const confirmation = await router.confirmTransaction(
      { signature, ...blockhash },
      "confirmed"
    );
    assert.isNull(confirmation.value.err, `ER transaction ${signature} failed`);
    return signature;
  }

  async function waitFor<T>(
    label: string,
    read: () => Promise<T>,
    done: (value: T) => boolean,
    attempts = 40,
    intervalMs = 2_000
  ): Promise<T> {
    let value = await read();
    for (let attempt = 0; attempt < attempts && !done(value); attempt++) {
      await sleep(intervalMs);
      value = await read();
    }
    assert.isTrue(done(value), `timed out waiting for ${label}`);
    return value;
  }

  it("delegates, trades, clears, commits, and undelegates one funded market", async () => {
    const identity = await router.getClosestValidator();
    assert.equal(identity.identity, ER_VALIDATOR.toBase58());

    // Reuse an existing empty market owned by this program. This avoids
    // paying rent for another pair of large OrderBook/Reveal accounts.
    const markets = await baseProgram.account.market.all();
    let selected:
      | {
          market: PublicKey;
          account: any;
          orderBook: PublicKey;
          reveal: PublicKey;
        }
      | undefined;
    let createdFreshMarket = false;

    for (const candidate of markets) {
      if (!candidate.account.authority.equals(authority.publicKey)) continue;
      if (candidate.account.batchPeriodSlots.toNumber() < 300) continue;

      const [orderBook] = PublicKey.findProgramAddressSync(
        [Buffer.from("order_book"), candidate.publicKey.toBuffer()],
        baseProgram.programId
      );
      const [reveal] = PublicKey.findProgramAddressSync(
        [Buffer.from("reveal"), candidate.publicKey.toBuffer()],
        baseProgram.programId
      );
      const infos = await baseConnection.getMultipleAccountsInfo([
        candidate.publicKey,
        orderBook,
        reveal,
      ]);
      if (infos.some((info) => !info || !info.owner.equals(baseProgram.programId))) continue;

      const book = await baseProgram.account.orderBook.fetch(orderBook);
      if (book.orderCount !== 0 || book.awaitingVrf !== 0) continue;
      selected = { market: candidate.publicKey, account: candidate.account, orderBook, reveal };
      break;
    }

    if (!selected) {
      const baseMint = await createMint(baseConnection, authority, authority.publicKey, null, 6);
      const quoteMint = await createMint(baseConnection, authority, authority.publicKey, null, 6);
      const [market] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), baseMint.toBuffer(), quoteMint.toBuffer()],
        baseProgram.programId
      );
      const [baseVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("base_vault"), market.toBuffer()],
        baseProgram.programId
      );
      const [quoteVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("quote_vault"), market.toBuffer()],
        baseProgram.programId
      );
      const [orderBook] = PublicKey.findProgramAddressSync(
        [Buffer.from("order_book"), market.toBuffer()],
        baseProgram.programId
      );
      const [reveal] = PublicKey.findProgramAddressSync(
        [Buffer.from("reveal"), market.toBuffer()],
        baseProgram.programId
      );

      await baseProgram.methods
        .initializeMarket(new BN(300))
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
          systemProgram: anchor.web3.SystemProgram.programId,
        } as any)
        .rpc();

      selected = {
        market,
        account: await baseProgram.account.market.fetch(market),
        orderBook,
        reveal,
      };
      createdFreshMarket = true;
    }

    const { market, account: marketAccount, orderBook, reveal } = selected!;
    const [baseVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("base_vault"), market.toBuffer()],
      baseProgram.programId
    );
    const [quoteVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("quote_vault"), market.toBuffer()],
      baseProgram.programId
    );
    const [traderAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("trader"), market.toBuffer(), authority.publicKey.toBuffer()],
      baseProgram.programId
    );

    const existingTrader = await baseConnection.getAccountInfo(traderAccount);
    if (!existingTrader) {
      await baseProgram.methods
        .initTraderAccount()
        .accounts({ trader: authority.publicKey, market, traderAccount } as any)
        .rpc();
    } else {
      assert.isTrue(existingTrader.owner.equals(baseProgram.programId));
    }

    const baseAta = await getOrCreateAssociatedTokenAccount(
      baseConnection,
      authority,
      marketAccount.baseMint,
      authority.publicKey
    );
    const quoteAta = await getOrCreateAssociatedTokenAccount(
      baseConnection,
      authority,
      marketAccount.quoteMint,
      authority.publicKey
    );

    const beforeFunding = await baseProgram.account.traderAccount.fetch(traderAccount);
    const targetBalance = 2_000;
    if (beforeFunding.baseBalance.toNumber() < targetBalance) {
      const needed = targetBalance - beforeFunding.baseBalance.toNumber();
      const source = await getAccount(baseConnection, baseAta.address);
      if (source.amount < BigInt(needed)) {
        await mintTo(
          baseConnection,
          authority,
          marketAccount.baseMint,
          baseAta.address,
          authority,
          BigInt(needed) - source.amount
        );
      }
      await baseProgram.methods
        .depositBase(new BN(needed))
        .accounts({
          trader: authority.publicKey,
          market,
          baseVault,
          traderTokenAccount: baseAta.address,
          traderAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .rpc();
    }
    if (beforeFunding.quoteBalance.toNumber() < targetBalance) {
      const needed = targetBalance - beforeFunding.quoteBalance.toNumber();
      const source = await getAccount(baseConnection, quoteAta.address);
      if (source.amount < BigInt(needed)) {
        await mintTo(
          baseConnection,
          authority,
          marketAccount.quoteMint,
          quoteAta.address,
          authority,
          BigInt(needed) - source.amount
        );
      }
      await baseProgram.methods
        .depositQuote(new BN(needed))
        .accounts({
          trader: authority.publicKey,
          market,
          quoteVault,
          traderTokenAccount: quoteAta.address,
          traderAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .rpc();
    }

    const currentSlot = await baseConnection.getSlot("confirmed");
    if (
      !createdFreshMarket &&
      currentSlot >=
        marketAccount.batchOpenSlot.toNumber() + marketAccount.batchPeriodSlots.toNumber()
    ) {
      // Open a fresh window immediately before delegating. Reused markets have
      // old slot deadlines; an empty base-layer VRF clear advances the batch.
      const oldBatchId = marketAccount.currentBatchId.toNumber();
      await baseProgram.methods
        .clearBatch()
        .accounts({
          cranker: authority.publicKey,
          market,
          orderBook,
          reveal,
          oracleQueue: new PublicKey("Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh"),
        } as any)
        .rpc();
      await waitFor(
        "base VRF callback",
        () => baseProgram.account.market.fetch(market),
        (value: any) => value.currentBatchId.toNumber() > oldBatchId,
        30,
        3_000
      );
    }

    await baseProgram.methods
      .delegateTraderAccount(market, ER_VALIDATOR)
      .accounts({ payer: authority.publicKey, traderAccount } as any)
      .rpc();
    await baseProgram.methods
      .delegateAccounts(marketAccount.baseMint, marketAccount.quoteMint, ER_VALIDATOR)
      .accounts({ payer: authority.publicKey, market, orderBook, reveal } as any)
      .rpc();

    await waitFor(
      "all accounts to route to the hosted ER",
      async () => Promise.all([market, orderBook, reveal, traderAccount].map((key) => router.getDelegationStatus(key))),
      (statuses) => statuses.every((status) => status.isDelegated)
    );

    const erMarketBeforeOrders: any = await erProgram.account.market.fetch(market);
    const openBatchIx = await erProgram.methods
      .clearBatch()
      .accounts({
        cranker: authority.publicKey,
        market,
        orderBook,
        reveal,
        oracleQueue: EPHEMERAL_VRF_QUEUE,
      } as any)
      .instruction();
    await sendThroughRouter(openBatchIx);
    await waitFor(
      "ER VRF callback to open a submit window",
      () => erProgram.account.market.fetch(market),
      (value: any) =>
        value.currentBatchId.toNumber() >
        erMarketBeforeOrders.currentBatchId.toNumber(),
      30,
      3_000
    );

    const buyIx = await erProgram.methods
      .submitOrder({ buy: {} }, new BN(110), new BN(10))
      .accounts({ trader: authority.publicKey, market, orderBook, traderAccount } as any)
      .instruction();
    await sendThroughRouter(buyIx);

    const sellIx = await erProgram.methods
      .submitOrder({ sell: {} }, new BN(90), new BN(5))
      .accounts({ trader: authority.publicKey, market, orderBook, traderAccount } as any)
      .instruction();
    await sendThroughRouter(sellIx);

    const erBook = await erProgram.account.orderBook.fetch(orderBook);
    assert.equal(erBook.orderCount, 2);

    const erMarket = await erProgram.account.market.fetch(market);
    await waitFor(
      "ER batch window",
      () => router.getSlot("confirmed"),
      (slot) => slot >= erMarket.batchOpenSlot.add(erMarket.batchPeriodSlots).toNumber(),
      90,
      1_000
    );

    const clearIx = await erProgram.methods
      .clearBatch()
      .accounts({
        cranker: authority.publicKey,
        market,
        orderBook,
        reveal,
        oracleQueue: EPHEMERAL_VRF_QUEUE,
      } as any)
      .remainingAccounts([{ pubkey: traderAccount, isWritable: true, isSigner: false }])
      .instruction();
    await sendThroughRouter(clearIx);

    const clearedReveal: any = await waitFor(
      "ephemeral VRF callback",
      () => erProgram.account.reveal.fetch(reveal),
      (value: any) => value.fillCount === 2,
      40,
      2_000
    );
    assert.equal(clearedReveal.matchedQty.toNumber(), 5);
    assert.equal(
      new Set(clearedReveal.fills.slice(0, 2).map((fill: any) => fill.price.toString())).size,
      1,
      "both sides must fill at one price"
    );

    const settledOnEr: any = await erProgram.account.traderAccount.fetch(traderAccount);
    assert.equal(settledOnEr.baseLocked.toNumber(), 0);
    assert.equal(settledOnEr.quoteLocked.toNumber(), 0);

    const commitIx = await erProgram.methods
      .commitAndUndelegate()
      .accounts({ payer: authority.publicKey, market, orderBook, reveal } as any)
      .remainingAccounts([{ pubkey: traderAccount, isWritable: true, isSigner: false }])
      .instruction();
    const schedulingSignature = await sendThroughRouter(commitIx);
    const commitmentSignature = await GetCommitmentSignature(schedulingSignature, router);

    assert.match(commitmentSignature, /^[1-9A-HJ-NP-Za-km-z]+$/);

    await waitFor(
      "MagicBlock undelegation status",
      async () =>
        Promise.all(
          [market, orderBook, reveal, traderAccount].map((key) =>
            router.getDelegationStatus(key)
          )
        ),
      (statuses) => statuses.every((status) => !status.isDelegated),
      50,
      2_000
    );
  });
});

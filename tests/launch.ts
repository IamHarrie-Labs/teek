// Plain local-validator tests for L1 custody and failure recovery. These do
// not prove Private ER confidentiality; launch.private.ts tests that live.
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import BN from "bn.js";
import { assert } from "chai";
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createMint, createAccount, mintTo, getAccount, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { LaunchClient, launchBidAddress, launchQuoteVault, units } from "../clients/launch";

describe("Tick Launch: L1 escrow", function () {
  this.timeout(120_000);
  const provider = AnchorProvider.env();
  const connection = new Connection(provider.connection.rpcEndpoint, "confirmed");
  const creator = (provider.wallet as Wallet).payer;
  const alice = Keypair.generate();
  const bob = Keypair.generate();
  const client = (key: Keypair) => new LaunchClient(connection,
    Object.assign(new Wallet(key), { signMessage: async () => { throw new Error("Not used by L1 tests"); } }));
  const owner = client(creator), a = client(alice), b = client(bob);
  let quote: PublicKey, sourceA: PublicKey, sourceB: PublicKey, launch: PublicKey;
  let opens: number, closes: number, deadline: number;

  async function now(): Promise<number> {
    const info = await connection.getAccountInfo(new PublicKey("SysvarC1ock11111111111111111111111111111111"), "confirmed");
    if (!info) throw new Error("Clock missing");
    return Number(info.data.readBigInt64LE(32));
  }
  async function waitUntil(time: number): Promise<void> {
    const stop = Date.now() + 70_000;
    while ((await now()) < time) {
      if (Date.now() > stop) throw new Error("Local validator clock did not advance");
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  async function rejects(action: Promise<unknown>, code: string): Promise<void> {
    try { await action; }
    catch (error: any) {
      const anchorCode = error.error?.errorCode?.code;
      if (anchorCode) assert.equal(anchorCode, code);
      else assert.include(String(error), code);
      return;
    }
    assert.fail(`Expected rejection: ${code}`);
  }
  async function balance(address: PublicKey): Promise<string> {
    return (await getAccount(connection, address)).amount.toString();
  }
  before(async () => {
    assert.match(connection.rpcEndpoint, /localhost|127\.0\.0\.1/, "Use an isolated local validator");
    for (const key of [creator, alice, bob]) {
      await connection.confirmTransaction(await connection.requestAirdrop(key.publicKey, LAMPORTS_PER_SOL), "confirmed");
    }
    quote = await createMint(connection, creator, creator.publicKey, null, 6);
    sourceA = await createAccount(connection, creator, quote, alice.publicKey);
    sourceB = await createAccount(connection, creator, quote, bob.publicKey);
    await mintTo(connection, creator, quote, sourceA, creator, 1_000);
    await mintTo(connection, creator, quote, sourceB, creator, 1_000);
    // No waiting for wall-clock guesses: every guard is compared with sysvar Clock.
    opens = (await now()) + 35; closes = opens + 4; deadline = closes + 4;
    launch = await owner.initialize("1", quote, { baseMint: Keypair.generate().publicKey,
      dbcConfig: Keypair.generate().publicKey, biddingOpensAt: opens, biddingClosesAt: closes,
      settlementDeadline: deadline, minRaise: "100", maxRaise: "200", minBid: "10",
      manifestHash: new Uint8Array(32) });
  });

  it("validates integer base units without losing u64 precision", () => {
    assert.equal(units("18446744073709551615").toString(), "18446744073709551615");
    assert.throws(() => units("18446744073709551616"), "u64");
    assert.throws(() => units("1.5"), "integer");
    assert.throws(() => units("-1"), "integer");
    assert.throws(() => units(9007199254740993 as any), "decimal string");
  });
  it("does not let the negative-test helper accept a successful action", async () => {
    let rejected = false;
    try { await rejects(Promise.resolve(), "MustReject"); }
    catch { rejected = true; }
    assert.isTrue(rejected, "A resolved action must fail a negative assertion");
  });
  it("refuses private operations without authentication instead of using L1", async () => {
    await rejects(a.edit(launch, "150"), "Private session missing or expired");
    await rejects(a.readOwnBid(launch), "Private session missing or expired");
  });
  it("registers funded bids, preserves escrow conservation and immutable terms", async () => {
    await a.register(launch, sourceA, "300");
    await b.register(launch, sourceB, "200");
    const state = await owner.base.account.launch.fetch(launch);
    assert.equal(state.bidCount, 2);
    assert.deepEqual(state.bids.slice(0, 2).map(x => x.toBase58()), [
      launchBidAddress(launch, alice.publicKey), launchBidAddress(launch, bob.publicKey),
    ].map(x => x.toBase58()));
    assert.equal(state.terms.maxRaise.toString(), "200");
    assert.equal(await balance(launchQuoteVault(launch)), "500");
    assert.equal(await balance(sourceA), "700");
    const bid = await a.base.account.launchBid.fetch(launchBidAddress(launch, alice.publicKey));
    assert.equal(bid.funded.toString(), "300");
    assert.equal(bid.amount.toString(), "0");
    assert.isFalse(bid.privacyReady);
  });
  it("allows top-up and withdrawal before bidding, rejects overdrafts atomically", async () => {
    await a.fund(launch, sourceA, "25");
    await a.withdraw(launch, sourceA, "50");
    await rejects(a.withdraw(launch, sourceA, "276"), "InsufficientFunding");
    assert.equal(await balance(sourceA), "725");
    assert.equal(await balance(launchQuoteVault(launch)), "475");
    assert.equal((await a.base.account.launchBid.fetch(launchBidAddress(launch, alice.publicKey))).funded.toString(), "275");
  });
  it("rejects duplicate registrations and deposits with the wrong mint", async () => {
    await rejects(a.register(launch, sourceA, "10"), "already in use");
    const wrongMint = await createMint(connection, creator, creator.publicKey, null, 6);
    const wrongSource = await createAccount(connection, creator, wrongMint, alice.publicKey);
    await rejects(a.fund(launch, wrongSource, "10"), "ConstraintTokenMint");
    assert.equal(await balance(launchQuoteVault(launch)), "475");
  });
  it("prevents another bidder from withdrawing Alice's funds", async () => {
    await rejects(b.base.methods.withdrawLaunchFunding(new BN(100)).accountsStrict({
      bidder: bob.publicKey, launch, bid: launchBidAddress(launch, alice.publicKey), destination: sourceB,
      quoteVault: launchQuoteVault(launch), tokenProgram: TOKEN_PROGRAM_ID,
    }).rpc(), "ConstraintSeeds");
    assert.equal(await balance(sourceB), "800");
  });
  it("refuses closing or expiring while their windows remain open", async () => {
    await rejects(owner.close(launch), "BiddingStillOpen");
    await rejects(owner.expire(launch), "SettlementNotExpired");
  });
  it("freezes funding at open and refuses confidential bid writes on L1", async () => {
    await waitUntil(opens);
    await rejects(a.fund(launch, sourceA, "1"), "FundingClosed");
    await rejects(a.withdraw(launch, sourceA, "1"), "FundingClosed");
    await rejects(a.base.methods.editLaunchBid(new BN(150)).accountsStrict({
      bidder: alice.publicKey, launch, bid: launchBidAddress(launch, alice.publicKey),
    }).rpc(), "PrivacyNotReady");
    assert.equal((await a.base.account.launchBid.fetch(launchBidAddress(launch, alice.publicKey))).amount.toString(), "0");
  });
  it("requires the complete bid registry and refunds a launch with no submitted bids", async () => {
    await waitUntil(closes);
    await rejects(owner.base.methods.closeLaunch().accountsStrict({ launch }).rpc(), "IncompleteBids");
    const aliceBid = launchBidAddress(launch, alice.publicKey);
    await rejects(owner.base.methods.closeLaunch().accountsStrict({ launch }).remainingAccounts([
      { pubkey: aliceBid, isWritable: false, isSigner: false },
      { pubkey: aliceBid, isWritable: false, isSigner: false },
    ]).rpc(), "InvalidBid");
    await owner.close(launch);
    const state = await owner.base.account.launch.fetch(launch);
    assert.property(state.status, "refunds");
    assert.equal(state.totalBid.toString(), "0");
    await a.withdraw(launch, sourceA, "275");
    await b.withdraw(launch, sourceB, "200");
    assert.equal(await balance(launchQuoteVault(launch)), "0");
    assert.equal(await balance(sourceA), "1000");
    assert.equal(await balance(sourceB), "1000");
    await rejects(a.withdraw(launch, sourceA, "1"), "InsufficientFunding");
  });
  it("opens permissionless refunds after a timeout without needing all bidders", async () => {
    const start = (await now()) + 10;
    const other = await owner.initialize("2", quote, { baseMint: Keypair.generate().publicKey,
      dbcConfig: Keypair.generate().publicKey, biddingOpensAt: start, biddingClosesAt: start + 2,
      settlementDeadline: start + 4, minRaise: "10", maxRaise: "200", minBid: "10",
      manifestHash: new Uint8Array(32) });
    await a.register(other, sourceA, "80");
    await waitUntil(start + 5);
    await b.expire(other); // Bob did not register in this launch.
    assert.property((await owner.base.account.launch.fetch(other)).status, "refunds");
    await a.withdraw(other, sourceA, "80");
    assert.equal(await balance(launchQuoteVault(other)), "0");
    assert.equal(await balance(sourceA), "1000");
  });
});

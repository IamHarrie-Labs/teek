// Opt-in devnet proof, AFTER the new binary has been independently reviewed
// and upgraded. Default runs never spend SOL or contact hosted Private ER.
import { AnchorProvider, Wallet, utils } from "@coral-xyz/anchor";
import { assert } from "chai";
import { Connection, Keypair, PublicKey, Transaction, SystemProgram } from "@solana/web3.js";
import { createMint, createAccount, mintTo, getAccount } from "@solana/spl-token";
import nacl from "tweetnacl";
import { mkdirSync, writeFileSync } from "fs";
import { LaunchClient, launchBidAddress, launchQuoteVault } from "../clients/launch";
import BN from "bn.js";
import { assertPrivateTransactionHidden } from "./helpers/private-transaction";

const live = process.env.RUN_TICK_PRIVATE === "1" ? describe : describe.skip;
live("Tick Launch: hosted two-wallet confidentiality", function () {
  this.timeout(480_000);
  let owner: LaunchClient, a: LaunchClient, b: LaunchClient;
  let launch: PublicKey, aliceBid: PublicKey, bobBid: PublicKey;
  let editSignature: string;
  let bobEditSignature: string;
  let closeAt: number;
  let sourceA: PublicKey, sourceB: PublicKey;
  const proof: Record<string, unknown> = { observations: [] };
  const record = (label: string, value: unknown) => {
    (proof.observations as unknown[]).push({ label, observedAt: new Date().toISOString(), value });
    writeFileSync("target/private-proof/hosted-results.json", JSON.stringify(proof, null, 2));
    if (proof.launch) writeFileSync(`target/private-proof/${proof.launch}-results.json`, JSON.stringify(proof, null, 2));
  };

  async function chainTime(connection: Connection): Promise<number> {
    const clock = await connection.getAccountInfo(new PublicKey("SysvarC1ock11111111111111111111111111111111"), "confirmed");
    if (!clock) throw new Error("Chain clock missing");
    return Number(clock.data.readBigInt64LE(32));
  }

  const makeWallet = (key: Keypair) => Object.assign(new Wallet(key), {
    signMessage: async (message: Uint8Array) => nacl.sign.detached(message, key.secretKey),
  });
  const wait = async (check: () => Promise<boolean>, label: string, timeout = 60_000) => {
    const end = Date.now() + timeout;
    while (!(await check())) {
      if (Date.now() >= end) throw new Error(`Timed out waiting for ${label}`);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  };
  // Return RPC envelopes without printing the URL/token or the secret payload.
  async function rpc(client: LaunchClient, method: string, params: unknown[]) {
    const response = await fetch(client.private.provider.connection.rpcEndpoint, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (response.status === 401 || response.status === 403) {
      return { error: { message: "access denied" } };
    }
    if (!response.ok) throw new Error(`Unexpected RPC HTTP status ${response.status}`);
    return response.json();
  }
  function assertHidden(envelope: any) {
    if (envelope.error) {
      assert.match(String(envelope.error.message), /permission|unauthori[sz]ed|forbidden|access denied/i,
        "Only explicit access denial counts as confidentiality");
    } else {
      const result = envelope.result && Object.prototype.hasOwnProperty.call(envelope.result, "value")
        ? envelope.result.value : envelope.result;
      assert.isNull(result, "Another bidder could read private data");
    }
  }
  async function readable(client: LaunchClient, address: PublicKey) {
    const result = await rpc(client, "getAccountInfo", [address.toBase58(), { encoding: "base64", commitment: "confirmed" }]);
    return !result.error && result.result?.value != null;
  }
  before(async () => {
    const envProvider = AnchorProvider.env();
    const provider = new AnchorProvider(new Connection(envProvider.connection.rpcEndpoint, "confirmed"),
      envProvider.wallet, { commitment: "confirmed", preflightCommitment: "confirmed" });
    assert.equal(await provider.connection.getGenesisHash(),
      "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG", "This harness uses Solana devnet only");
    const payer = (provider.wallet as Wallet).payer;
    const alice = Keypair.generate(), bob = Keypair.generate();
    owner = new LaunchClient(provider.connection, makeWallet(payer));
    a = new LaunchClient(provider.connection, makeWallet(alice));
    b = new LaunchClient(provider.connection, makeWallet(bob));
    // Retain disposable devnet identities for recovery if a hosted run fails.
    // target/ is ignored; no key material appears in output or proof artifacts.
    mkdirSync("target/private-proof", { recursive: true });
    for (const [name, key] of [["alice", alice], ["bob", bob]] as const) {
      writeFileSync(`target/private-proof/${name}-${Date.now()}-keypair.json`,
        JSON.stringify(Array.from(key.secretKey)), { mode: 0o600 });
    }
    await provider.sendAndConfirm(new Transaction().add(...[alice, bob].map(key => SystemProgram.transfer({
      fromPubkey: payer.publicKey, toPubkey: key.publicKey, lamports: 30_000_000,
    }))));
    const quote = await createMint(provider.connection, payer, payer.publicKey, null, 6);
    sourceA = await createAccount(provider.connection, payer, quote, alice.publicKey);
    sourceB = await createAccount(provider.connection, payer, quote, bob.publicKey);
    await mintTo(provider.connection, payer, quote, sourceA, payer, 1_000_000);
    await mintTo(provider.connection, payer, quote, sourceB, payer, 1_000_000);
    const opens = (await chainTime(provider.connection)) + 90;
    closeAt = opens + 60;
    launch = await owner.initialize(String(Date.now()), quote, { baseMint: Keypair.generate().publicKey,
      dbcConfig: Keypair.generate().publicKey, biddingOpensAt: opens,
      biddingClosesAt: closeAt, settlementDeadline: closeAt + 120,
      minRaise: "100000", maxRaise: "600000", minBid: "1000", manifestHash: new Uint8Array(32) });
    writeFileSync("target/private-proof/last-launch.json", JSON.stringify({ launch: launch.toBase58(),
      quoteMint: quote.toBase58(), alice: alice.publicKey.toBase58(), bob: bob.publicKey.toBase58(),
      sourceA: sourceA.toBase58(), sourceB: sourceB.toBase58(), opens, closeAt, settlementDeadline: closeAt + 120 }, null, 2));
    proof.launch = launch.toBase58(); proof.opens = opens; proof.closeAt = closeAt;
    console.log(`    Launch ${launch.toBase58()}: funding and delegation`);
    await a.register(launch, sourceA, "800000");
    await b.register(launch, sourceB, "700000");
    await a.delegate(launch); await b.delegate(launch);
    await a.authenticate(); await b.authenticate(); await owner.authenticate();
    aliceBid = launchBidAddress(launch, alice.publicKey);
    bobBid = launchBidAddress(launch, bob.publicKey);
    await wait(() => readable(a, aliceBid), "Alice's delegated account");
    await wait(() => readable(b, bobBid), "Bob's delegated account");
    await a.activate(launch); await b.activate(launch);
    console.log("    Private permissions activated; waiting for bidding opening");
    await wait(async () => (await chainTime(a.private.provider.connection)) >= opens, "bidding opening", 100_000);
    editSignature = await a.edit(launch, "321123");
    bobEditSignature = await b.edit(launch, "456234");
  });
  it("lets each bidder read and edit their own funded bid", async () => {
    assert.equal((await a.readOwnBid(launch)).amount.toString(), "321123");
    await a.edit(launch, "333111");
    assert.equal((await a.readOwnBid(launch)).amount.toString(), "333111");
    assert.equal((await b.readOwnBid(launch)).amount.toString(), "456234");
  });
  it("denies Bob and the creator access to Alice's bid", async () => {
    assert.isTrue(await readable(b, bobBid), "Bob's session must work before a denial counts");
    assert.isTrue(await readable(owner, launch), "Creator's session must work before a denial counts");
    for (const outsider of [b, owner]) {
      const result = await rpc(outsider, "getAccountInfo", [aliceBid.toBase58(), { encoding: "base64", commitment: "confirmed" }]);
      record(`Alice account read by ${outsider.wallet.publicKey.toBase58()}`, result);
      assertHidden(result);
    }
  });
  it("does not expose the secret instruction through transaction lookup", async () => {
    const params = [editSignature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 }];
    let aliceReceipt: any;
    await wait(async () => {
      const mine = await rpc(a, "getTransaction", params);
      aliceReceipt = mine.result;
      return !mine.error && mine.result != null;
    }, "owner-visible edit transaction");
    let bobReceipt: any;
    await wait(async () => {
      const mine = await rpc(b, "getTransaction", [bobEditSignature, params[1]]);
      bobReceipt = mine.result;
      return !mine.error && mine.result != null;
    }, "Bob's own visible edit transaction");
    const encoded = utils.bytes.bs58.encode(a.private.coder.instruction.encode("editLaunchBid", { amount: new BN("321123") }));
    assert.isTrue(aliceReceipt.transaction.message.instructions.some((ix: any) => ix.data === encoded),
      "Alice must read the actual secret edit instruction before outsider redaction counts");
    const encodedBob = utils.bytes.bs58.encode(b.private.coder.instruction.encode("editLaunchBid", { amount: new BN("456234") }));
    assert.isTrue(bobReceipt.transaction.message.instructions.some((ix: any) => ix.data === encodedBob),
      "Bob must read his own secret edit instruction before outsider redaction counts");
    record("Owner-visible edit instruction verified", { signature: editSignature, encodedInstructionMatched: true });
    record("Bob's own edit instruction verified", { signature: bobEditSignature, encodedInstructionMatched: true });
    const checkedAt = await chainTime(a.private.provider.connection);
    assert.isBelow(checkedAt, closeAt, "Check privacy while bidding is open");
    record("Private clock at transaction privacy check", checkedAt);
    const bobRead = await rpc(b, "getTransaction", params);
    const creatorRead = await rpc(owner, "getTransaction", params);
    record("Alice edit transaction read by Bob", bobRead);
    record("Alice edit transaction read by creator", creatorRead);
    assertPrivateTransactionHidden(bobRead, editSignature);
    assertPrivateTransactionHidden(creatorRead, editSignature);
  });
  it("publishes closed bids and sets the capped accepted total after commit", async () => {
    await wait(async () => (await chainTime(a.private.provider.connection)) >= closeAt + 2, "auction close", 70_000);
    await a.commit(launch); await b.commit(launch);
    await wait(async () => {
      const infos = await owner.connection.getMultipleAccountsInfo([aliceBid, bobBid], "confirmed");
      return infos.every(info => info?.owner.equals(owner.base.programId));
    }, "bids returning to L1");
    await owner.close(launch);
    const state = await owner.base.account.launch.fetch(launch);
    assert.property(state.status, "ready");
    assert.equal(state.totalBid.toString(), "789345");
    assert.equal(state.acceptedTotal.toString(), "600000");
    const returnedAlice = await owner.base.account.launchBid.fetch(aliceBid);
    const returnedBob = await owner.base.account.launchBid.fetch(bobBid);
    assert.equal(returnedAlice.amount.toString(), "333111");
    assert.equal(returnedAlice.funded.toString(), "800000");
    assert.equal(returnedBob.funded.toString(), "700000");
    assert.isTrue(returnedAlice.closed); assert.isTrue(returnedBob.closed);
    assert.isFalse(returnedAlice.privacyReady); assert.isFalse(returnedBob.privacyReady);
    record("L1 return verified", { totalBid: state.totalBid.toString(), acceptedTotal: state.acceptedTotal.toString(),
      aliceFunded: returnedAlice.funded.toString(), bobFunded: returnedBob.funded.toString(),
      bothClosed: returnedAlice.closed && returnedBob.closed, privacyClosed: !returnedAlice.privacyReady && !returnedBob.privacyReady });
  });
  it("recovers both deposits when the ready launch expires without settlement", async () => {
    await wait(async () => (await chainTime(owner.connection)) >= closeAt + 122, "settlement timeout", 140_000);
    await owner.expire(launch);
    await a.withdraw(launch, sourceA, "800000");
    await b.withdraw(launch, sourceB, "700000");
    assert.equal((await getAccount(owner.connection, sourceA)).amount.toString(), "1000000");
    assert.equal((await getAccount(owner.connection, sourceB)).amount.toString(), "1000000");
    assert.equal((await getAccount(owner.connection, launchQuoteVault(launch))).amount.toString(), "0");
    record("Expiry refunds verified", { aliceBalance: "1000000", bobBalance: "1000000", vaultBalance: "0" });
  });
});

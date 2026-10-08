import { AnchorProvider, Program, type Idl } from "@coral-xyz/anchor";
import BN from "bn.js";
import { Connection, PublicKey, SystemProgram, Transaction, ComputeBudgetProgram, TransactionMessage, VersionedTransaction, AddressLookupTableProgram,
  type AddressLookupTableAccount } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  getAuthToken, permissionPdaFromAccount, EPHEMERAL_VAULT_ID,
  MAGIC_CONTEXT_ID, MAGIC_PROGRAM_ID, PERMISSION_PROGRAM_ID,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import idl from "../teek/src/idl/teek.json";
import type { Teek } from "../teek/src/idl/teek";
import { deriveDbcPoolAddress, deriveDbcPoolAuthority, deriveDbcEventAuthority,
  deriveDbcTokenVaultAddress, deriveMintMetadata, DYNAMIC_BONDING_CURVE_PROGRAM_ID, METAPLEX_PROGRAM_ID } from "@meteora-ag/dynamic-bonding-curve-sdk";

export const PRIVATE_RPC = "https://devnet-tee.magicblock.app";
export const PRIVATE_VALIDATOR = new PublicKey("MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo");
export const LAUNCH_PROGRAM_ID = new PublicKey(idl.address);
export type LaunchWallet = AnchorProvider["wallet"] & {
  signMessage(message: Uint8Array): Promise<Uint8Array>;
};

/** Amounts are base units, never floating-point token amounts. */
export type Units = string | bigint | BN;
export function units(value: Units): BN {
  if (typeof value !== "string" && typeof value !== "bigint" && !BN.isBN(value)) {
    throw new Error("Use a decimal string, bigint or BN for integer base units");
  }
  const text = value.toString();
  if (!/^[0-9]+$/.test(text)) throw new Error("Expected a nonnegative integer in base units");
  const n = new BN(text);
  if (n.bitLength() > 64) throw new Error("Amount exceeds u64");
  return n;
}

export interface LaunchTermsInput {
  baseMint: PublicKey;
  dbcConfig: PublicKey;
  biddingOpensAt: number;
  biddingClosesAt: number;
  settlementDeadline: number;
  minRaise: Units;
  maxRaise: Units;
  minBid: Units;
  manifestHash: Uint8Array;
}

export function launchAddress(creator: PublicKey, id: Units): PublicKey {
  return PublicKey.findProgramAddressSync([
    Buffer.from("launch"), creator.toBuffer(), units(id).toArrayLike(Buffer, "le", 8),
  ], LAUNCH_PROGRAM_ID)[0];
}
export function launchBidAddress(launch: PublicKey, bidder: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([
    Buffer.from("launch_bid"), launch.toBuffer(), bidder.toBuffer(),
  ], LAUNCH_PROGRAM_ID)[0];
}
export function launchQuoteVault(launch: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("launch_quote"), launch.toBuffer()], LAUNCH_PROGRAM_ID)[0];
}
export function launchSettlement(launch: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("launch_settlement"), launch.toBuffer()], LAUNCH_PROGRAM_ID)[0];
}
export function launchToken(launch: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("launch_token"), launch.toBuffer()], LAUNCH_PROGRAM_ID)[0];
}
export function launchBaseVault(launch: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("launch_base"), launch.toBuffer()], LAUNCH_PROGRAM_ID)[0];
}
export const LAUNCH_ORACLE_QUEUE = new PublicKey("Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh");

/** L1 custody and authenticated Private ER bidding use separate providers.
 * There is deliberately no public-RPC fallback for bid writes or reads. */
export class LaunchClient {
  readonly base: Program<Teek>;
  private privateProgram?: Program<Teek>;
  private expiresAt = 0;
  private readonly lookupTables = new Map<string, AddressLookupTableAccount>();

  constructor(readonly connection: Connection, readonly wallet: LaunchWallet) {
    this.base = new Program(idl as Idl, new AnchorProvider(connection, wallet, {
      commitment: "confirmed", preflightCommitment: "confirmed",
    })) as unknown as Program<Teek>;
  }

  async authenticate(): Promise<void> {
    this.privateProgram = undefined;
    this.expiresAt = 0;
    const { token, expiresAt } = await getAuthToken(PRIVATE_RPC, this.wallet.publicKey,
      message => this.wallet.signMessage(message));
    const endpoint = new URL(PRIVATE_RPC);
    endpoint.searchParams.set("token", token);
    const response = await fetch(endpoint.toString(), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getIdentity", params: [] }),
    });
    const identity = await response.json();
    if (!response.ok || identity.error || identity.result?.identity !== PRIVATE_VALIDATOR.toBase58()) {
      throw new Error("Private ER validator identity did not match the pinned launch validator");
    }
    const privateConnection = new Connection(endpoint.toString(), {
      commitment: "confirmed", disableRetryOnRateLimit: true,
    });
    this.privateProgram = new Program(idl as Idl, new AnchorProvider(privateConnection, this.wallet, {
      commitment: "confirmed", preflightCommitment: "confirmed",
    })) as unknown as Program<Teek>;
    // Auth deployments may return Unix seconds or JavaScript milliseconds.
    this.expiresAt = expiresAt < 1e12 ? expiresAt * 1000 : expiresAt;
    if (!Number.isFinite(this.expiresAt) || this.expiresAt <= Date.now()) {
      this.privateProgram = undefined;
      throw new Error("Private RPC returned an invalid session expiry");
    }
  }

  /** Exposes the authenticated program to the privacy verification harness.
   * Never log its connection URL: it contains the session token. */
  get private(): Program<Teek> {
    if (!this.privateProgram || Date.now() >= this.expiresAt) {
      throw new Error("Private session missing or expired; authenticate again");
    }
    return this.privateProgram;
  }

  async initialize(id: Units, quoteMint: PublicKey, terms: LaunchTermsInput): Promise<PublicKey> {
    if (terms.manifestHash.length !== 32) throw new Error("Manifest hash must contain 32 bytes");
    for (const time of [terms.biddingOpensAt, terms.biddingClosesAt, terms.settlementDeadline]) {
      if (!Number.isSafeInteger(time) || time < 0) throw new Error("Expected a Unix timestamp in whole seconds");
    }
    const launch = launchAddress(this.wallet.publicKey, id);
    await this.base.methods.initializeLaunch(units(id), {
      ...terms, biddingOpensAt: new BN(terms.biddingOpensAt),
      biddingClosesAt: new BN(terms.biddingClosesAt), settlementDeadline: new BN(terms.settlementDeadline),
      minRaise: units(terms.minRaise), maxRaise: units(terms.maxRaise), minBid: units(terms.minBid),
      manifestHash: Array.from(terms.manifestHash),
    }).accountsStrict({ creator: this.wallet.publicKey, quoteMint, launch,
      quoteVault: launchQuoteVault(launch), tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId }).rpc();
    return launch;
  }

  async register(launch: PublicKey, source: PublicKey, amount: Units): Promise<string> {
    return this.base.methods.registerLaunchBid(units(amount)).accountsStrict({
      bidder: this.wallet.publicKey, launch, settlement: launchSettlement(launch), bid: launchBidAddress(launch, this.wallet.publicKey),
      source, quoteVault: launchQuoteVault(launch), tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    }).rpc();
  }

  async fund(launch: PublicKey, source: PublicKey, amount: Units): Promise<string> {
    return this.base.methods.fundLaunchBid(units(amount)).accountsStrict({
      bidder: this.wallet.publicKey, launch, settlement: launchSettlement(launch), bid: launchBidAddress(launch, this.wallet.publicKey),
      source, quoteVault: launchQuoteVault(launch), tokenProgram: TOKEN_PROGRAM_ID,
    }).rpc();
  }

  async withdraw(launch: PublicKey, destination: PublicKey, amount: Units): Promise<string> {
    return this.base.methods.withdrawLaunchFunding(units(amount)).accountsStrict({
      bidder: this.wallet.publicKey, launch, bid: launchBidAddress(launch, this.wallet.publicKey),
      destination, quoteVault: launchQuoteVault(launch), tokenProgram: TOKEN_PROGRAM_ID,
    }).rpc();
  }

  async delegate(launch: PublicKey): Promise<string> {
    return this.base.methods.delegateLaunchBid().accountsPartial({
      payer: this.wallet.publicKey, launch, bid: launchBidAddress(launch, this.wallet.publicKey),
    }).rpc();
  }

  async activate(launch: PublicKey): Promise<string> {
    const bid = launchBidAddress(launch, this.wallet.publicKey);
    return this.private.methods.activatePrivateLaunchBid().accountsStrict({
      bidder: this.wallet.publicKey, launch, bid, permission: permissionPdaFromAccount(bid),
      ephemeralVault: EPHEMERAL_VAULT_ID, magicProgram: MAGIC_PROGRAM_ID,
      permissionProgram: PERMISSION_PROGRAM_ID,
    }).rpc();
  }

  async edit(launch: PublicKey, amount: Units): Promise<string> {
    return this.private.methods.editLaunchBid(units(amount)).accountsStrict({
      bidder: this.wallet.publicKey, launch, bid: launchBidAddress(launch, this.wallet.publicKey),
    }).rpc();
  }

  async readOwnBid(launch: PublicKey) {
    return this.private.account.launchBid.fetch(launchBidAddress(launch, this.wallet.publicKey));
  }

  async commit(launch: PublicKey, bidder = this.wallet.publicKey): Promise<string> {
    const bid = launchBidAddress(launch, bidder);
    return this.commitBid(launch, bid);
  }

  async commitBid(launch: PublicKey, bid: PublicKey): Promise<string> {
    return this.private.methods.commitLaunchBid().accountsStrict({
      payer: this.wallet.publicKey, launch, bid, permission: permissionPdaFromAccount(bid),
      ephemeralVault: EPHEMERAL_VAULT_ID, permissionProgram: PERMISSION_PROGRAM_ID,
      magicProgram: MAGIC_PROGRAM_ID, magicContext: MAGIC_CONTEXT_ID,
    }).rpc();
  }

  async close(launch: PublicKey): Promise<string> {
    const account = await this.base.account.launch.fetch(launch);
    return this.base.methods.closeLaunch().accountsStrict({ launch }).remainingAccounts(
      account.bids.slice(0, account.bidCount).map(pubkey => ({ pubkey, isSigner: false, isWritable: false })),
    ).rpc();
  }

  async expire(launch: PublicKey): Promise<string> {
    return this.base.methods.expireLaunch().accountsStrict({ launch }).rpc();
  }
  async cancel(launch: PublicKey): Promise<string> {
    return this.base.methods.cancelLaunch().accountsStrict({ creator: this.wallet.publicKey, launch }).rpc();
  }

  /** Bind complete on-chain config bytes and the minimum output before any bid
   * can register. Creation and binding are sent atomically. */
  async initializeVenue(id: Units, quoteMint: PublicKey, terms: Omit<LaunchTermsInput, "baseMint">,
    minimumTokensAtCap: Units, metadata: { name: string; symbol: string; uri: string }): Promise<PublicKey> {
    const launch = launchAddress(this.wallet.publicKey, id);
    const fullTerms = { ...terms, baseMint: launchToken(launch),
      biddingOpensAt: new BN(terms.biddingOpensAt), biddingClosesAt: new BN(terms.biddingClosesAt),
      settlementDeadline: new BN(terms.settlementDeadline), minRaise: units(terms.minRaise),
      maxRaise: units(terms.maxRaise), minBid: units(terms.minBid), manifestHash: Array.from(terms.manifestHash) };
    for (const time of [terms.biddingOpensAt, terms.biddingClosesAt, terms.settlementDeadline]) {
      if (!Number.isSafeInteger(time) || time < 0) throw new Error("Expected whole-second Unix timestamps");
    }
    if (terms.manifestHash.length !== 32) throw new Error("Manifest hash must contain 32 bytes");
    const initialize = await this.base.methods.initializeLaunch(units(id), fullTerms).accountsStrict({
      creator: this.wallet.publicKey, quoteMint, launch, quoteVault: launchQuoteVault(launch),
      tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId }).instruction();
    const configure = await this.base.methods.configureLaunchSettlement(units(minimumTokensAtCap), metadata).accountsStrict({
      creator: this.wallet.publicKey, launch, settlement: launchSettlement(launch), dbcConfig: terms.dbcConfig,
      systemProgram: SystemProgram.programId }).instruction();
    await (this.base.provider as AnchorProvider).sendAndConfirm(new Transaction().add(initialize, configure));
    return launch;
  }

  private async registered(launch: PublicKey) {
    const state = await this.base.account.launch.fetch(launch);
    return state.bids.slice(0, state.bidCount).map(pubkey => ({ pubkey, isSigner: false, isWritable: false }));
  }

  async requestRandomness(launch: PublicKey, lookupTables: AddressLookupTableAccount[] = []): Promise<string> {
    const ix = await this.base.methods.requestLaunchRandomness().accountsPartial({ payer: this.wallet.publicKey,
      launch, settlement: launchSettlement(launch), oracleQueue: LAUNCH_ORACLE_QUEUE })
      .remainingAccounts(await this.registered(launch)).instruction();
    return this.sendVenueInstruction(ix, await this.venueLookups(launch, lookupTables));
  }

  async settle(launch: PublicKey, lookupTables: AddressLookupTableAccount[] = []): Promise<string> {
    const state = await this.base.account.launch.fetch(launch);
    const pool = deriveDbcPoolAddress(state.quoteMint, state.terms.baseMint, state.terms.dbcConfig);
    const ix = await this.base.methods.settleLaunch().accountsStrict({ payer: this.wallet.publicKey,
      launch, settlement: launchSettlement(launch), quoteVault: launchQuoteVault(launch), quoteMint: state.quoteMint,
      baseMint: state.terms.baseMint, allocationVault: launchBaseVault(launch), dbcConfig: state.terms.dbcConfig, pool,
      dbcBaseVault: deriveDbcTokenVaultAddress(pool, state.terms.baseMint),
      dbcQuoteVault: deriveDbcTokenVaultAddress(pool, state.quoteMint), poolAuthority: deriveDbcPoolAuthority(),
      dbcEventAuthority: deriveDbcEventAuthority(), mintMetadata: deriveMintMetadata(state.terms.baseMint),
      metadataProgram: METAPLEX_PROGRAM_ID, creator: state.creator, dbcProgram: DYNAMIC_BONDING_CURVE_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId })
      .remainingAccounts(await this.registered(launch)).instruction();
    return this.sendVenueInstruction(ix, await this.venueLookups(launch, lookupTables));
  }

  /** Full-capacity auctions use an ALT for the canonical bid registry. */
  private async venueLookups(launch: PublicKey, supplied: AddressLookupTableAccount[]): Promise<AddressLookupTableAccount[]> {
    if (supplied.length) return supplied;
    const bids = await this.registered(launch);
    if (bids.length <= 8) return [];
    const cached = this.lookupTables.get(launch.toBase58());
    if (cached) return [cached];
    const [create, address] = AddressLookupTableProgram.createLookupTable({ authority: this.wallet.publicKey,
      payer: this.wallet.publicKey, recentSlot: await this.connection.getSlot("finalized") });
    const provider = this.base.provider as AnchorProvider;
    await provider.sendAndConfirm(new Transaction().add(create));
    for (let i = 0; i < bids.length; i += 12) {
      await provider.sendAndConfirm(new Transaction().add(AddressLookupTableProgram.extendLookupTable({
        authority: this.wallet.publicKey, payer: this.wallet.publicKey, lookupTable: address,
        addresses: bids.slice(i, i + 12).map(x => x.pubkey) })));
    }
    const end = Date.now() + 30_000;
    while (Date.now() < end) {
      const table = (await this.connection.getAddressLookupTable(address)).value;
      if (table && table.state.addresses.length === bids.length
        && BigInt(await this.connection.getSlot("confirmed")) > table.state.lastExtendedSlot) {
        this.lookupTables.set(launch.toBase58(), table); return [table];
      }
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    throw new Error("Lookup table activation timed out; retry before settlement deadline");
  }

  private async sendVenueInstruction(ix: import("@solana/web3.js").TransactionInstruction,
    lookupTables: AddressLookupTableAccount[]): Promise<string> {
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash("confirmed");
    const message = new TransactionMessage({ payerKey: this.wallet.publicKey, recentBlockhash: blockhash,
      instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 650_000 }), ix] }).compileToV0Message(lookupTables);
    const transaction = await this.wallet.signTransaction(new VersionedTransaction(message));
    const signature = await this.connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false,
      preflightCommitment: "confirmed", maxRetries: 20 });
    const result = await this.connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
    if (result.value.err) throw new Error(`Venue instruction failed: ${JSON.stringify(result.value.err)}`);
    return signature;
  }

  async claim(launch: PublicKey, quoteDestination: PublicKey, baseDestination: PublicKey): Promise<string> {
    return this.base.methods.claimLaunchAllocation().accountsStrict({ bidder: this.wallet.publicKey, launch,
      settlement: launchSettlement(launch), bid: launchBidAddress(launch, this.wallet.publicKey),
      quoteVault: launchQuoteVault(launch), allocationVault: launchBaseVault(launch),
      quoteDestination, baseDestination, tokenProgram: TOKEN_PROGRAM_ID }).rpc();
  }
}

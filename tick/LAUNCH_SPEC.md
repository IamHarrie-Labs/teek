# Tick Launch — v1 spec

**Promise:** Bid privately. Everyone pays one price. Funds move only under the launch terms you accepted.

Tick is the fair-entry layer for Meteora DBC launches: a sealed, pro-rata opening purchase of the bonding curve, executed in the same transaction that creates the pool. Meteora's Alpha Vault (the closest existing tool) lists DLMM / DAMM v1 / DAMM v2 support, not DBC.

## Mechanism

1. **Terms (immutable at initialization).** Creator publishes: token metadata; the DBC config (curve, supply split, migration threshold, fee shares, vesting); funding cutoff; bidding window; settlement deadline; **min raise**; **max raise (cap)**; min bid size. Because the curve and cap are fixed, the worst-case average price is known before anyone bids. Settlement must validate the actual DBC config; a published manifest hash alone is not validation.
2. **Funding then bidding (MagicBlock Private ER).** Register and fund public L1 escrow **before bidding opens**. Top-ups and withdrawals stop at opening; delegation also locks the bidder's funding record. The token vault stays on L1. After activating bidder-only permissions on the pinned Private ER, bidders place or edit a sealed bid ≤ their funded balance until close, or cancel by setting it to zero. v1 bids are amounts only; limit-price bids and deposits during bidding are v2.
3. **Close.** Bids commit back from the ER.
   - Total < min raise → refund mode: every deposit claimable in full, no pool is created.
   - Otherwise: `accepted_i = pro_rata_dependent_round(bids, min(total, cap))`, `refund_i = funded_i − accepted_i`.
4. **Settle (one transaction, atomic).** `[compute budget, Tick settle]`. Tick CPIs DBC initialization using its mint/launch PDAs, swaps `Σ accepted` from quote escrow into the allocation vault, allocates actual output, and transfers native creator rights back to the immutable creator. The output floor is checked; any failure rolls back creation and spending. Winners share one average opening purchase, subject to indivisible-unit rounding.
5. **Claims.** Winners claim tokens; everyone claims refunds.
6. **After.** Public trading continues on the DBC curve; DBC migrates the quote reserve to DAMM v2 at the threshold (enforced by Meteora, not Tick).

## Funding and supply

- **Tokens:** minted by DBC at pool creation per the config. The auction buys from the curve, so there is no separate creator tranche.
- **Proceeds:** accepted quote pays native curve fees; the remaining quote reserve is liquidity and counts toward migration. Creator and partner income follow the fixed DBC fee and LP terms. Tick does not promise that every accepted quote unit becomes reserve.
- **Failure:** if settle fails, deposits stay in escrow and settle is retryable; at the settlement deadline, anyone can switch the launch to refund mode. A delegated bid record must return to L1 before its deposit can be withdrawn. This recovery still depends on the ER's commit/undelegation service being available.

## Privacy model (state this honestly in the demo)

Funding the escrow is a public L1 transfer, so funded amounts, registered wallets and an upper bound on demand are visible. Chosen bid amounts are confidential during bidding on the tested hosted account and transaction lookup surfaces. Each bidder is a reader of their own account; the creator is not a reader. Bidders cannot change the permission membership. Removing permissions after close makes both final bids and earlier edit transactions public. During bidding, outsider transaction receipts retain public signature, timing and success while redacting instructions, keys, balances, logs and return data. Authorized own-account and actual encoded-instruction reads serve as controls. Broad RPC enumeration, subscriptions and TEE attestation still require verification. No fallback to the public ER is advertised as private.

## DBC config rules

- Flat base fee (fee scheduler with `startingFeeBps == endingFeeBps`, zero periods); no dynamic fee; `enableFirstSwapWithMinFee: false`. The sealed opening replaces the anti-sniper fee schedule, and the min-fee first-swap check inspects top-level instructions, which a CPI swap is not.
- No activation delay. Migration option `MET_DAMM_V2` (DAMM v1 and the rate limiter are deprecated for new configs).

## Verified on Day 1

- DBC program `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN` is live on devnet; SDK `@meteora-ag/dynamic-bonding-curve-sdk` 1.5.13.
- Atomic pool creation + first buy in one devnet transaction (`5ZEqA9BZ5iGSDCoYCkzBdzkqxcr9MqZg8wMGWRVcF4G918n9jArZc71vaMpVj1AB6unKzYpvBnRXYb6UQuvdsg4k`), flat-fee config accepted, tokens delivered to a receiver other than the buyer. 7 instructions, 19 accounts, ~953 bytes, 172,485 CU.
- `swap` takes any signer as `payer` (no whitelist), so a PDA can pay via `invoke_signed`.
- Fair allocation: integer (u128) dependent rounding replaces f64 largest-remainder in `clearing.rs` and `engine/clearing.ts`. Adversarial tests compare split/unsplit expected fills over seeds, bound token-scale rounding, and check Rust/TypeScript parity. **Production caveat:** the current helper uses a 32-bit seeded PRNG and `% total` sampling; tests are empirical evidence, not a proof of an exactly uniform draw. Launch settlement needs a full-entropy VRF-derived sampler with rejection sampling before claiming exact expected fairness.

## Implemented after Day 1

- Separate `Launch` and `LaunchBid` accounts, with 24 registered bidders per launch for this prototype.
- PDA-controlled SPL quote escrow; registration, funding and withdrawals with checked arithmetic and mint/authority checks.
- Pinned Private ER delegation; permission creation before any nonzero bid; bidder-only access without permission-management authority; editable/cancellable funded bids.
- Bid commit/undelegation after close; complete registry validation; min-raise failure and settlement-timeout refund paths.
- Typed client separating L1 custody from authenticated Private ER reads/writes, plus local custody tests and an opt-in two-wallet hosted proof.
- Independent review corrected the missing undelegation callback and test weaknesses. The intake milestone is deployed on devnet. The subsequent settlement milestone implements complete config binding, a one-shot full-entropy scoped VRF request, atomic DBC creation/purchase, conserved claims, cancellation/refunds and the launch UI. Deployment/demo status is recorded separately in evidence files.

## Open risks, in order

1. Atomic PDA initialization/swap/creator transfer passed against actual mainnet DBC and Metaplex binaries with synthetic quote liquidity in an isolated validator.
2. Full 24-bid settlement passed using v0 and an address lookup table; the client creates registry lookup tables for larger launches.
3. Full-capacity settlement measured 385,964 CU under size optimization; client requests 650,000 CU.
4. Broaden privacy validation beyond tested hosted account/transaction lookups to enumeration, subscriptions and TEE attestation. The independent development review is complete; it is not a formal audit.
5. Bid records must be back on L1 before close/settle (commit + undelegate after close); the custody vault is never delegated.
6. Launch settlement uses a separate full-entropy sampler with rejection sampling. Legacy market sampling remains a prototype limitation.

The authoritative implementation details and remaining limits are in [SETTLEMENT_SPEC.md](SETTLEMENT_SPEC.md). v1 uses sealed budget bids on a fixed curve, not limit-price price discovery. Creator cancellation is an emergency refund veto; delegated refunds still need ER return.

## Demo

Two launches: A clears and opens trading; B misses its min raise and refunds everyone. Show a bidder failing to read another bid, and a bot that cannot trade before the opening purchase.

## Out of scope for this event

Limit-price bids, Panta, tokenized stocks, an SDK beyond a typed client, mainnet (decide separately: Solami requires it), and the sealed opening-session batches (stretch only).

# Teek Launch settlement

Teek v1 combines sealed budget bids with one pooled opening purchase on a
fixed Meteora DBC curve. It does **not** discover a clearing price from limit
orders: bidders specify quote amounts, and the configured curve determines
the shared average purchase price. Limit-price discovery is future scope.

## Immutable contract

Create `Launch` and `SettlementState` in the same transaction. The base mint
is a Teek PDA, not a creator-held key. The sidecar binds SHA256 of the complete
1048-byte DBC config, token metadata, and a positive minimum output at the
raise cap. Configuration precedes any registration. Planned-mint registration
and top-up reject without the canonical phase-0 sidecar. Legacy placeholder
intake accounts retain their refund paths but cannot become venues.

Supported config: standard SPL base and quote, base decimals 6–9, DAMM v2
migration, immutable token metadata/authorities, flat linear base fees, no
dynamic fee, and no top-level first-swap-min-fee inspection. The cap cannot
exceed the configured migration quote threshold. Full config bytes are checked
again at settlement. Program IDs and the CPI ABI are pinned to the official
DBC SDK 1.5.13; the integration suite checks offsets and discriminators.

## Lifecycle and custody

1. Fund a canonical bid in the L1 quote vault before opening. Funding and
   registered wallets are public; this prototype has 24 slots and no Sybil
   resistance. Once delegated, funding is locked.
2. Authenticate to the pinned hosted Private ER. Activate bidder-only read
   permission before any nonzero edit. Edit or zero the bid until close.
3. Return bids to L1 and close using the complete ordered registry. Below the
   minimum raise, the launch enters full-refund mode and creates no pool.
4. Request randomness once, on the fixed L1 oracle queue. Validate every bid
   before issuing the request. Hash ordered bid accounts, bidder identities,
   funded and chosen amounts, terms, config, metadata, creator and launch.
   The scoped oracle callback must carry the same commitment.
5. One Teek instruction CPIs DBC initialization (signed Teek mint and launch
   PDAs), creates the allocation vault, spends exactly the capped accepted
   quote amount on the first swap, and transfers DBC creator rights back to
   the immutable creator. There is no pool before this transaction. Every
   operation rolls back if any CPI or output/conservation check fails.
6. Each registered bidder claims their stored token allocation and unused
   funding into token accounts they own. A permanent bitmap prevents replay.
   Public DBC trading and native DAMM v2 migration proceed independently.

Accepted quote pays the curve's native trading fees; the remaining reserve
counts toward migration. It is inaccurate to say every accepted unit becomes
liquidity. Creator/partner fee and LP rights follow the accepted config.

## Rounding and invariants

All value arithmetic uses integer base units and checked u64/u128 operations.
Acceptance and base-token distribution use separate domain-separated SHA256
expansions of all 32 VRF bytes and the snapshot commitment. Uniform offsets
are drawn with 128-bit rejection sampling; exhaustion fails closed.
Systematic dependent rounding preserves exact totals and floor/ceil marginal
allocations. Under uniform offsets, expectation is proportional to quantity;
splitting can change variance and consume registration slots. Finite VRF
seeds provide computational randomness, not exact rational probabilities.

- `accepted_total = min(sum(bids), cap)`; `sum(accepted_i) = accepted_total`.
- `0 <= accepted_i <= bid_i <= funded_i`.
- `refund_i = funded_i - accepted_i`.
- `sum(tokens_i) = actual_base_received`.
- `quote_before - quote_after = accepted_total`.
- `min_output = ceil(min_tokens_at_cap * accepted_total / cap)`.
- Claims cannot exceed stored liabilities or replay. Vaults stay PDA-owned.

The old market's 32-bit prototype sampler is not used for launch settlement.

## Recovery and authority

A failed settlement can retry against the same sealed seed and terms. After
the deadline, anyone may expire the launch into full-refund mode. The creator
can also cancel an unsettled launch permanently: this emergency stop cannot
withdraw user funds, resume the auction, or affect settled claims. It does
give the creator a veto, including after randomness disclosure. Cancellation
allows early ER return; refunds still depend on confirmed undelegation.

The existing single-wallet devnet upgrade authority remains in place. Mainnet
requires a separate decision, external audit, custody/upgrade multisig policy,
and an outage recovery plan. No mainnet writes are part of this milestone.

## Verification boundaries

`npm run test:settlement` runs isolated WSL validators with actual mainnet
DBC/Metaplex binaries and synthetic SPL quote liquidity. Closed private bids
are explicitly injected genesis fixtures. The scoped local oracle is a
controlled fixture, **not** a production VRF proof. Actual hosted privacy and
VRF are tested separately by `scripts/launch-demo.mjs`.

The suite exercises two and 24 bidders, maximum metadata, pre-funded empty
mint/allocation PDAs, real config creation and CPI settlement, output-failure
rollback, creator transfer, mint-authority revocation, conserved claims,
duplicate request/callback/settlement/claim rejection, and cancellation/refunds.
Source review is independent development review, not a formal audit. Surfpool,
Solana Fender and QEDGen are unavailable in this environment; no formal proof
or third-party audit is claimed. Existing-pool/mainnet trading is not tested.

Privacy covers tested bidding-window account/transaction reads. Public funding,
wallet count and timing remain visible. Closing permissions reveals final bids
and earlier edits. Enumeration, subscriptions, TEE attestation and service
outage recovery still need broader verification.

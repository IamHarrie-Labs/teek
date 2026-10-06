# Private launch bids: implementation and verification

This guide documents the private-intake milestone. The subsequent settlement
and launch UI implementation is described in [SETTLEMENT_SPEC.md](SETTLEMENT_SPEC.md).
Its verification and deployment evidence are separate; intake tests alone do
not prove DBC settlement or production launch allocation.

## Account and custody model

`Launch` stores immutable terms, registered bid addresses and the phase. `LaunchBid` stores one wallet's public funded balance and chosen private amount. A launch is limited to 24 bidders in this prototype. This is not an identity or Sybil-resistance system.

The SPL quote vault belongs to the Launch PDA and stays on L1. Funding is public and closes at bidding opening. Delegating a bidder's record locks further funding changes for that bidder even before opening. Bids may be edited or cancelled during bidding, bounded by escrowed funding.

`activate_private_launch_bid` creates a private ephemeral permission with the bid PDA as signer/payer before setting `privacy_ready`. Only the bidder is a member; its flags allow reads, transaction messages, logs and balances but exclude permission-management authority. Bid amounts are not emitted in logs/events. The account is pinned to the hosted TEE validator `MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo`.

After the close time, the permission is removed and the bid is committed/undelegated. **Closed bids and earlier edit transactions become public.** The live diagnostic confirmed disclosure of both the final edit and an earlier edit after permissions closed. Close must receive every registered bid exactly once, in registry order, with Tick ownership restored. Below-minimum demand enters `Refunds`; otherwise `Ready` records the capped total, awaiting DBC settlement. Never-delegated records have zero demand. A permissionless expiry switches any unsettled launch to refunds at its deadline. Owners withdraw only their credited deposit, to an account they own with the correct mint.

Refund mode does not bypass delegation: an ER outage can delay access to a delegated record. No guaranteed withdrawal during a total ER outage is claimed.

## Build and local tests

From WSL in the repository:

```bash
cd programs/tick
cargo build-sbf --tools-version v1.57
cd ../..
anchor idl build -o target/idl/tick.json -t target/types/tick.ts
cp target/idl/tick.json tick/src/idl/tick.json
cp target/types/tick.ts tick/src/idl/tick.ts
cargo test -p tick --lib
```

On this machine the direct Anchor binary is `/home/harrie/.avm/bin/anchor-1.2.0` if the shim fails on the workspace path containing spaces.

Start an isolated local validator (do not reuse a ledger containing another version of Tick):

```bash
solana-test-validator --ledger target/launch-test-ledger --rpc-port 8899 --faucet-port 9900 \
  --bpf-program B6eqSCBhokuZLKqBrzwhquUho183P3Fvu8pgC4a9PFkY target/deploy/tick.so --quiet
```

Then from Windows or WSL, using Node 22 or newer:

```bash
npm run test:launch -- --with-market
npm run typecheck
```

The test runner compiles TypeScript, generates/funds a disposable local wallet, runs custody tests and deletes its wallet file. It accepts only loopback RPC addresses. `--with-market` also checks the original local market. It forcibly disables hosted tests, even if `RUN_TICK_PRIVATE` was set in the shell.

## Hosted privacy proof

The independent security review and devnet upgrade are complete. The final hosted run passes all five checks. The live harness spends devnet SOL, creates synthetic test mints and delegates bids. It verifies the full devnet genesis hash before funding. It does not use mainnet or real quote assets. See `PRIVATE_BID_REVIEW.md` for the upgrade receipt and [saved public/synthetic evidence](evidence/private-bids-devnet-2026-10-05.json).

```bash
ANCHOR_WALLET=~/.config/solana/id.json npm run test:launch-private
```

The five checks cover:

1. Each bidder reads and edits their own funded bid.
2. Bob and the creator cannot read Alice's account, with working authorized account reads as controls.
3. Both bidders retrieve their own actual encoded edit instructions. Outsider transaction lookup contains no private instructions, keys, balances, logs or return data. The runtime returns a redacted receipt rather than `null`: signature, slot, timing and success remain public. Checks run before close.
4. Commit/undelegation restores Tick ownership, preserves both funded balances, clears privacy flags, and publishes the correct total and cap on L1.
5. Settlement timeout permits full deposit refunds; both source balances are restored and escrow is empty.

`tests/helpers/private-transaction.ts` accepts the observed redaction shape and fails on unknown fields, including outer-envelope and error payloads. Seven regression tests reject intentional leak examples. Network errors, missing transactions before an owner-visible control, and unrelated RPC errors do not count as privacy.

The harness writes public/synthetic evidence to ignored `target/private-proof/*-results.json`; session URLs and secret keys never appear in the evidence. Disposable identities are retained separately in ignored keypair files for recovery if a test fails.

The harness does not yet test websocket notifications, broad history/account enumeration or host/TEE attestation. Those remain review items before a production confidentiality claim. The client verifies the RPC validator identity; that is not a cryptographic attestation of its execution environment.

## Client

`clients/launch.ts` uses integer base units (`BN`, decimal string or bigint), one public provider for escrow, and an authenticated Private ER provider for bid operations. It refuses missing/expired private sessions and provides no public-RPC fallback. Treat session-bearing connection URLs as credentials; do not log them.

SDK references used during implementation:

- https://github.com/magicblock-labs/magicblock-engine-examples/tree/main/sealed-auction/anchor
- https://docs.magicblock.gg/pages/private-ephemeral-rollups-pers/how-to-guide/quickstart
- Installed `ephemeral-rollups-sdk` 0.17 access-control CPI definitions.

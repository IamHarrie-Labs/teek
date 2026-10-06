# Tick

Tick Launch is a private, pooled opening purchase for Meteora DBC on Solana.
The original batch-market demo remains available at `/market.html`.

The existing demo compares a continuous order book with uniform-price batches running on MagicBlock Ephemeral Rollups and MagicBlock VRF. Its hosted ER orders are public: the batch window closes, but this deployment does not provide confidential bids.

The launch module includes immutable DBC config binding, public quote escrow,
private budget bids, full-entropy VRF rounding, atomic pool creation and first
purchase, creator-rights transfer, token/refund claims and cancellation. The
new default frontend reads venue state and signs real devnet transactions.
Funding/timing are public; closing reveals bids and earlier edits. v1 shares
one purchase on a fixed curve; it is not limit-price price discovery.
See [settlement specification](tick/SETTLEMENT_SPEC.md),
[independent development review](tick/SETTLEMENT_REVIEW.md) and
[privacy validation](tick/PRIVATE_BIDS.md).

## Launch UI and hosted demo

The complete launch path is deployed and verified on devnet as of October 6,
2026. Both real hosted demos passed: one opening purchase with all claims,
and one failed minimum raise with full refunds and no pool. See the
[judge walkthrough](tick/LAUNCH_DEMO.md), [hosted receipts](tick/evidence/launch-demo-devnet.json)
and [verified upgrade](tick/evidence/settlement-upgrade-devnet.json).
The independent review is a development review; this is not mainnet-ready.

Install root and `tick/` dependencies, then `cd tick && npm run dev`.
Open `http://127.0.0.1:5173/`. Connect a Solana wallet or use the disposable
browser demo wallet. Funds and launches are devnet-only synthetic test assets.

From the repository root, with a funded devnet wallet in `ANCHOR_WALLET`:

```bash
npm run typecheck
node node_modules/typescript/bin/tsc -p tsconfig.json --outDir target/launch-test-js
npm run demo:launch
npm run demo:funding
```

`demo:launch` creates two actual hosted launches: one settles and claims; one
misses its minimum raise and refunds. It retains recovery keys only in ignored
`target/launch-demo/` and publishes key-free evidence in `tick/evidence/`.
It is resumable while its on-chain windows permit continuation.

`demo:funding` is a loopback-only, origin-restricted, budgeted local faucet.
The UI's **Get test funds** button funds up to ten demo wallets with the
published synthetic quote mint. It never sends the authority key to a browser;
do not expose this server publicly. Launch creation requires an existing
supported DBC configuration. This v1 form does not create arbitrary curves.
The walkthrough includes the public demo mint/config addresses and explains
how to start a fresh run after the recorded bidding windows have closed.

## Settlement validation

Build SBF with pinned platform-tools v1.57 and regenerate IDL/types first.
`npm run test:settlement` requires WSL and real DBC/Metaplex binary dumps in
`target/deploy/dbc-mainnet.so` and `metadata-mainnet.so`, plus the local scoped
oracle fixture. It launches two isolated validators and stops them afterward.
The local test uses explicit closed-bid genesis fixtures and a controlled
oracle; only the hosted demo proves production private bidding/VRF.

## Original market demo

## Live demo flow

The browser demo includes a one-click **Run Live Demo** button that drives the real devnet flow:

1. Create or load a demo trader account.
2. Deposit demo base and quote tokens.
3. Delegate market, order book, reveal, and trader state to MagicBlock hosted ER.
4. Open a fresh ER-clock batch with ephemeral VRF.
5. Submit a buy and sell through the hosted ER router.
6. Wait for the batch window to close.
7. Clear with MagicBlock VRF.
8. Commit final state and undelegate back to devnet.

## Verified deployment

- Program: `B6eqSCBhokuZLKqBrzwhquUho183P3Fvu8pgC4a9PFkY`
- Network: Solana devnet
- Hosted ER: `https://devnet-us.magicblock.app/`
- Hosted ER validator: `MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd`
- Demo market: `4RKcixvD42i6kLdS3LodUbcCzV67JeKfLTqnTvHP1S3b`

## Run locally

From the repo root:

```bash
cd tick
npm install
npm run dev -- --host 0.0.0.0
```

Open `http://localhost:5173/market.html` and click **Run Live Demo** for the original market demo.

The demo wallet is generated in browser localStorage. To fund it for a fresh browser profile, open the page once, copy the displayed demo wallet address, then run:

```bash
cd tick
node scripts/seed-demo-market.mjs <demo-wallet-pubkey>
```

To intentionally create a new public-demo market with a shorter batch period:

```bash
cd tick
TICK_FORCE_NEW_MARKET=1 TICK_BATCH_PERIOD_SLOTS=1200 node scripts/seed-demo-market.mjs <demo-wallet-pubkey>
```

## Validation

```bash
cd tick
npx tsc --noEmit
npm run build
```

The Anchor program, devnet VRF, and hosted ER lifecycle have also been tested through the TypeScript test suite documented in `tick/PLAN.md`.

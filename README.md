# Tick

Tick is a real-time sealed batch auction on Solana that makes speed worthless.

The demo compares two market structures side by side. In a normal continuous order book, a faster sniper bot captures stale quotes the moment price moves. In Tick, orders are sealed inside MagicBlock Ephemeral Rollups, then cleared at one uniform price with MagicBlock VRF. The same bot can still submit quickly, but it receives the same clearing price as everyone else.

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
- Demo market: `A5TD7zDbBFuCWGQ9LheuFrphb8SuBccJh286UkYS8yo9`

## Run locally

From the repo root:

```bash
cd tick
npm install
npm run dev -- --host 0.0.0.0
```

Open `http://localhost:5173/` and click **Run Live Demo**.

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

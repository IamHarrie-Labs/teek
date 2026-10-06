# Tick — Hackathon Submission

## Project name

Tick

## Tagline

A real-time market where speed is worthless: sealed ER batches clear at one price, so the sniper bot visibly loses.

## Short description

Tick turns market microstructure into a live MagicBlock demo. A judge opens the page, watches a normal continuous order book reward a faster sniper bot, then clicks **Run Live Demo** to route real devnet orders through MagicBlock hosted Ephemeral Rollups. Orders are sealed during the batch, cleared with MagicBlock VRF at one uniform price, and committed back to Solana.

## Full description

Continuous order books reward speed. If one trader sees a price move a few milliseconds before everyone else, they can pick off stale quotes and extract value without providing better prices. That problem is hard to explain in a protocol demo, so Tick makes it visible: the same sniper bot runs against two market structures, and the scoreboard shows where latency creates profit.

Tick is a sealed uniform-price batch auction built for MagicBlock. Users deposit demo base and quote tokens, delegate their market state to a hosted Ephemeral Rollup, submit orders during an ER-clock batch, and clear once the batch closes. Every fill in a batch receives the same clearing price. The sniper can still be fast, but speed no longer changes execution priority or price.

This is load-bearing MagicBlock usage. ERs provide the low-latency state machine for the live order window. MagicBlock VRF supplies callback randomness for fair clearing/tie handling. Delegation moves real Solana accounts into the ER and commit/undelegate brings the final state back. The browser demo calls the same deployed devnet program and hosted ER route proven by the test suite.

The current implementation includes a deployed Anchor program, zero-copy order book and reveal accounts, balance locking in trader accounts, hosted ER delegation, ephemeral VRF clearing, commit/undelegate, a browser simulation that explains the mechanism, and a one-click live demo button for judges. Next, Tick can grow into a private frequent batch auction layer for DeFi apps, games, and agent markets that need real-time interaction without letting latency become the product.

## MagicBlock primitives used

- Ephemeral Rollups for fast order submission and batch state.
- Hosted ER delegation for market, order book, reveal, and trader accounts.
- MagicBlock VRF for asynchronous clearing callbacks.
- Commit and undelegate for settlement back to Solana devnet.
- Private ER-ready architecture for sealed order visibility.

## Demo instructions

1. Open the live/local demo.
2. Watch the top simulation: the sniper profits in the continuous book and fails in Tick.
3. Scroll to **Live on devnet**.
4. Click **Run Live Demo**.
5. The app will deposit, delegate, open an ER batch, submit buy/sell orders, wait for the batch window, clear with VRF, then commit and undelegate.
6. The reveal line should show a uniform-price result like `cleared 10 units at price 100 (2 fills)`.

## Deployed addresses

- Program: `B6eqSCBhokuZLKqBrzwhquUho183P3Fvu8pgC4a9PFkY`
- Demo market: `A5TD7zDbBFuCWGQ9LheuFrphb8SuBccJh286UkYS8yo9`
- Base mint: `DMmczj8jjJhLrhTGaNeZXxvivVFz15MBws9utEe6GPZe`
- Quote mint: `41WxcNfSBzwxUshRMacTiGMRvTbUZ9pJz2nEZL1qb6xQ`
- Order book: `Cmndy35xFdM2LyqjyXMYBcjtyKt7nAiXZTfwoPCAPd7N`
- Reveal: `9mvpsqAzZLFaH6ADaqhKgLPEcZDDcMZ6LwnWM9D33v9o`
- Hosted ER validator: `MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd`

## Suggested category

Consumer DeFi / Real-time apps. Tick is financially meaningful, but the winning demo angle is the instantly understandable game-like loop: “watch the sniper lose.”

# Teek Launch: judge walkthrough

Private budget bids. One shared opening purchase. Public Meteora trading.

This is a working devnet prototype. Quote tokens are synthetic test assets,
not USDC. It pools demand into a purchase on an immutable DBC curve; it does
not discover a price from limit orders. Funding and timing remain public,
and closing reveals bids and earlier edits. Each venue admits at most 24 wallets.
The creator can cancel before settlement; returned bids can claim full refunds.

## Open the recorded demos

From the repository root, install dependencies in both root and `tick/`.
Run `cd tick && npm run dev -- --host 127.0.0.1`.

- Success: `http://127.0.0.1:5173/?launch=4orftfqsHc92GJVrFSuvqZKab3LsL4txyNm7BjUYWuwY`
- Refund: `http://127.0.0.1:5173/?launch=B2PstiXkcw81SDafJrzQ8eB4YbcG3eYS33hH1Jjq1Y4X`

Both pages read real Solana account state. Their bidding windows have ended;
new viewers can inspect terms/outcomes, but cannot enter these old launches.

The success demo accepted 0.6 quote tokens from 0.789345 submitted bids and
received 1,897,418.306355 OPEN. Both participants claimed allocations and
unused funding; their refunds were 0.546794 and 0.353206 quote tokens.
The second launch required 1 quote token, missed that minimum and refunded
the full 0.8 and 0.7 deposits. It created no pool and spent no quote.

The runner verified authorized/unauthorized reads during both private windows,
real production scoped VRF for the success case, custody conservation, token
claims, returned deposits and absent failed-launch pool. Public receipts:
`evidence/launch-demo-devnet.json`. Upgrade receipt:
`evidence/settlement-upgrade-devnet.json`. No keys/session tokens are included.

## Try a fresh launch

Use a disposable devnet wallet. Never import a valuable wallet into this demo.
With a funded devnet authority in `ANCHOR_WALLET`, start from the root:

```bash
node node_modules/typescript/bin/tsc -p tsconfig.json --outDir target/launch-test-js
npm run demo:funding
```

Choose **Use demo wallet**, select a recorded launch and choose **Get test
funds**. This local faucet mints 100 synthetic quote tokens and gives 0.05
devnet SOL when the wallet lacks enough test SOL. It supports ten wallets,
persists receipts to prevent repeated funding and only accepts loopback UI
origins. Keep the server private on `127.0.0.1:8790`.

Choose **Create a launch** and use these public devnet addresses:

- Quote mint: `GR5J9vsRr4WauZMaj6NvqYJHxRQjVjzcsTuwv2LgADPj`
- DBC config: `BbfNG9UKRkbKnrv17BBUVXZASFUuSpt1CnEDNWukhDiy`

The defaults set a 0.1 minimum, 0.6 cap and 1-token minimum output at the cap.
Set future funding/bidding/deadline times. Publish, share the launch URL,
fund before opening, then save a private bid during the bidding window.
At close, return all registered bids and close the launch. Request randomness,
wait for its callback, settle the opening purchase, and claim tokens/refunds.
Amounts are shown in token units; protocol accounting uses integer base units.
The on-chain terms are immutable. The fixed config is a test curve with a
much higher migration threshold; this demo proves opening, not graduation.

To run the automated two-launch proof afresh, archive the ignored
`target/launch-demo/context.json` under another local filename and run
`npm run demo:launch` with the funded devnet authority. Preserve the old
context for recovery; it contains keys and must not be published. Fresh runs
create new test assets/windows and replace the public latest-run receipt.
The same context resumes an interrupted run only while its windows allow it.

## Recording sequence

1. Show immutable terms and privacy boundaries.
2. Show a bidder edit and an unauthorized read denial during a fresh window.
3. Open the success page: one atomic pool/purchase, shared price, claimed output.
4. Open the refund page: no purchase, all deposits returned by the runner.
5. Finish with the receipts and the independent development review.

Local real-program tests also cover failed swap rollback, cancellation recovery,
24-bidder settlement and strict rejection cases. This is development validation,
not an external audit or mainnet readiness certification.

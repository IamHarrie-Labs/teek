# Evidence

These files are the records from real runs on Solana devnet. Each one names the transactions, so you can check them yourself on the Solana explorer.

## Full launches

`launch-demo-devnet.json` covers the two featured launches on the site. One opened and paid both buyers. The other missed its minimum and refunded every deposit without creating a pool.

`browser-lifecycle-devnet-2026-10-11.json` is the first full launch run done only through the live website, using the demo wallet, from publishing to claiming.

`browser-lifecycle-devnet-2026-10-11-run2.json` is the second website run, after the fixes it prompted. It covers one launch that opened and one that refunded, plus the problems found and how each was fixed.

## Private bids

`private-bids-devnet-2026-10-05.json` is the live privacy test. While bidding was open, a second bidder and the creator couldn't read someone else's bid, but the owner could.

## The program

`rename-upgrade-devnet.json` and `settlement-upgrade-devnet.json` record the program upgrades. They show that the bytes deployed on devnet match a build of this repository.

`settlement-local.json` is the settlement run on a local validator.

## The Studio and test funds

`custom-studio-devnet.json` shows a launch published with a creator's own custom curve, including a retry that didn't spend extra SOL.

`demo-funding-devnet.json` records the test-funds service paying a demo wallet.

## Website reviews

`receipt-ui-review.json`, `studio-ui-review.json` and `ui-review-2026-10-08.json` are the website checks at phone and desktop widths. The `receipt-` and `studio-review-` screenshots belong to them.

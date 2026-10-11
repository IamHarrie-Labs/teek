# Test funds service

`fund.ts` is a tiny server function that runs on Vercel next to the website. When someone presses "Get test funds" on the live site, the page calls this function, and it sends that wallet 0.1 test SOL and 100 test tokens on devnet.

It pays from its own small wallet, kept separate from the wallet that controls the Teek program. That wallet's secret key is stored only in Vercel's private settings, never in this repository and never in the browser. Whatever the wallet holds is the total budget, so even in the worst case only worthless test funds are at stake.

It also says no a lot, on purpose. It refuses requests that do not come from the Teek website, wallet addresses that are invalid, program accounts pretending to be wallets, and any token other than the official test token. It limits how often one network can ask, and a wallet that already holds the test funds gets nothing more.

You can try it against devnet from the repository root with the checker script.

```bash
FAUCET_SECRET_KEY="$(cat target/faucet/faucet-keypair.json)" node --experimental-strip-types scripts/check-faucet.mts
```

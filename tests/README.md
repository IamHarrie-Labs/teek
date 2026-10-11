# Tests

These tests prove the program does what we say it does. Some run on your own computer against a private copy of Solana, and some run against the real devnet with MagicBlock's live services.

## Local tests

`launch.ts` checks the launch flow on a local validator, including that money really moves into and out of the escrow and that every step refuses to run at the wrong time.

`dbc-abi.test.ts` checks that our translator for Meteora's program builds exactly the instructions Meteora expects.

`private-transaction.test.ts` checks our rules for deciding whether a private transaction leaked anything it should not have.

`teek.ts` is the original market test from the Tick days.

Run them all with a local validator already running the built program.

```bash
npm run test:launch -- --with-market
```

## Devnet tests

`launch.private.ts` is the real privacy proof. It shows that while bidding is open, one bidder cannot read another bidder's account or transaction details on MagicBlock's private rollup. It spends a little devnet SOL, so it only runs when you ask for it.

`teek.hosted-er.ts` runs the original market from start to finish on MagicBlock's hosted rollup.

`teek.devnet.ts` checks delegation and the VRF randomness round trip on devnet.

```bash
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=~/.config/solana/id.json npx ts-mocha -p ./tsconfig.json -t 1000000 tests/teek.hosted-er.ts
```

The `fixtures` folder holds a stand-in randomness service used only for local tests, and `helpers` holds shared test code.

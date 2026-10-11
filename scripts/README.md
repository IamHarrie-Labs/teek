# Scripts

Small tools for running demos, tests and upgrades. None of them print secret keys, and anything that spends money only works on devnet.

## Demos

`launch-demo.mjs` runs two real launches on devnet, one that succeeds and one that refunds, and saves the proof in `teek/evidence`. Run it with `npm run demo:launch`.

`demo-funding.mjs` is the local version of the test funds service, for running the website on your own computer. It only answers requests from your own machine. `verify-demo-funding.mjs` checks it worked.

`check-faucet.mts` tests the hosted test funds service in `api/fund.ts` against devnet.

`verify-custom-studio-devnet.mjs` publishes a launch with a custom curve the same way the Launch Studio does, to prove that path works on devnet.

## Tests

`test-launch.mjs` runs the local launch tests with a throwaway wallet. `test-launch-private.mjs` runs the devnet privacy proof. `test-settlement.mjs` runs the full settlement flow against real copies of Meteora's programs on a private local network.

`settlement-fixture.mjs` sets up the data those settlement tests need.

## Program upgrades

`preflight-launch-upgrade.mjs` checks costs and permissions before an upgrade without touching any keys. `upgrade-launch-devnet.mjs` and `resume-launch-upload.mjs` upload a new program version in small pieces and can pick up where they left off if the network drops. `check-launch-upload.mjs` compares what is on chain with the local build.

`check-private-rpc.mjs` checks MagicBlock's private rollup service is reachable, and `recover-devnet-test-sol.mjs` collects leftover test SOL from throwaway test wallets.

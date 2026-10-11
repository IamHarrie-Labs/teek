# Shared client code

This folder is TypeScript that knows how to talk to the Teek program. The website, the tests and the scripts all import it, so every part of the project reads launches and builds transactions the same way. If the numbers on the website ever disagreed with the numbers in a test, that would be a bug, and keeping one shared copy prevents it.

All amounts in here are whole numbers of the token's smallest unit. We never use decimals for money, because decimals on computers round in surprising ways.

## The files, one by one

`launch.ts` is the main client. It can create a launch, fund it, place and edit a private bid, close bidding, settle and claim.

`launch-read.ts` turns raw on-chain data into one clear picture of a launch, its rules, its stage and its result. Every page uses this, so they all agree.

`refund-history.ts` works out which refunds have actually been paid by looking at past transactions, as opposed to refunds that are only available to claim.

`launch-rehearsal.ts` runs a pretend opening purchase with Meteora's own maths, so a creator can see what would happen at different amounts before publishing anything.

`creator-config.ts` and `publish-draft.ts` handle publishing a new launch from the Launch Studio. If a transaction's confirmation gets lost, they find the launch that already exists instead of paying to create a second one.

`publication-lock.ts` stops two browser tabs from publishing the same launch at the same time.

`dbc-config.ts` and `dbc-policy.ts` describe the Meteora curve settings Teek supports and check that a setup matches them.

`rpc.ts` retries network requests when the public Solana service is busy. It resends the exact same request, so a signed transaction never gets signed twice.

# Security

Teek runs on Solana devnet only, with test tokens that have no value. Please don't use it with real money.

The program has had a development review and adversarial tests, and the review notes are in the [teek](teek) folder. It has not had a professional security audit yet. That audit is the step we want to complete before Teek ever touches mainnet.

## Reporting a problem

If you find a way to take or lock other people's deposits, read a bid that should be private, or break the launch rules, please tell us privately first rather than opening a public issue.

Send a direct message to [@useteekapp](https://x.com/useteekapp) on X, or open a [private security advisory](https://github.com/IamHarrie-Labs/teek/security/advisories/new) on GitHub. Include the steps to reproduce it and the devnet transaction if you have one. We'll reply as soon as we can and credit you if you'd like.

## What's in scope

The Teek program in [programs/teek](programs/teek), the shared client code in [clients](clients), and the test-funds service in [api](api). The faucet only ever hands out devnet test funds, but a way to drain it or abuse it is still worth reporting.

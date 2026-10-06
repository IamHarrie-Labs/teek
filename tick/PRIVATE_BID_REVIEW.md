# Private-bid review — 2026-10-05

Scope: launch intake/custody, account permissions, typed client and hosted proof harness. Self-review and a separate independent development review are complete. Three initial findings and one follow-up harness finding are fixed and independently rechecked; see `PRIVATE_BID_INDEPENDENT_REVIEW.md`. The reviewed binary is upgraded on devnet and its deployed bytes match the local build. The final hosted run passes all five checks, including full expiry refunds.

## Results

No confirmed custody exploit found in the reviewed launch module. Signer, mint, PDA, owner and discriminator checks are present; deposits/withdrawals use checked arithmetic; the registry requires each registered bid exactly once; new bid writes require private activation. Live tests verify both account read protection and transaction-content redaction during bidding, followed by restored L1 ownership and refunds. This assessment does not establish protection on every RPC surface.

Provisional security grade: B for the reviewed launch intake. Correctness/testing grade: B for the tested custody/private flow. Ready for mainnet: false. Settlement is outside this assessment and is not implemented.

## Concrete changes made

- Hosted tests now use confirmed commitment for both account creation and program simulation, avoiding the processed/confirmed-bank race observed in local tests.
- The transaction-privacy test now requires Bob to retrieve his own edit transaction before treating denial of Alice's edit as meaningful.
- Added `scripts/check-private-rpc.mjs`: a disposable signing identity authenticates and checks service identity/health without printing the session token.
- Added the SDK undelegation callback, repaired negative-test false positives and checked the complete devnet genesis hash before hosted funding.
- Corrected the transaction test to verify redacted contents instead of requiring a null receipt. Both bidders must retrieve their own encoded edit instructions first, and checks occur before close.
- Whitelisted receipt, message, metadata, outer-envelope and error shapes. Seven regressions reject leaked instructions, balances, logs, return data, extra fields and denial-text payloads. The separate reviewer reproduced the original outer-envelope bypasses and verified their fixes.

## Verified preflight

- Private authentication works. Authenticated RPC reports pinned validator `MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo`; health returns `ok`.
- Current devnet program upgrade authority matches the configured wallet.
- Wallet balance observed: 4.266518801 devnet SOL. Recheck current rent and fees immediately before upgrade; the new binary is larger than the existing allocation.
- Root TypeScript checking passes after the test changes.
- Existing staged Git baseline remains intact.

## Remaining review and verification items

1. Websocket subscriptions, multiple-account/program-account enumeration, broad transaction history and TEE attestation remain outside the current live harness. Add coverage before a production confidentiality claim.
2. Funding metadata, transaction signatures, timing and success are public. Closing permissions reveals both final bids and earlier edit messages. Refunds require delegated records to return, so ER unavailability can delay withdrawals; third-party recovery through private ingress is not proven.
3. Settlement is not implemented. Before adding it, validate DBC config and minimum output, use full-entropy VRF-derived unbiased allocation, and verify custody conservation through swap and claims.

The current prototype is limited to 24 bid records and is not Sybil-resistant. The existing market engine's seeded allocation helper must not be advertised as a mathematical proof of exactly unbiased allocation.

## Verified upgrade receipt

- Program: `B6eqSCBhokuZLKqBrzwhquUho183P3Fvu8pgC4a9PFkY` (Solana devnet).
- Upgrade transaction: `57oroWo7XGE9pzmWRvpu6K5ESC95XR7Jvjj1s71sAVXue2GPe9vvHvdXpf3ToZUD3MXsh8jx4982MucAJbg1m7kq`.
- ELF: 638,680 bytes; SHA-256 `cd7fbcd9e595f652d72f0ca41bce5e986568130c614b392ee3f81f2272dd16f9`.
- `scripts/check-launch-upload.mjs` confirmed exact deployed-byte equality and that the temporary staging buffer was closed.

## Validation

Clean SBF build with the undelegation callback; regenerated IDL; 16 Rust tests; 13 local-validator tests; seven privacy-evidence regressions; five complete hosted-flow checks; root/frontend type checks. The earlier frontend suite has 16 passing tests and a successful production build; this milestone changes the program/client/test documentation, not the browser UI.

The hosted test uses synthetic quote tokens, random placeholder base/config addresses and two disposable funded devnet identities. It verifies intake and expiry refunds; it does not exercise DBC launch settlement. The original staged Git baseline remains intact.

Final launch: `Gfd9X4W2m3uG436eg5bghQj3GEkFp4HLAV6KYuKCVNXR`. Alice/Bob deposits: 800,000/700,000 synthetic quote base units; final bids: 333,111/456,234; total: 789,345; accepted cap: 600,000. On expiry, both source balances returned to 1,000,000 and escrow reached zero. Both owner instruction controls and outsider redactions were captured while the private clock was 49 seconds before close. The separate reviewer rechecked those saved privacy responses and controls; the primary harness verified the final refunds.

Portable public/synthetic evidence: [devnet proof](evidence/private-bids-devnet-2026-10-05.json). It contains no wallet secrets or session URLs.

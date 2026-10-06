# Independent review — 2026-10-05

Reviewer: separate Codex review agent (Archimedes), read-only. Scope: new launch intake/custody, permission lifecycle, client and test harness. This is an independent development review, not an external audit.

Initial findings, all fixed:

1. **High: undelegation callback missing.** SDK `#[commit]` supplies accounts but not the callback needed to restore account ownership. Added `#[ephemeral]` above `#[program]`. Regenerated IDL includes `process_undelegation`; new SBF binary compiles. The reviewer checked that the callback requires a canonical Delegation Program buffer with a PDA signature, pinned System Program and exact original account seeds.
2. **Medium: negative-test helper caught its own failure.** `assert.fail` is now outside the catch. A regression verifies a resolved action causes the helper to fail. The reviewer independently exercised success, expected-error and wrong-error cases.
3. **Medium: URL substring did not prove devnet.** The hosted test now verifies full devnet genesis hash before transferring funds.

Follow-up conclusion: **no remaining source-level blockers found for the devnet-only upgrade**. No confirmed escrow theft/conservation defect found in the reviewed intake.

The hosted flow has verified permission creation and closure, private account/transaction reads, unchanged funded balances and closed/privacy flags after commit, actual L1 ownership restoration and full expiry refunds. Third-party recovery through private ingress, ER outages, broad RPC enumeration/subscriptions and TEE attestation remain unverified boundaries. DBC settlement is not implemented; this review does not approve mainnet or settlement of real assets.

## Runtime evidence follow-up

The first null-only transaction assertion rejected the runtime's safe redacted receipt. Saved during-window responses contained empty messages, instructions, keys, balances, logs and return data; signature, slot, time and success remained visible. The reviewer independently checked those responses.

A follow-up Medium finding showed that the replacement assertion ignored extra outer-envelope fields and error payloads. The helper now whitelists the full envelope, rejects unchecked error data and accepts only recognized denial text. Seven regression tests passed independently, including all three reproduced bypasses. Follow-up conclusion: **no remaining blockers in the focused assertion recheck**. Alice's and Bob's actual encoded edit instructions are required as authorized controls.

The reviewer rechecked saved privacy responses and test logic; the live custody/refund results are recorded by the primary harness. This remains an independent development review rather than a formal audit.

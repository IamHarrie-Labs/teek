# Independent development review — launch settlement

Reviewed binary SHA256: 2d539968f8dce06ffeea92f9eca155ece9aac925dc872ef0b175d0548d4a7b97

Artifact: 634,128 bytes, platform tools v1.57, Anchor 1.2.0, release size
optimization (`opt-level = "z"`), checked arithmetic and LTO enabled.
Reviewer: independent Avicenna review agent, read-only; no signing/deployment.
DBC source examined at commit `f552f20aa3c1c7631427c3827aeea7c58b902813`;
official SDK pinned at 1.5.13. Reviewers inspected installed scoped VRF macros.

**No unresolved blocking source finding in the reviewed launch path.**

## Findings and resolutions

- P1 configuration race: registration could block subsequent venue binding.
  Fixed by a canonical sidecar guard in registration and top-up for every
  settlement-capable mint. Guard validates Teek ownership, discriminator,
  matching launch and phase 0. Atomic creation/binding is also the client
  default. Legacy placeholder intake cannot be converted into a venue.
- Full-entropy allocation: independent review checked systematic rounding,
  exact conservation and split expectations across 24,441 small exhaustive
  cases. The new sampler uses all seed bytes, domains, snapshot and rejection
  sampling. Claims are bounded by immutable stored liabilities.
- CPI privileges/config: three DBC discriminators, account order, signer and
  writable privileges, absent-referral sentinel, owners/addresses and config
  offsets matched official code. Creator rights return to the immutable
  creator. Prefunded empty System PDAs cannot squat the allocation vault.
- One-shot VRF: complete registry validation precedes request. Teek signs its
  request identity; callback requires the scoped oracle signer and bound
  commitment. Permanent phases prevent reseeding and replay.
- Emergency cancellation: only creator can cancel; settlement is terminal.
  Cancellation blocks future bidding and settlement, cannot spend escrow,
  preserves claims, and permits early bid return only in `Refunds` status.

## Chain evidence

The exact artifact ran against actual mainnet DBC and Metaplex binaries in
an isolated local validator. Controlled scoped oracle and closed-bid genesis
fixtures are expressly not hosted privacy/production VRF evidence.

- Two-bid atomic purchase: 282,987 CU; all allocations/refunds claimed.
- 24-bid atomic purchase using v0/ALT: 385,964 CU; all 24 claims conserved.
- Deliberately impossible output floor: swap rejected, no pool or mint created,
  no quote spent; unauthorized cancellation rejected; creator cancellation
  enabled full refunds.
- Duplicate requests, wrong commitments, duplicate callbacks, duplicate
  settlement, post-settlement cancellation and duplicate claims rejected.
- Actual DBC creator transfer and immutable mint authority checked.
- Maximum metadata fits the sidecar; pre-funded PDA initialization works.

Recorded evidence: `evidence/settlement-local.json`. The stricter final run
passed all 45 specific program-code rejection assertions, so transport errors
cannot count as passes. Repeated settlement rejects `ConstraintOwner` at
account validation because the allocation vault is already SPL-owned.
Hosted devnet lifecycle evidence is recorded separately, only after execution.

## Hosted devnet completion — October 6, 2026

The reviewed 634,128-byte artifact was upgraded at the existing program ID.
Deployed bytes match SHA-256
`2d539968f8dce06ffeea92f9eca155ece9aac925dc872ef0b175d0548d4a7b97`
exactly. Upgrade signature and slot are recorded in
`evidence/settlement-upgrade-devnet.json`.

Two actual hosted launches completed using the production Private ER and
scoped VRF. During both bidding windows, an unauthorized account read was
denied while the bidder's authorized control succeeded. The opening launch
spent 600,000 quote base units, received 1,897,418,306,355 base units and paid
both token allocations and refunds; custody vaults were empty afterward.
The failing launch missed its 1,000,000-unit minimum, created no DBC pool and
returned the full 800,000 / 700,000-unit deposits. Key-free transaction
receipts are in `evidence/launch-demo-devnet.json`.

The browser judge wallet received the synthetic test quote and devnet SOL.
Actual balances, idempotent retry, disallowed origin and wrong-mint rejection
passed: `evidence/demo-funding-devnet.json`.

## Remaining limitations

This is a development review, not an external audit or a formal verification.
No mainnet writes. 24-wallet admission can be Sybil-squatted. Creator can veto
an unsettled launch; refund safety does not remove that liveness/trust issue.
Private bidding/recovery depend on the ER service and scoped VRF availability.
Funding is public, and close reveals earlier edits. Enumeration, subscriptions,
attestation, outages and existing mainnet trading remain unverified. Synthetic
test quotes are not USDC. Legacy market sampler limitations remain isolated
from the new launch path. The single-wallet devnet upgrade authority is not
a production authority policy.

## Addendum — 2026-10-08 rename rebuild

The reviewed binary above (`2d539968…`) was replaced on devnet by a rebuild after the project rename from Tick to Teek (folders, crate, `#[program]` module and error enum names only; no logic changes). New SHA-256: `eac335ee1453c83486cee8747d7b2eb0edbea38ca08eb0a45676fff2d2d9503a`, upgrade `2mAXLUYUfYXmf4QG5KYpcoo1F2Z6FJ2sZ21v2jVPUKtAzga2ccY9omknX5EYpHacK2txs4MhjhbbDobbqxGTfF2Y`. All 36 instruction/account/event discriminators, error codes and account layouts are identical to the reviewed build; 20 Rust tests and 22 local launch tests pass on the rebuilt binary. The independent review was not re-run for this rename-only change.

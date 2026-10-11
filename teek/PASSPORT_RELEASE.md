# Passport and initial Launch Studio release

Implemented 2026-10-08 on the existing frontend and deployed devnet program.
No program changes or upgrades in this increment.

## Working features

- Public Passport: configured fee/LP rights, authorities, bound configuration
  hash, window-only confidentiality and refund limitations.
- Success receipts: reconciled settlement totals and paid/still-claimable
  refunds derived from the claim bitmap. Integer base-unit calculations.
- Failed launches: explicit transaction-history checks matching canonical Teek
  instructions to successful inner SPL transfers. Complete coverage requires
  initialization, refund activation and reconciliation with current balances.
  Missing history and unsupported wrapped instructions remain partial.
- Wallet-free links, JSON receipts and SVG cards with observation time. Payment
  audits survive account refresh in the page session with their original date.
- Identity → Terms → Review wizard, versioned browser drafts, supported devnet
  defaults, advanced configuration, precision/date/byte-length validation.
- Live curve review and supported ABI checks; draft/config hashes rechecked
  before initialization. Manifest now includes integer output floor/config hash.
- Studio now rehearses hypothetical total bids with the pinned Meteora SDK:
  below-minimum refunds, capped openings, protocol/trading fees, integer ceiling
  of the output floor and output-floor failure. The recorded 0.6 quote opening
  reproduces 1,897,418.306355 OPEN exactly. This is an aggregate calculation;
  final wallet shares require the VRF result and actual transaction.
- Studio can now choose a restricted custom creator curve (supply, flat fee,
  creator fee portion, unlocked creator LP and migration threshold). Review uses
  the chosen curve for the exact aggregate rehearsal. Publishing creates its
  DBC configuration first, validates the resulting account, then publishes
  Teek's immutable terms. The one-use config signer and launch PDA are saved
  in browser storage to recover from uncertain confirmations without inventing
  a second configuration or launch. Publishing is serialized across browser
  tabs for the same creator; unsupported browsers stop before signing. Saved
  identities persist until explicitly cleared, including completed drafts.
  The final review shows total supply before signing. The shared creator-config
  and publication helpers have now completed a fresh real devnet launch and a
  same-draft retry without another spend. On 2026-10-11 the browser flow was
  run end to end on the live site with a demo wallet, from publishing through
  bidding, settlement and claims. The record is in
  `evidence/browser-lifecycle-devnet-2026-10-11.json`.

## Evidence

- `evidence/receipt-ui-review.json`: successful opening spends 0.6 quote,
  receives 1,897,418.306355 OPEN, pays 0.9 refunds and completes 2/2 claims.
  Failed launch history reconciles 1.5 refunded and zero remaining.
- `evidence/studio-ui-review.json`: live configuration review, invalid-budget
  rejection, invalidation after edits, draft restoration. Zero transactions sent.
- Both reviews cover 375/1280 widths, no horizontal overflow or recorded uncaught
  exceptions. Screenshots sit beside the reports.
- Frontend/root TypeScript, frontend tests and production build checked.
  Browser checks do not prove a newly published launch through Studio.
- `evidence/custom-studio-devnet.json`: separate confirmed DBC configuration
  and Teek launch transactions, account read-back, matching launch PDA and a
  retry that recovered the existing launch without spending additional SOL.

## Remaining requirements

Devnet only. Creator-specific config publication is verified with a disposable
devnet wallet through the shared Studio helpers; browser-wallet signing remains
unverified. Durable metadata upload, complete supply/vesting
preview, full transaction simulation and total rent/fee estimates remain. The
saved-address retry path is implemented but has not been exercised against an
ambiguous real RPC confirmation. Manifest content
is hashed but not durably hosted. SVG sharing is not a social-preview endpoint.

Reads are confirmed/timestamped, not an atomic finalized snapshot. History scans
are bounded; busy launches may need archive/indexer support. Payment audits last
only for the page session and must be rerun after reload. Large SDK bundle warnings
remain. Hosted onboarding, keeper, earnings, real migration and capacity beyond
24 wallets retain their roadmap gates. Existing Orbit identity/colors retained.

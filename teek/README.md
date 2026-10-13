# The Teek website

This folder is everything you see at [useteek.xyz](https://useteek.xyz), built with Vite and plain TypeScript. It also holds the project's written documents and the proof from our devnet runs.

## The pages

`index.html` is the home page that explains Teek. `launch.html` is the launch app, where you browse launches, join one, read its Passport and create your own in the Launch Studio. `evidence.html` shows the recorded devnet results. `market.html` is the original Tick simulator. `submission/submission.html` is our hackathon brief.

The code for each page is in `src`. The ones worth knowing first are `launch-page.ts` for the launch app, `launch-studio.ts` for the creation builder, `launch-passport.ts` for the Passport and receipts, and `teek-home.ts` for the home page. `brand.ts` and `brand.css` hold the shared logo, colours and fonts. `engine` and `sim` power the simulator.

## Running and testing

```bash
npm install
npm run dev
npx vitest run
npx tsc --noEmit
npm run build
```

Install the packages in the repository root too, because the pages import the shared code in `../clients`.

## The documents

If you only read one, read [LAUNCH_DEMO.md](LAUNCH_DEMO.md). It walks through the two real launches step by step.

[LAUNCH_SPEC.md](LAUNCH_SPEC.md) and [SETTLEMENT_SPEC.md](SETTLEMENT_SPEC.md) explain exactly how a launch works and how the end of a launch is settled. [PRIVATE_BIDS.md](PRIVATE_BIDS.md) explains how bids stay private and what is still public.

[SETTLEMENT_REVIEW.md](SETTLEMENT_REVIEW.md), [PRIVATE_BID_REVIEW.md](PRIVATE_BID_REVIEW.md) and [PRIVATE_BID_INDEPENDENT_REVIEW.md](PRIVATE_BID_INDEPENDENT_REVIEW.md) are the development reviews, including the problems they found and how each was fixed.

[PASSPORT_RELEASE.md](PASSPORT_RELEASE.md) describes the Passport and Launch Studio.

The `evidence` folder holds the records and screenshots from real devnet runs. Its README says what each file proves.

Older planning documents, including the September build diary and the post-hackathon roadmap, now live in [docs](../docs).

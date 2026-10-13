# The Teek website

This folder is everything you see at [useteek.xyz](https://useteek.xyz), built with Vite and plain TypeScript. It also holds the project's written documents and the proof from our devnet runs.

## The pages

`/` is the home page. `/launch` is the launch app, where you browse launches, join one, read its record and create your own in the Launch Studio. `/evidence` shows the recorded devnet results, `/market` is the original Tick simulator, and `/submission` is the hackathon brief. Vercel redirects old `.html` URLs to these clean paths.

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

## Token artwork

Creators can preview a PNG, JPEG or WebP logo in the Launch Studio. The upload button signs the image with their connected wallet and sends it to `/api/token-art`, which writes the image and its token metadata JSON to a public Vercel Blob store. Connect a **public** Blob store to the Vercel project; the current Blob SDK accepts Vercel OIDC or `BLOB_READ_WRITE_TOKEN`. The server caps files at 512 KB, checks the file bytes and wallet signature, and keeps storage credentials out of the browser. The selected image stays local until Upload logo succeeds. If Blob is not configured, creators can still enter their own hosted metadata URL.

The metadata URI becomes fixed when the launch opens. Keep the Blob store and images available for the lifetime of those tokens. Local Vite development does not run Vercel functions; test an upload through the deployed project or `vercel dev` with the Blob environment connected.

## The documents

If you only read one, read [LAUNCH_DEMO.md](LAUNCH_DEMO.md). It walks through the two real launches step by step.

[LAUNCH_SPEC.md](LAUNCH_SPEC.md) and [SETTLEMENT_SPEC.md](SETTLEMENT_SPEC.md) explain exactly how a launch works and how the end of a launch is settled. [PRIVATE_BIDS.md](PRIVATE_BIDS.md) explains how bids stay private and what is still public.

[SETTLEMENT_REVIEW.md](SETTLEMENT_REVIEW.md), [PRIVATE_BID_REVIEW.md](PRIVATE_BID_REVIEW.md) and [PRIVATE_BID_INDEPENDENT_REVIEW.md](PRIVATE_BID_INDEPENDENT_REVIEW.md) are the development reviews, including the problems they found and how each was fixed.

[PASSPORT_RELEASE.md](PASSPORT_RELEASE.md) describes the Passport and Launch Studio.

The `evidence` folder holds the records and screenshots from real devnet runs. Its README says what each file proves.

Older planning documents, including the September build diary and the post-hackathon roadmap, now live in [docs](../docs).

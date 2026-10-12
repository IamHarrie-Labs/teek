# The First Second

This is Teek's 60 second launch film, built in code with [Remotion](https://www.remotion.dev). Every frame is drawn from React components, so the dots, words and numbers move exactly the way the motion treatment describes, and nothing has to be animated by hand.

The finished video lands in `out/teek-launch-film.mp4`. It's 1920 by 1080 at 60 frames per second with sound.

## What's in here

`src/scenes.tsx` holds the eleven moments of the film, from "A token goes live" to the end card. `src/Film.tsx` places them on the timeline and lines up every sound. `src/lib.tsx` has the colours, fonts, easing curves and the animated text.

`scripts/make-sounds.mjs` creates every sound in the film from scratch, including the clock tick, the bot's zip, the plucks, the glass, the drop and the quiet music bed. Nothing needs a licence. If you'd rather use a licensed music track, mute `bed.wav` in `src/Film.tsx` and lay the track under it in any editor, with its drop at exactly 0:30.

`scripts/capture-ui.mjs` takes the real product screenshots for the montage straight from the live site.

## Making the video

You need Node.js 22 or newer.

```bash
npm install
npm run sounds
node scripts/capture-ui.mjs
npm run render
```

To scrub through the film and tweak it live, open the Remotion studio.

```bash
npm run studio
```

## A note on the licence

Remotion is free for individuals and for companies with up to three people. A bigger team needs a Remotion company licence.

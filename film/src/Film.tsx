import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { C, Grain, prog } from './lib';
import { Zero, Race, Rewind, Rules, Private, Opening, Proof, Shares, Refund, Montage, EndCard, arrivalFrame } from './scenes';
import { dots } from './lib';

// The timeline at 60 fps. Shot numbers match the treatment.
export const T = {
  zero: [0, 240], race: [240, 420], rewind: [660, 240], rules: [900, 360], private: [1260, 450],
  opening: [1710, 570], proof: [2280, 300], shares: [2580, 300], refund: [2880, 360], montage: [3240, 180], end: [3420, 180],
} as const;
export const DURATION = 3600;

// Soft fades in and out, except where the treatment asks for a hard cut.
const Fade: React.FC<{ len: number; fadeIn?: boolean; fadeOut?: boolean; children: React.ReactNode }> = ({ len, fadeIn = true, fadeOut = true, children }) => {
  const f = useCurrentFrame();
  const o = (fadeIn ? prog(f, 0, 14) : 1) * (fadeOut ? 1 - prog(f, len - 14, len) : 1);
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

const Shot: React.FC<{ at: readonly [number, number]; fadeIn?: boolean; fadeOut?: boolean; children: React.ReactNode }> = ({ at, fadeIn, fadeOut, children }) => (
  <Sequence from={at[0]} durationInFrames={at[1]}>
    <Fade len={at[1]} fadeIn={fadeIn} fadeOut={fadeOut}>{children}</Fade>
  </Sequence>
);

const Sfx: React.FC<{ at: number; src: string; volume?: number }> = ({ at, src, volume = 0.8 }) => (
  <Sequence from={at} durationInFrames={300} layout="none"><Audio src={staticFile(`sfx/${src}.wav`)} volume={volume} /></Sequence>
);

const crowd = dots(34, 7);
const plucks = crowd
  .map((d) => arrivalFrame(d))
  .sort((a, b) => a - b)
  .filter((_, i) => i % 5 === 0)
  .map((frame, i) => ({ at: T.race[0] + Math.round(frame), src: ['pluck-low', 'pluck-mid', 'pluck-mid', 'pluck-high', 'pluck-high', 'pluck-top', 'pluck-top'][i] ?? 'pluck-top' }));

export const Film: React.FC = () => (
  <AbsoluteFill style={{ background: C.room }}>
    <Shot at={T.zero} fadeIn={false} fadeOut={false}><Zero /></Shot>
    <Shot at={T.race} fadeIn={false} fadeOut={false}><Race /></Shot>
    <Shot at={T.rewind} fadeIn={false}><Rewind /></Shot>
    <Shot at={T.rules}><Rules /></Shot>
    <Shot at={T.private} fadeOut={false}><Private /></Shot>
    <Shot at={T.opening} fadeIn={false}><Opening /></Shot>
    <Shot at={T.proof}><Proof /></Shot>
    <Shot at={T.shares}><Shares /></Shot>
    <Shot at={T.refund}><Refund /></Shot>
    <Shot at={T.montage}><Montage /></Shot>
    <Shot at={T.end} fadeOut={false}><EndCard /></Shot>
    <Grain />

    <Audio src={staticFile('sfx/bed.wav')} volume={0.85} />
    <Sfx at={24} src="tick" />
    <Sfx at={T.race[0] + 50} src="zip" volume={0.55} />
    {plucks.map((p, i) => <Sfx key={i} at={p.at} src={p.src} volume={0.5} />)}
    <Sfx at={T.rewind[0]} src="rewind" volume={0.7} />
    {[0, 1, 2, 3].map((i) => <Sfx key={`k${i}`} at={T.rules[0] + 40 + i * 22} src="tick" volume={0.45} />)}
    <Sfx at={T.rules[0] + 190} src="lock" volume={0.9} />
    {[0, 3, 6, 9].map((i) => <Sfx key={`g${i}`} at={T.private[0] + 80 + i * 15} src="glass" volume={0.4} />)}
    <Sfx at={T.private[0] + 260} src="zip" volume={0.3} />
    <Sfx at={1800} src="drop" volume={1} />
    {[0, 1, 2, 3].map((i) => <Sfx key={`p${i}`} at={T.proof[0] + 40 + i * 22} src="tick" volume={0.6} />)}
    <Sfx at={T.shares[0] + 40} src="cascade" volume={0.6} />
    {['pluck-top', 'pluck-high', 'pluck-mid', 'pluck-low'].map((src, i) => <Sfx key={`r${i}`} at={T.refund[0] + 120 + i * 22} src={src} volume={0.45} />)}
    {[0, 60, 120].map((d) => <Sfx key={`m${d}`} at={T.montage[0] + d} src="tick" volume={0.5} />)}
    <Sfx at={T.end[0] + 58} src="chime" volume={0.7} />
  </AbsoluteFill>
);

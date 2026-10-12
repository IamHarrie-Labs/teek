import React from 'react';
import { useCurrentFrame } from 'remotion';
import { loadFont as loadSerif } from '@remotion/google-fonts/InstrumentSerif';
import { loadFont as loadSans } from '@remotion/google-fonts/DMSans';
import { loadFont as loadMono } from '@remotion/google-fonts/DMMono';

export const W = 1920;
export const H = 1080;
export const FPS = 60;

export const SERIF = loadSerif('normal', { subsets: ['latin'] }).fontFamily;
loadSerif('italic', { subsets: ['latin'] });
export const SANS = loadSans('normal', { weights: ['400', '500'], subsets: ['latin'] }).fontFamily;
export const MONO = loadMono('normal', { weights: ['400', '500'], subsets: ['latin'] }).fontFamily;

// The palette from the treatment. Coral is only for the opening and the logo.
export const C = {
  room: '#1a1715',
  deep: '#141110',
  ivory: '#f5ebdc',
  muted: '#b5a596',
  steel: '#8d96a0',
  coral: '#fa655b',
  line: '#3a322c',
};

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const prog = (f: number, a: number, b: number) => clamp((f - a) / (b - a));
// Settle, for anything human arriving.
export const settle = (t: number) => 1 - Math.pow(1 - clamp(t), 4);
// Glide, for the camera and the glass.
export const glide = (t: number) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
// Bloom, for the coral dot and the logo landing.
export const bloom = (t: number) => { t = clamp(t); const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

export type Dot = { x: number; y: number; d: number; s: number };
export function dots(n: number, seed: number): Dot[] {
  let s = seed;
  const r = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  return Array.from({ length: n }, () => ({ x: r(), y: r(), d: r(), s: r() }));
}

// A statement in Instrument Serif. Words wipe up from a mask three frames apart,
// then leave by fading and drifting up. Words listed in `em` are set in italic.
export const Statement: React.FC<{
  text: string; from: number; to: number; x: number; y: number;
  size?: number; width?: number; align?: 'left' | 'center'; em?: string[]; emColor?: string;
}> = ({ text, from, to, x, y, size = 104, width = 1300, align = 'left', em = [], emColor = C.ivory }) => {
  const f = useCurrentFrame();
  if (f < from || f > to) return null;
  const exit = prog(f, to - 18, to);
  let index = 0;
  const lines = text.split('\n');
  return (
    <div style={{
      position: 'absolute', left: align === 'center' ? x - width / 2 : x, top: y, width,
      textAlign: align, fontFamily: SERIF, fontSize: size, lineHeight: 1.04, color: C.ivory,
      opacity: 1 - exit, transform: `translateY(${-14 * settle(exit)}px)`, letterSpacing: '-0.005em',
    }}>
      {lines.map((line, li) => (
        <div key={li}>
          {line.split(' ').map((word, wi) => {
            const i = index++;
            const t = settle(prog(f, from + i * 3, from + i * 3 + 26));
            const isEm = em.includes(word);
            return (
              <span key={wi} style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', paddingBottom: '0.14em', marginBottom: '-0.14em', marginRight: '0.24em' }}>
                <span style={{ display: 'inline-block', transform: `translateY(${(1 - t) * 112}%)`, fontStyle: isEm ? 'italic' : 'normal', color: isEm ? emColor : C.ivory }}>{word}</span>
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

// Small mono captions and labels.
export const Label: React.FC<{ text: string; from: number; to: number; x: number; y: number; size?: number; color?: string; align?: 'left' | 'center' | 'right'; spacing?: number }> =
  ({ text, from, to, x, y, size = 26, color = C.muted, align = 'left', spacing = 0.08 }) => {
    const f = useCurrentFrame();
    if (f < from || f > to) return null;
    const o = settle(prog(f, from, from + 18)) * (1 - prog(f, to - 14, to));
    const left = align === 'left' ? x : align === 'center' ? x - 1000 : x - 2000;
    return <div style={{ position: 'absolute', left, top: y, width: align === 'left' ? 1800 : align === 'center' ? 2000 : 2000, textAlign: align, fontFamily: MONO, fontSize: size, letterSpacing: `${spacing}em`, color, opacity: o, transform: `translateY(${(1 - o) * 8}px)` }}>{text}</div>;
  };

// Fine film grain over everything.
export const Grain: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <svg width={W} height={H} style={{ position: 'absolute', inset: 0, opacity: 0.06, pointerEvents: 'none' }}>
      <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={Math.floor(f / 2) % 12} /><feColorMatrix type="saturate" values="0" /></filter>
      <rect width={W} height={H} filter="url(#grain)" />
    </svg>
  );
};

export const LOGO_A = 'M53 11C38 12 8 26 5 40C2 46 7 50 14 51C10 46 14 37 21 31C31 22 44 17 55 15C58 14 58 10 53 11Z';
export const LOGO_B = 'M21 39C16 45 18 51 25 52C39 53 62 38 66 24C68 20 66 17 63 20C63 29 43 43 31 44C24 45 23 43 24 37Z';

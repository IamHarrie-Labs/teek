// Synthesizes every sound in the film so there is nothing to license.
// Writes 16-bit mono WAV files into public/sfx. Run with `npm run sounds`.
import { mkdir, writeFile } from 'node:fs/promises';

const RATE = 44100;
const TAU = Math.PI * 2;
const out = new URL('../public/sfx/', import.meta.url);

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  let peak = 0; for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const gain = peak > 0.98 ? 0.98 / peak : 1;
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s * gain)) * 32767), i * 2));
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8);
  head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(RATE, 24); head.writeUInt32LE(RATE * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}
const buf = (sec) => new Float32Array(Math.round(sec * RATE));
let seed = 1; const noise = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 2147483648 - 1; };
function lowpass(a, cutoff) { const rc = 1 / (TAU * cutoff), dt = 1 / RATE, k = dt / (rc + dt); let y = 0; for (let i = 0; i < a.length; i++) { y += k * (a[i] - y); a[i] = y; } return a; }
function highpass(a, cutoff) { const rc = 1 / (TAU * cutoff), dt = 1 / RATE, k = rc / (rc + dt); let y = 0, px = 0; for (let i = 0; i < a.length; i++) { const x = a[i]; y = k * (y + x - px); px = x; a[i] = y; } return a; }
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// The clock tick. Short, woody, precise.
function tick() { const a = buf(0.09); for (let i = 0; i < a.length; i++) { const t = i / RATE; a[i] = (Math.sin(TAU * 2400 * t) * 0.5 + Math.sin(TAU * 1250 * t) * 0.35 + noise() * 0.25) * Math.exp(-t * 90); } return highpass(a, 500); }

// The bot. A thin digital zip that sweeps up fast.
function zip() { const a = buf(0.16); let ph = 0; for (let i = 0; i < a.length; i++) { const t = i / RATE, f = 900 + 7000 * Math.pow(t / 0.16, 2); ph += TAU * f / RATE; const sq = Math.sign(Math.sin(ph)); a[i] = sq * 0.3 * Math.min(1, t * 300) * Math.exp(-t * 14); } return lowpass(highpass(a, 700), 9000); }

// People arriving. A soft plucked note, slightly detuned.
function pluck(note) { const a = buf(0.7), f = midi(note); for (let i = 0; i < a.length; i++) { const t = i / RATE, env = Math.min(1, t * 400) * Math.exp(-t * 7); a[i] = (Math.sin(TAU * f * t) + 0.4 * Math.sin(TAU * f * 2.003 * t) * Math.exp(-t * 12) + 0.2 * Math.sin(TAU * f * 0.998 * t)) * env * 0.5; } return lowpass(a, 3500); }

// Privacy. A muffled glassy swell.
function glass() { const a = buf(1.1), notes = [76, 83, 88]; for (let i = 0; i < a.length; i++) { const t = i / RATE, env = Math.sin(Math.PI * Math.min(1, t / 1.1)) ** 2; a[i] = notes.reduce((s, n, k) => s + Math.sin(TAU * midi(n) * t + k) * (0.35 - k * 0.08), 0) * env * 0.45 + noise() * 0.02 * env; } return lowpass(a, 2200); }

// The lock. A low, satisfying click with a little body.
function lock() { const a = buf(0.35); for (let i = 0; i < a.length; i++) { const t = i / RATE; a[i] = (noise() * Math.exp(-t * 160) * 0.6) + Math.sin(TAU * 95 * t) * Math.exp(-t * 18) * 0.8 + Math.sin(TAU * 190 * t) * Math.exp(-t * 30) * 0.3; } return lowpass(a, 4000); }

// Rewind. Tape spinning backwards into a dead stop.
function rewind() { const a = buf(1.0); let ph = 0; for (let i = 0; i < a.length; i++) { const t = i / RATE, f = 300 + 1400 * (1 - t) ** 2 + 60 * Math.sin(TAU * 9 * t); ph += TAU * f / RATE; a[i] = (Math.sin(ph) * 0.4 + noise() * 0.25) * Math.min(1, t * 30) * (t < 0.9 ? 1 : (1 - t) * 10); } return lowpass(highpass(a, 120), 5000); }

// The drop. Deep bass hit with a bright shimmer on top.
function drop() { const a = buf(4.5); for (let i = 0; i < a.length; i++) { const t = i / RATE, f = 48 + 60 * Math.exp(-t * 18); const bass = Math.sin(TAU * f * t) * Math.exp(-t * 0.9) * 0.9; const shimmer = [88, 91, 95, 100].reduce((s, n, k) => s + Math.sin(TAU * midi(n) * t + k * 1.7) * Math.exp(-t * (1.4 + k * 0.3)), 0) * 0.07; a[i] = bass + shimmer + noise() * Math.exp(-t * 40) * 0.25; } return lowpass(a, 9000); }

// The opening sound for shares. A warm cascade.
function cascade() { const a = buf(2.4), notes = [69, 72, 76, 79, 81, 84, 88]; notes.forEach((n, k) => { const start = Math.round(k * 0.11 * RATE), p = pluck(n); for (let i = 0; i < p.length && start + i < a.length; i++) a[start + i] += p[i] * 0.6; }); return a; }

// Logo landing. One clear chime.
function chime() { const a = buf(2.5), f = midi(81); for (let i = 0; i < a.length; i++) { const t = i / RATE; a[i] = (Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * f * 2.76 * t) * Math.exp(-t * 3) + 0.25 * Math.sin(TAU * f * 5.4 * t) * Math.exp(-t * 6)) * Math.min(1, t * 500) * Math.exp(-t * 1.6) * 0.4; } return a; }

// The bed. A warm pad and a soft pulse at 100 BPM, laid out on the film's timeline.
function bed() {
  const len = 61, a = buf(len), beat = 0.6;
  const chordA = [50, 57, 60, 64, 69], chordB = [53, 60, 64, 67, 72], chordC = [48, 55, 60, 64, 67, 71];
  const padAt = (t) => t < 11 ? null : t < 29.5 ? chordA : t < 30 ? null : t < 54 ? chordB : chordC;
  for (let i = 0; i < a.length; i++) {
    const t = i / RATE, chord = padAt(t);
    let s = noise() * 0.004; // room tone
    if (chord) {
      const fadeIn = t < 15 ? (t - 11) / 4 : t >= 30 && t < 31 ? (t - 30) : 1;
      const fadeOut = t > 27.5 && t < 29.5 ? (29.5 - t) / 2 : t > 57 ? Math.max(0, (60.5 - t) / 3.5) : 1;
      const lfo = 0.85 + 0.15 * Math.sin(TAU * 0.13 * t);
      s += chord.reduce((acc, n, k) => acc + Math.sin(TAU * midi(n) * t + k) * 0.5 + Math.sin(TAU * midi(n) * 1.004 * t) * 0.5, 0) * 0.045 * fadeIn * fadeOut * lfo;
    }
    const inPulse = (t >= 15 && t < 29.5) || (t >= 30 && t < 56);
    if (inPulse) {
      const bt = (t - 15) % beat, strong = t >= 30 ? 1 : 0.6;
      s += Math.sin(TAU * (52 + 40 * Math.exp(-bt * 30)) * bt) * Math.exp(-bt * 9) * 0.35 * strong;
      const half = (t - 15 + beat / 2) % beat; if (t >= 30) s += noise() * Math.exp(-half * 70) * 0.05;
    }
    if (t >= 30 && t < 56) s += Math.sin(TAU * midi(chordB[0] - 12) * t) * 0.12 * Math.min(1, t - 30) * (t > 54 ? (56 - t) / 2 : 1);
    a[i] = s;
  }
  return lowpass(a, 6000);
}

await mkdir(out, { recursive: true });
const files = { tick, zip, glass, lock, rewind, drop, cascade, chime, bed, 'pluck-low': () => pluck(67), 'pluck-mid': () => pluck(72), 'pluck-high': () => pluck(79), 'pluck-top': () => pluck(84) };
for (const [name, make] of Object.entries(files)) { await writeFile(new URL(`${name}.wav`, out), wav(make())); console.log(`wrote ${name}.wav`); }

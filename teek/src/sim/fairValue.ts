import { mulberry32 } from "../engine/prng";

/**
 * The "true" value of the traded asset over fine-grained sub-ticks. Mostly
 * drifts by small noise, but occasionally jumps — a news event. This exact
 * path is shared, unmodified, between the CLOB reference sim and the Teek
 * (batch) sim, so any PnL difference between them comes only from the
 * market structure, never from luck in the random draws.
 */
export function generateFairValuePath(
  subTicks: number,
  seed: number,
  start = 100
): number[] {
  const rng = mulberry32(seed);
  const path: number[] = [start];
  for (let i = 1; i < subTicks; i++) {
    let v = path[i - 1];
    v += (rng() - 0.5) * 0.15; // small continuous drift
    if (rng() < 0.04) {
      // a jump: the news event a fast reactor could try to exploit
      v += (rng() < 0.5 ? -1 : 1) * (1.5 + rng() * 2.5);
    }
    path.push(Math.round(v * 100) / 100);
  }
  return path;
}

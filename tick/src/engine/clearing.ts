import type { ClearResult, Fill, Order } from "./types";
import { mulberry32, seededShuffle } from "./prng";

/**
 * Expected allocation is exactly weight * available / total, so splitting an
 * order (one wallet or many) can't raise its expected fill. Mirrors
 * `pro_rata_dependent_round` in clearing.rs, including RNG draw order.
 */
export function proRataDependentRound(
  weights: number[],
  available: number,
  rng: () => number
): number[] {
  const total = weights.reduce((s, w) => s + BigInt(w), 0n);
  if (total === 0n) return weights.map(() => 0);

  const avail = BigInt(available);
  const alloc: bigint[] = [];
  const rems: bigint[] = [];
  let floored = 0n;
  for (const w of weights) {
    const num = BigInt(w) * avail;
    alloc.push(num / total);
    rems.push(num % total);
    floored += num / total;
  }
  const leftover = avail - floored;

  const walk = seededShuffle(
    weights.map((_, i) => i),
    rng
  );
  if (leftover === 0n) return alloc.map(Number);

  const nextU32 = () => BigInt(Math.floor(rng() * 4294967296));
  const hi = nextU32();
  const lo = nextU32();
  const offset = ((hi << 32n) | lo) % total;
  let cumulative = 0n;
  let handedOut = 0n;
  for (const idx of walk) {
    cumulative += rems[idx];
    let reached = 0n;
    if (cumulative > offset) {
      reached = (cumulative - offset + total - 1n) / total;
      if (reached > leftover) reached = leftover;
    }
    alloc[idx] += reached - handedOut;
    handedOut = reached;
  }
  return alloc.map(Number);
}

/**
 * Uniform-price call (batch) auction.
 *
 * Every order in the batch is invisible to every other order until this
 * function runs — that's enforced by the caller (orders only exist here
 * once the seal window has closed). All filled orders execute at the same
 * clearing price p*, regardless of how aggressive their own limit was.
 *
 * This is the mechanism that makes speed worthless within a batch: arriving
 * first, seeing others' orders, or reacting faster buys you nothing, because
 * price — not priority — is the only thing that determines who fills.
 */
export function clearBatch(orders: Order[], rngSeed: number): ClearResult {
  const buys = orders.filter((o) => o.side === "buy" && o.qty > 0);
  const sells = orders.filter((o) => o.side === "sell" && o.qty > 0);

  if (buys.length === 0 || sells.length === 0) {
    return { clearingPrice: null, matchedQty: 0, fills: [], rationed: [] };
  }

  // Candidate clearing prices: every distinct limit price in the batch.
  // The true optimum for a uniform-price call auction always lands on one
  // of the submitted limits.
  const candidates = Array.from(new Set(orders.map((o) => o.price))).sort(
    (a, b) => a - b
  );

  let best: { price: number; matched: number; imbalance: number }[] = [];
  let bestMatched = 0;

  for (const p of candidates) {
    const demand = buys
      .filter((o) => o.price >= p)
      .reduce((s, o) => s + o.qty, 0);
    const supply = sells
      .filter((o) => o.price <= p)
      .reduce((s, o) => s + o.qty, 0);
    const matched = Math.min(demand, supply);
    if (matched <= 0) continue;

    if (matched > bestMatched) {
      bestMatched = matched;
      best = [{ price: p, matched, imbalance: Math.abs(demand - supply) }];
    } else if (matched === bestMatched) {
      best.push({ price: p, matched, imbalance: Math.abs(demand - supply) });
    }
  }

  if (best.length === 0 || bestMatched <= 0) {
    return { clearingPrice: null, matchedQty: 0, fills: [], rationed: [] };
  }

  // Among prices that maximize matched volume, prefer the one that leaves
  // the smallest residual imbalance (closest to a "fair" midpoint). If a
  // tie remains, break it with the batch's random draw rather than always
  // picking (say) the lowest price — otherwise the clearing price itself
  // would be gameable by clustering orders at a favored tick.
  const minImbalance = Math.min(...best.map((b) => b.imbalance));
  const tied = best.filter((b) => b.imbalance === minImbalance);
  const rng = mulberry32(rngSeed);
  const clearingPrice =
    tied.length === 1
      ? tied[0].price
      : tied[Math.floor(rng() * tied.length)].price;

  const eligibleBuys = buys.filter((o) => o.price >= clearingPrice);
  const eligibleSells = sells.filter((o) => o.price <= clearingPrice);
  const demand = eligibleBuys.reduce((s, o) => s + o.qty, 0);
  const supply = eligibleSells.reduce((s, o) => s + o.qty, 0);
  const matchedQty = Math.min(demand, supply);

  const fills: Fill[] = [];
  const rationed: ClearResult["rationed"] = [];

  const allocate = (side: Order[], available: number) => {
    const qtys = proRataDependentRound(
      side.map((o) => o.qty),
      available,
      rng
    );
    side.forEach((order, i) => {
      if (qtys[i] > 0) {
        fills.push({
          orderId: order.id,
          trader: order.trader,
          side: order.side,
          qty: qtys[i],
          price: clearingPrice,
        });
      }
      if (qtys[i] < order.qty) {
        rationed.push({
          orderId: order.id,
          requestedQty: order.qty,
          filledQty: qtys[i],
        });
      }
    });
  };

  allocate(eligibleBuys, matchedQty);
  allocate(eligibleSells, matchedQty);

  return { clearingPrice, matchedQty, fills, rationed };
}

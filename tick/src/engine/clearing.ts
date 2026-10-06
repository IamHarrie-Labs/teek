import type { ClearResult, Fill, Order } from "./types";
import { mulberry32, seededShuffle } from "./prng";

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
    // Pro-rata by size, then a seeded random permutation assigns the
    // leftover indivisible unit(s) — this is the VRF's job once this runs
    // in the ER, so splitting one order into many can't game the rounding.
    const totalQty = side.reduce((s, o) => s + o.qty, 0);
    if (totalQty <= 0) return;

    const raw = side.map((o) => ({
      order: o,
      exact: (o.qty / totalQty) * available,
    }));
    let base = raw.map((r) => ({
      order: r.order,
      qty: Math.floor(r.exact),
      frac: r.exact - Math.floor(r.exact),
    }));
    let allocated = base.reduce((s, r) => s + r.qty, 0);
    let remainder = Math.round(available - allocated);

    // Rank by fractional remainder (largest-remainder method), tie-broken
    // by the seeded shuffle so equal fractions don't always favor the same
    // order id / submission order.
    const ranked = seededShuffle(base, rng).sort((a, b) => b.frac - a.frac);
    for (let i = 0; i < remainder && i < ranked.length; i++) {
      ranked[i].qty += 1;
    }

    for (const r of base) {
      if (r.qty > 0) {
        fills.push({
          orderId: r.order.id,
          trader: r.order.trader,
          side: r.order.side,
          qty: r.qty,
          price: clearingPrice,
        });
      }
      if (r.qty < r.order.qty) {
        rationed.push({
          orderId: r.order.id,
          requestedQty: r.order.qty,
          filledQty: r.qty,
        });
      }
    }
  };

  allocate(eligibleBuys, matchedQty);
  allocate(eligibleSells, matchedQty);

  return { clearingPrice, matchedQty, fills, rationed };
}

import { clearBatch } from "../engine/clearing";
import { mulberry32 } from "../engine/prng";
import type { Order } from "../engine/types";
import { makeQuote } from "./marketMaker";
import { NoiseTraders } from "./noiseTraders";

export interface BatchEvent {
  period: number;
  fairValueAtStart: number;
  clearingPrice: number | null;
  matchedQty: number;
  sniperFillQty: number;
  sniperSide: "buy" | "sell";
  /** A jump happened mid-window that a continuous venue's sniper could have
   *  hit — but here it lands after this batch has already sealed, so it
   *  only shows up once everyone (maker included) refreshes next period. */
  jumpMissedBySeal: boolean;
}

export interface BatchResult {
  events: BatchEvent[];
  pnlSeries: number[]; // cumulative sniper markout PnL, one per period
  finalPnl: number;
  totalFillQty: number;
}

/**
 * Tick's engine: every period, the maker, the noise traders, and the
 * sniper all act on the *same* fair value snapshot (taken at the period's
 * start) and submit into a single sealed batch. Nothing about anyone's
 * order is visible to anyone else — including the sniper's — until
 * `clearBatch` reveals one uniform price. A jump that happens mid-window
 * cannot be exploited by anyone: the batch that's already sealed doesn't
 * see it, and the *next* batch is seen by every participant, maker
 * included, at exactly the same instant. There is no gap for speed to buy.
 */
export function runBatchSim(
  fairValuePath: number[],
  periodSubTicks: number,
  spread: number,
  mmQty: number,
  sniperQty: number,
  noiseCount: number,
  rngSeed: number
): BatchResult {
  const numPeriods = Math.floor(fairValuePath.length / periodSubTicks);
  const noise = new NoiseTraders(noiseCount, mulberry32(rngSeed));
  // The sniper's own coin — deliberately independent of the fair-value
  // path and of the noise traders' RNG, so its side carries no signal at
  // all (real or accidental). It is exactly as blind as a market maker
  // guessing which way to skew inventory.
  const sniperCoin = mulberry32(rngSeed ^ 0x9e3779b9);
  const events: BatchEvent[] = [];
  const pnlSeries: number[] = [];
  let cumPnl = 0;
  let totalFillQty = 0;

  for (let p = 0; p < numPeriods; p++) {
    const startIdx = p * periodSubTicks;
    const endIdx = Math.min(startIdx + periodSubTicks, fairValuePath.length) - 1;
    const value = fairValuePath[startIdx];
    const settleValue = fairValuePath[endIdx];

    const quote = makeQuote(value, spread, mmQty);
    const orders: Order[] = [
      { id: `mm-bid-${p}`, trader: "market-maker", side: "buy", price: quote.bidPrice, qty: mmQty },
      { id: `mm-ask-${p}`, trader: "market-maker", side: "sell", price: quote.askPrice, qty: mmQty },
      ...noise.submit(value),
    ];

    // The sniper has no advance knowledge of this period's own jumps — it
    // guesses blind, exactly like a coin flip. It is priced and sized the
    // same as the market maker's own quote, so it competes on equal terms
    // rather than skewing the batch's own price-discovery by being an
    // outlier order.
    const sniperSide = sniperCoin() < 0.5 ? "buy" : "sell";
    const sniperPrice =
      sniperSide === "buy" ? quote.askPrice : quote.bidPrice;
    orders.push({
      id: `sniper-${p}`,
      trader: "sniper",
      side: sniperSide,
      price: sniperPrice,
      qty: sniperQty,
      isSniper: true,
    });

    const result = clearBatch(orders, rngSeed + p);
    const sniperFillQty = result.fills
      .filter((f) => f.trader === "sniper")
      .reduce((s, f) => s + f.qty, 0);

    if (result.clearingPrice !== null && sniperFillQty > 0) {
      const markout =
        sniperSide === "buy"
          ? (settleValue - result.clearingPrice) * sniperFillQty
          : (result.clearingPrice - settleValue) * sniperFillQty;
      cumPnl += markout;
      totalFillQty += sniperFillQty;
    }
    pnlSeries.push(cumPnl);

    let jumpMissedBySeal = false;
    for (let i = startIdx + 1; i <= endIdx; i++) {
      if (fairValuePath[i] > quote.askPrice || fairValuePath[i] < quote.bidPrice) {
        jumpMissedBySeal = true;
        break;
      }
    }

    events.push({
      period: p,
      fairValueAtStart: value,
      clearingPrice: result.clearingPrice,
      matchedQty: result.matchedQty,
      sniperFillQty,
      sniperSide,
      jumpMissedBySeal,
    });
  }

  return { events, pnlSeries, finalPnl: cumPnl, totalFillQty };
}

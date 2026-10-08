import { makeQuote, type Quote } from "./marketMaker";
import type { Side } from "../engine/types";

export interface ClobSnipeEvent {
  subTick: number;
  side: Side;
  price: number; // the stale MM price the sniper captured
  qty: number;
  trueValue: number; // fair value at the instant of the snipe
  pnl: number;
}

export interface ClobResult {
  snipes: ClobSnipeEvent[];
  pnlSeries: number[]; // cumulative sniper PnL, one entry per sub-tick
  finalPnl: number;
}

/**
 * Reference simulation: a continuous market where the market maker can
 * only refresh its quote once per period, but the sniper can react at any
 * sub-tick. The instant fair value jumps outside the maker's still-resting
 * quote, the sniper picks off the stale side before the maker gets a
 * chance to update — classic latency arbitrage / stale-quote sniping,
 * exactly the failure mode continuous limit order books are known for.
 */
export function runClobSim(
  fairValuePath: number[],
  periodSubTicks: number,
  spread: number,
  mmQty: number,
  sniperQty: number
): ClobResult {
  const snipes: ClobSnipeEvent[] = [];
  const pnlSeries: number[] = [];
  let cumPnl = 0;
  let quote: Quote = makeQuote(fairValuePath[0], spread, mmQty);

  for (let i = 0; i < fairValuePath.length; i++) {
    if (i % periodSubTicks === 0) {
      // Market maker refreshes — but only this often, same cadence a Teek
      // maker would use. The gap between refreshes is the vulnerability.
      quote = makeQuote(fairValuePath[i], spread, mmQty);
    }

    const value = fairValuePath[i];
    if (value > quote.askPrice && quote.askQtyRemaining > 0) {
      const qty = Math.min(sniperQty, quote.askQtyRemaining);
      const pnl = (value - quote.askPrice) * qty;
      quote.askQtyRemaining -= qty;
      cumPnl += pnl;
      snipes.push({ subTick: i, side: "buy", price: quote.askPrice, qty, trueValue: value, pnl });
    } else if (value < quote.bidPrice && quote.bidQtyRemaining > 0) {
      const qty = Math.min(sniperQty, quote.bidQtyRemaining);
      const pnl = (quote.bidPrice - value) * qty;
      quote.bidQtyRemaining -= qty;
      cumPnl += pnl;
      snipes.push({ subTick: i, side: "sell", price: quote.bidPrice, qty, trueValue: value, pnl });
    }

    pnlSeries.push(cumPnl);
  }

  return { snipes, pnlSeries, finalPnl: cumPnl };
}

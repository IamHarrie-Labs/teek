/** A resting two-sided quote, centered on a belief about fair value. */
export interface Quote {
  bidPrice: number;
  askPrice: number;
  bidQtyRemaining: number;
  askQtyRemaining: number;
}

/**
 * A liquidity provider that can only refresh its quote once per period
 * (matching the CLOB's or Teek's decision cadence) — it is not infinitely
 * fast either. What differs between the two venues is not the market
 * maker's speed, but whether anyone *else* gets to react faster than that
 * refresh cadence within the period.
 */
export function makeQuote(fairValue: number, spread: number, qty: number): Quote {
  return {
    bidPrice: Math.round((fairValue - spread / 2) * 100) / 100,
    askPrice: Math.round((fairValue + spread / 2) * 100) / 100,
    bidQtyRemaining: qty,
    askQtyRemaining: qty,
  };
}

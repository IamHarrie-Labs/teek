export type Side = "buy" | "sell";

export interface Order {
  id: string;
  trader: string;
  side: Side;
  /** Limit price. Buy fills only at price <= limit; sell fills only at price >= limit. */
  price: number;
  qty: number;
  /** True for the sniper — used only by the sim/UI, the engine treats it identically. */
  isSniper?: boolean;
}

export interface Fill {
  orderId: string;
  trader: string;
  side: Side;
  qty: number;
  price: number; // always the uniform clearing price
}

export interface ClearResult {
  clearingPrice: number | null; // null if no cross (no trade this batch)
  matchedQty: number;
  fills: Fill[];
  /** Orders that were eligible at the clearing price but rationed out entirely or partially. */
  rationed: { orderId: string; requestedQty: number; filledQty: number }[];
}

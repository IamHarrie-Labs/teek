import type { Order, Side } from "../engine/types";

let seq = 0;
const nextId = () => `npc-o${++seq}`;

/**
 * Ordinary traders who submit sealed orders around a fair value every
 * batch — their job is just to make sure the room is never empty. A judge
 * opening the URL should see a live, crossing market immediately.
 */
export class NoiseTraders {
  constructor(
    private count: number,
    private rng: () => number
  ) {}

  submit(fairValue: number): Order[] {
    const orders: Order[] = [];
    for (let i = 0; i < this.count; i++) {
      const side: Side = this.rng() < 0.5 ? "buy" : "sell";
      const edge = 0.5 + this.rng() * 3;
      const price =
        side === "buy"
          ? Math.round((fairValue + edge) * 100) / 100
          : Math.round((fairValue - edge) * 100) / 100;
      const qty = 1 + Math.floor(this.rng() * 4);
      orders.push({ id: nextId(), trader: `npc-${i}`, side, price, qty });
    }
    return orders;
  }
}

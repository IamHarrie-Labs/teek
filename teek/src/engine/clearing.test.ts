import { describe, expect, it } from "vitest";
import { clearBatch } from "./clearing";
import type { Order } from "./types";

const o = (
  id: string,
  side: "buy" | "sell",
  price: number,
  qty: number
): Order => ({ id, trader: id, side, price, qty });

describe("clearBatch", () => {
  it("returns no trade when there is no cross", () => {
    const orders = [o("b1", "buy", 90, 10), o("s1", "sell", 100, 10)];
    const r = clearBatch(orders, 1);
    expect(r.clearingPrice).toBeNull();
    expect(r.fills).toHaveLength(0);
  });

  it("clears simple crossing orders at a single uniform price", () => {
    const orders = [o("b1", "buy", 100, 10), o("s1", "sell", 90, 10)];
    const r = clearBatch(orders, 1);
    expect(r.clearingPrice).not.toBeNull();
    expect(r.matchedQty).toBe(10);
    // Every fill must be at exactly the same price.
    const prices = new Set(r.fills.map((f) => f.price));
    expect(prices.size).toBe(1);
  });

  it("never fills a buy above its limit or a sell below its limit", () => {
    const orders = [
      o("b1", "buy", 105, 5),
      o("b2", "buy", 95, 5),
      o("s1", "sell", 90, 5),
      o("s2", "sell", 100, 5),
    ];
    const r = clearBatch(orders, 42);
    for (const f of r.fills) {
      const src = orders.find((x) => x.id === f.orderId)!;
      if (src.side === "buy") expect(f.price).toBeLessThanOrEqual(src.price);
      else expect(f.price).toBeGreaterThanOrEqual(src.price);
    }
  });

  it("conserves quantity: total buy fills equal total sell fills", () => {
    const orders = [
      o("b1", "buy", 110, 7),
      o("b2", "buy", 105, 3),
      o("s1", "sell", 95, 4),
      o("s2", "sell", 100, 4),
    ];
    const r = clearBatch(orders, 7);
    const buyQty = r.fills
      .filter((f) => f.side === "buy")
      .reduce((s, f) => s + f.qty, 0);
    const sellQty = r.fills
      .filter((f) => f.side === "sell")
      .reduce((s, f) => s + f.qty, 0);
    expect(buyQty).toBe(sellQty);
    expect(buyQty).toBe(r.matchedQty);
  });

  it("rations pro-rata when one side has excess volume at the clearing price", () => {
    // 3 buyers want 10 each at 100 (30 total demand), only 10 available.
    const orders = [
      o("b1", "buy", 100, 10),
      o("b2", "buy", 100, 10),
      o("b3", "buy", 100, 10),
      o("s1", "sell", 100, 10),
    ];
    const r = clearBatch(orders, 3);
    expect(r.matchedQty).toBe(10);
    const buyFills = r.fills.filter((f) => f.side === "buy");
    // Every buyer gets a slice, nobody gets zero, nobody gets all 10.
    expect(buyFills.length).toBe(3);
    for (const f of buyFills) expect(f.qty).toBeGreaterThan(0);
    const total = buyFills.reduce((s, f) => s + f.qty, 0);
    expect(total).toBe(10);
  });

  const meanBuyFill = (orders: Order[], traders: string[], runs: number) => {
    let sum = 0;
    for (let seed = 0; seed < runs; seed++) {
      sum += clearBatch(orders, seed)
        .fills.filter((f) => f.side === "buy" && traders.includes(f.trader))
        .reduce((s, f) => s + f.qty, 0);
    }
    return sum / runs;
  };

  it("does not raise expected fill when an order is split against a rival", () => {
    // Largest-remainder rounding failed this case: whole, Alice expected 1; split 1+1, 4/3.
    const supply = o("s", "sell", 100, 2);
    const whole = [{ ...o("a", "buy", 100, 2), trader: "alice" }, o("bob", "buy", 100, 1), supply];
    const split = [
      { ...o("a1", "buy", 100, 1), trader: "alice" },
      { ...o("a2", "buy", 100, 1), trader: "alice" },
      o("bob", "buy", 100, 1),
      supply,
    ];
    const exact = (2 * 2) / 3;
    expect(Math.abs(meanBuyFill(whole, ["alice"], 20_000) - exact)).toBeLessThan(0.02);
    expect(Math.abs(meanBuyFill(split, ["alice"], 20_000) - exact)).toBeLessThan(0.02);
  });

  it("does not raise expected fill when an order is split across wallets", () => {
    const supply = o("s", "sell", 100, 7);
    const rivals = [o("r1", "buy", 100, 5), o("r2", "buy", 100, 4)];
    const whole = [o("w", "buy", 100, 6), supply, ...rivals];
    const sybil = [o("x1", "buy", 100, 1), o("x2", "buy", 100, 2), o("x3", "buy", 100, 3), supply, ...rivals];
    const exact = (6 * 7) / 15;
    expect(Math.abs(meanBuyFill(whole, ["w"], 20_000) - exact)).toBeLessThan(0.03);
    expect(Math.abs(meanBuyFill(sybil, ["x1", "x2", "x3"], 20_000) - exact)).toBeLessThan(0.03);
  });

  it("keeps token-scale fills within one unit of the exact share", () => {
    // A case where the old floating-point shares mis-floored an order.
    const qtys = [784037692694984, 1850254371174829, 1878154867246378, 434775631019738, 1684946552318898];
    const available = 5410710769053579;
    const total = qtys.reduce((s, q) => s + BigInt(q), 0n);
    const orders = [...qtys.map((q, i) => o(`b${i}`, "buy", 100, q)), o("s", "sell", 100, available)];
    for (let seed = 0; seed < 50; seed++) {
      const r = clearBatch(orders, seed);
      const buys = r.fills.filter((f) => f.side === "buy");
      expect(buys.reduce((s, f) => s + BigInt(f.qty), 0n)).toBe(BigInt(available));
      qtys.forEach((q, i) => {
        const floor = (BigInt(q) * BigInt(available)) / total;
        const got = BigInt(buys.find((f) => f.orderId === `b${i}`)?.qty ?? 0);
        expect(got === floor || got === floor + 1n).toBe(true);
      });
    }
  });

  it("matches the Rust engine for the same seed", () => {
    // Same vector and expected fills as clearing.rs.
    const qtys = [7, 3, 5, 11, 2, 9];
    const orders = [...qtys.map((q, i) => o(`b${i}`, "buy", 100, q)), o("s", "sell", 100, 13)];
    const cases: [number, number[]][] = [
      [4242, [2, 1, 2, 4, 1, 3]],
      [7, [2, 1, 1, 4, 1, 4]],
      [123456, [3, 1, 2, 3, 1, 3]],
    ];
    for (const [seed, expected] of cases) {
      const r = clearBatch(orders, seed);
      expect(qtys.map((_, i) => r.fills.find((f) => f.orderId === `b${i}`)?.qty ?? 0)).toEqual(expected);
    }
  });

  it("changes nothing when there is no rival to take units from", () => {
    // Same total demand (30), split into 1 order vs 10 small ones, same seed.
    const supply = [o("s1", "sell", 100, 10)];
    const whole = [o("big", "buy", 100, 30), ...supply];
    const split = [
      ...Array.from({ length: 10 }, (_, i) =>
        o(`small${i}`, "buy", 100, 3)
      ),
      ...supply,
    ];
    const rWhole = clearBatch(whole, 5);
    const rSplit = clearBatch(split, 5);
    // Total allocated to the "buy side" is identical either way — splitting
    // does not win more aggregate quantity than staying whole.
    const wholeQty = rWhole.fills
      .filter((f) => f.side === "buy")
      .reduce((s, f) => s + f.qty, 0);
    const splitQty = rSplit.fills
      .filter((f) => f.side === "buy")
      .reduce((s, f) => s + f.qty, 0);
    expect(wholeQty).toBe(splitQty);
    expect(wholeQty).toBe(10);
  });

  it("is deterministic for a given seed", () => {
    const orders = [
      o("b1", "buy", 100, 10),
      o("b2", "buy", 100, 10),
      o("s1", "sell", 100, 15),
    ];
    const r1 = clearBatch(orders, 999);
    const r2 = clearBatch(orders, 999);
    expect(r1).toEqual(r2);
  });

  it("handles an empty batch and a one-sided batch without throwing", () => {
    expect(clearBatch([], 1).clearingPrice).toBeNull();
    expect(clearBatch([o("b1", "buy", 100, 5)], 1).clearingPrice).toBeNull();
    expect(clearBatch([o("s1", "sell", 100, 5)], 1).clearingPrice).toBeNull();
  });
});

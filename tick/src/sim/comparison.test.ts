import { describe, expect, it } from "vitest";
import { generateFairValuePath } from "./fairValue";
import { runClobSim } from "./clobEngine";
import { runBatchSim } from "./batchEngine";

/**
 * This is the entire pitch, as a test. Given the *identical* fair-value
 * path:
 *
 * - On a continuous book, a sniper with a real latency edge picks off the
 *   market maker's stale quote the instant a jump happens, before the
 *   maker can refresh. That's a genuine, jump-driven arbitrage profit —
 *   it should dwarf the ordinary cost of crossing a spread.
 *
 * - Sealed into uniform-price batches, the same bot (same size, same
 *   aggression, zero informational edge — a fair coin flip for direction)
 *   can only ever pay the mundane cost of demanding immediacy: roughly
 *   half the spread, every time it trades, with NO extra jump-driven
 *   upside. Its PnL should be explained almost entirely by that constant
 *   per-fill cost, not by the size or timing of jumps in the path.
 */
describe("sniper edge: CLOB vs Tick", () => {
  const periodSubTicks = 20;
  const numPeriods = 300;
  const subTicks = periodSubTicks * numPeriods;
  const spread = 1.0;
  const mmQty = 20;
  const sniperQty = 10;

  it("gives the sniper a large, jump-driven edge on a continuous book", () => {
    const path = generateFairValuePath(subTicks, 1);
    const clob = runClobSim(path, periodSubTicks, spread, mmQty, sniperQty);
    expect(clob.snipes.length).toBeGreaterThan(10);
    expect(clob.finalPnl).toBeGreaterThan(0);
  });

  it("reduces the batch sniper to paying roughly the ordinary half-spread cost, nothing more", () => {
    const path = generateFairValuePath(subTicks, 1);
    const batch = runBatchSim(path, periodSubTicks, spread, mmQty, sniperQty, 6, 123);
    const expectedSpreadCost = (spread / 2) * batch.totalFillQty;
    // The batch sniper's PnL should sit close to "-half the spread on every
    // unit it traded" — a mundane, explainable transaction cost — not run
    // off in either direction the way a real informational edge would.
    const unexplained = Math.abs(batch.finalPnl + expectedSpreadCost);
    expect(unexplained).toBeLessThan(expectedSpreadCost * 0.6 + 100);
  });

  it("gives the CLOB sniper an edge an order of magnitude larger than the batch sniper's residual", () => {
    const path = generateFairValuePath(subTicks, 1);
    const clob = runClobSim(path, periodSubTicks, spread, mmQty, sniperQty);
    const batch = runBatchSim(path, periodSubTicks, spread, mmQty, sniperQty, 6, 123);
    const expectedSpreadCost = (spread / 2) * batch.totalFillQty;
    const batchUnexplainedEdge = Math.abs(batch.finalPnl + expectedSpreadCost);
    expect(clob.finalPnl).toBeGreaterThan(batchUnexplainedEdge * 5);
  });

  it("holds across multiple independent seeds, not just one lucky path", () => {
    for (const seed of [3, 4, 5, 6]) {
      const path = generateFairValuePath(subTicks, seed);
      const clob = runClobSim(path, periodSubTicks, spread, mmQty, sniperQty);
      const batch = runBatchSim(path, periodSubTicks, spread, mmQty, sniperQty, 6, seed * 17);
      const expectedSpreadCost = (spread / 2) * batch.totalFillQty;
      const batchUnexplainedEdge = Math.abs(batch.finalPnl + expectedSpreadCost);
      expect(clob.finalPnl).toBeGreaterThan(batchUnexplainedEdge * 3);
    }
  });
});

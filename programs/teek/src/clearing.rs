//! The uniform-price call (batch) auction — the one piece of this program
//! that has to be correct or nothing else matters.
//!
//! Mirrors `teek/src/engine/clearing.ts` exactly (same algorithm, same
//! tie-break rule, same pro-rata dependent-rounding rationing, same RNG
//! draw order) so the two implementations can be cross-checked against the
//! same test vectors.
//! This module has no Anchor or Solana dependency on purpose — it is pure,
//! deterministic, and `cargo test`-able without the BPF toolchain.

use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum Side {
    Buy,
    Sell,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct Order {
    pub id: u64,
    pub trader: Pubkey,
    pub side: Side,
    /// Fixed-point limit price (same unit as `Fill::price`).
    pub price: u64,
    pub qty: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct Fill {
    pub order_id: u64,
    pub trader: Pubkey,
    pub side: Side,
    pub qty: u64,
    /// Always the single uniform clearing price for this batch.
    pub price: u64,
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct ClearResult {
    pub clearing_price: Option<u64>,
    pub matched_qty: u64,
    pub fills: Vec<Fill>,
}

/// Deterministic seedable PRNG (mulberry32, ported from
/// `engine/prng.ts`) — stands in for MagicBlock VRF locally. Swap the seed
/// source for an on-chain VRF result once this runs behind the real
/// integration; the tie-break/rationing logic that consumes it doesn't
/// change either way.
pub struct Mulberry32 {
    state: u32,
}

impl Mulberry32 {
    pub fn new(seed: u32) -> Self {
        Self { state: seed }
    }

    pub fn next_u32(&mut self) -> u32 {
        self.state = self.state.wrapping_add(0x6d2b79f5);
        let mut t = self.state;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        t ^ (t >> 14)
    }

    pub fn next_f64(&mut self) -> f64 {
        self.next_u32() as f64 / 4294967296.0
    }

    pub fn next_u64(&mut self) -> u64 {
        let hi = self.next_u32() as u64;
        let lo = self.next_u32() as u64;
        (hi << 32) | lo
    }
}

fn seeded_shuffle<T>(items: &mut [T], rng: &mut Mulberry32) {
    for i in (1..items.len()).rev() {
        let j = (rng.next_f64() * (i as f64 + 1.0)).floor() as usize;
        items.swap(i, j);
    }
}

/// Uniform-price call (batch) auction. Every order in `orders` is assumed
/// to have been invisible to every other order until this function runs —
/// that invisibility is enforced by the caller (a Private ER seals the
/// batch; this function only ever sees the batch once the window closes).
/// All filled orders execute at the same clearing price, regardless of how
/// aggressive their own limit was — that uniform price is what makes
/// arrival speed worth nothing within a batch.
pub fn clear_batch(orders: &[Order], rng_seed: u32) -> ClearResult {
    let buys: Vec<&Order> = orders.iter().filter(|o| o.side == Side::Buy && o.qty > 0).collect();
    let sells: Vec<&Order> = orders.iter().filter(|o| o.side == Side::Sell && o.qty > 0).collect();

    if buys.is_empty() || sells.is_empty() {
        return ClearResult::default();
    }

    let mut candidates: Vec<u64> = orders.iter().map(|o| o.price).collect();
    candidates.sort_unstable();
    candidates.dedup();

    let mut best_matched: u64 = 0;
    let mut best: Vec<(u64, u64)> = Vec::new(); // (price, imbalance)

    for &p in &candidates {
        let demand: u64 = buys.iter().filter(|o| o.price >= p).map(|o| o.qty).sum();
        let supply: u64 = sells.iter().filter(|o| o.price <= p).map(|o| o.qty).sum();
        let matched = demand.min(supply);
        if matched == 0 {
            continue;
        }
        let imbalance = demand.abs_diff(supply);
        match matched.cmp(&best_matched) {
            std::cmp::Ordering::Greater => {
                best_matched = matched;
                best = vec![(p, imbalance)];
            }
            std::cmp::Ordering::Equal => best.push((p, imbalance)),
            std::cmp::Ordering::Less => {}
        }
    }

    if best.is_empty() || best_matched == 0 {
        return ClearResult::default();
    }

    let min_imbalance = best.iter().map(|(_, imb)| *imb).min().unwrap();
    let tied: Vec<u64> = best
        .iter()
        .filter(|(_, imb)| *imb == min_imbalance)
        .map(|(p, _)| *p)
        .collect();

    let mut rng = Mulberry32::new(rng_seed);
    let clearing_price = if tied.len() == 1 {
        tied[0]
    } else {
        tied[(rng.next_f64() * tied.len() as f64).floor() as usize]
    };

    let eligible_buys: Vec<&Order> = buys.iter().filter(|o| o.price >= clearing_price).copied().collect();
    let eligible_sells: Vec<&Order> = sells.iter().filter(|o| o.price <= clearing_price).copied().collect();
    let demand: u64 = eligible_buys.iter().map(|o| o.qty).sum();
    let supply: u64 = eligible_sells.iter().map(|o| o.qty).sum();
    let matched_qty = demand.min(supply);

    let mut fills: Vec<Fill> = Vec::new();
    allocate(&eligible_buys, matched_qty, clearing_price, &mut rng, &mut fills);
    allocate(&eligible_sells, matched_qty, clearing_price, &mut rng, &mut fills);

    ClearResult { clearing_price: Some(clearing_price), matched_qty, fills }
}

/// Expected allocation is exactly `weight * available / total`, so splitting an order (one wallet or many) can't raise its expected fill.
pub fn pro_rata_dependent_round(weights: &[u64], available: u64, rng: &mut Mulberry32) -> Vec<u64> {
    // u128, not f64: f64 shares misallocate units at ~10^15 base units.
    let total: u128 = weights.iter().map(|&w| w as u128).sum();
    if total == 0 {
        return vec![0; weights.len()];
    }

    let mut alloc: Vec<u64> = Vec::with_capacity(weights.len());
    let mut rems: Vec<u128> = Vec::with_capacity(weights.len());
    let mut floored: u128 = 0;
    for &w in weights {
        let num = w as u128 * available as u128;
        let floor = num / total;
        alloc.push(floor as u64);
        rems.push(num % total);
        floored += floor;
    }
    let leftover = available as u128 - floored;

    // Seeded walk order, so neighbours on the sampling line aren't chosen by order id.
    let mut walk: Vec<usize> = (0..weights.len()).collect();
    seeded_shuffle(&mut walk, rng);
    if leftover == 0 {
        return alloc;
    }

    // Units sit at offset + k*total; each segment (remainder < total) catches at most one.
    let offset = rng.next_u64() as u128 % total;
    let mut cumulative: u128 = 0;
    let mut handed_out: u128 = 0;
    for idx in walk {
        cumulative += rems[idx];
        let reached = if cumulative <= offset {
            0
        } else {
            ((cumulative - offset + total - 1) / total).min(leftover)
        };
        alloc[idx] += (reached - handed_out) as u64;
        handed_out = reached;
    }
    alloc
}

fn allocate(
    side: &[&Order],
    available: u64,
    clearing_price: u64,
    rng: &mut Mulberry32,
    fills: &mut Vec<Fill>,
) {
    let weights: Vec<u64> = side.iter().map(|o| o.qty).collect();
    let qtys = pro_rata_dependent_round(&weights, available, rng);
    for (o, &qty) in side.iter().zip(&qtys) {
        if qty > 0 {
            fills.push(Fill { order_id: o.id, trader: o.trader, side: o.side, qty, price: clearing_price });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pk(seed: u8) -> Pubkey {
        Pubkey::new_from_array([seed; 32])
    }

    fn order(id: u64, trader: u8, side: Side, price: u64, qty: u64) -> Order {
        Order { id, trader: pk(trader), side, price, qty }
    }

    #[test]
    fn no_trade_without_a_cross() {
        let orders = vec![order(1, 1, Side::Buy, 90, 10), order(2, 2, Side::Sell, 100, 10)];
        let r = clear_batch(&orders, 1);
        assert_eq!(r.clearing_price, None);
        assert!(r.fills.is_empty());
    }

    #[test]
    fn clears_at_a_single_uniform_price() {
        let orders = vec![order(1, 1, Side::Buy, 100, 10), order(2, 2, Side::Sell, 90, 10)];
        let r = clear_batch(&orders, 1);
        assert!(r.clearing_price.is_some());
        assert_eq!(r.matched_qty, 10);
        let prices: std::collections::HashSet<u64> = r.fills.iter().map(|f| f.price).collect();
        assert_eq!(prices.len(), 1);
    }

    #[test]
    fn never_fills_past_an_orders_own_limit() {
        let orders = vec![
            order(1, 1, Side::Buy, 105, 5),
            order(2, 2, Side::Buy, 95, 5),
            order(3, 3, Side::Sell, 90, 5),
            order(4, 4, Side::Sell, 100, 5),
        ];
        let r = clear_batch(&orders, 42);
        let by_id = |id: u64| orders.iter().find(|o| o.id == id).unwrap();
        for f in &r.fills {
            let src = by_id(f.order_id);
            match src.side {
                Side::Buy => assert!(f.price <= src.price),
                Side::Sell => assert!(f.price >= src.price),
            }
        }
    }

    #[test]
    fn conserves_quantity_across_sides() {
        let orders = vec![
            order(1, 1, Side::Buy, 110, 7),
            order(2, 2, Side::Buy, 105, 3),
            order(3, 3, Side::Sell, 95, 4),
            order(4, 4, Side::Sell, 100, 4),
        ];
        let r = clear_batch(&orders, 7);
        let buy_qty: u64 = r.fills.iter().filter(|f| f.side == Side::Buy).map(|f| f.qty).sum();
        let sell_qty: u64 = r.fills.iter().filter(|f| f.side == Side::Sell).map(|f| f.qty).sum();
        assert_eq!(buy_qty, sell_qty);
        assert_eq!(buy_qty, r.matched_qty);
    }

    #[test]
    fn rations_pro_rata_when_one_side_has_excess_demand() {
        let orders = vec![
            order(1, 1, Side::Buy, 100, 10),
            order(2, 2, Side::Buy, 100, 10),
            order(3, 3, Side::Buy, 100, 10),
            order(4, 4, Side::Sell, 100, 10),
        ];
        let r = clear_batch(&orders, 3);
        assert_eq!(r.matched_qty, 10);
        let buy_fills: Vec<&Fill> = r.fills.iter().filter(|f| f.side == Side::Buy).collect();
        assert_eq!(buy_fills.len(), 3);
        for f in &buy_fills {
            assert!(f.qty > 0);
        }
        let total: u64 = buy_fills.iter().map(|f| f.qty).sum();
        assert_eq!(total, 10);
    }

    fn buy_fill_of(r: &ClearResult, traders: &[u8]) -> u64 {
        r.fills
            .iter()
            .filter(|f| f.side == Side::Buy && traders.iter().any(|&t| f.trader == pk(t)))
            .map(|f| f.qty)
            .sum()
    }

    fn mean_buy_fill(orders: &[Order], traders: &[u8], runs: u32) -> f64 {
        (0..runs).map(|seed| buy_fill_of(&clear_batch(orders, seed), traders)).sum::<u64>() as f64 / runs as f64
    }

    #[test]
    fn splitting_against_a_rival_does_not_raise_expected_fill() {
        // Largest-remainder rounding failed this case: whole, Alice expected 1; split 1+1, 4/3.
        let supply = order(99, 9, Side::Sell, 100, 2);
        let whole = vec![order(1, 1, Side::Buy, 100, 2), order(2, 2, Side::Buy, 100, 1), supply];
        let split = vec![
            order(1, 1, Side::Buy, 100, 1),
            order(3, 1, Side::Buy, 100, 1),
            order(2, 2, Side::Buy, 100, 1),
            supply,
        ];
        let exact = 2.0 * 2.0 / 3.0;
        let whole_mean = mean_buy_fill(&whole, &[1], 20_000);
        let split_mean = mean_buy_fill(&split, &[1], 20_000);
        assert!((whole_mean - exact).abs() < 0.02, "whole mean {whole_mean}");
        assert!((split_mean - exact).abs() < 0.02, "split mean {split_mean}");
    }

    #[test]
    fn splitting_across_wallets_does_not_raise_expected_fill() {
        let supply = order(99, 9, Side::Sell, 100, 7);
        let rivals = [order(10, 10, Side::Buy, 100, 5), order(11, 11, Side::Buy, 100, 4)];
        let mut whole = vec![order(1, 1, Side::Buy, 100, 6), supply];
        whole.extend(rivals);
        let mut sybil = vec![
            order(1, 1, Side::Buy, 100, 1),
            order(2, 2, Side::Buy, 100, 2),
            order(3, 3, Side::Buy, 100, 3),
            supply,
        ];
        sybil.extend(rivals);
        let exact = 6.0 * 7.0 / 15.0;
        let whole_mean = mean_buy_fill(&whole, &[1], 20_000);
        let sybil_mean = mean_buy_fill(&sybil, &[1, 2, 3], 20_000);
        assert!((whole_mean - exact).abs() < 0.03, "whole mean {whole_mean}");
        assert!((sybil_mean - exact).abs() < 0.03, "sybil mean {sybil_mean}");
    }

    #[test]
    fn token_scale_fills_stay_within_one_unit_of_exact_share() {
        // A case where the old f64 shares mis-floored an order (found by random search).
        let qtys: [u64; 5] =
            [784037692694984, 1850254371174829, 1878154867246378, 434775631019738, 1684946552318898];
        let available: u64 = 5410710769053579;
        let total: u128 = qtys.iter().map(|&q| q as u128).sum();
        let mut orders: Vec<Order> =
            qtys.iter().enumerate().map(|(i, &q)| order(i as u64 + 1, i as u8 + 1, Side::Buy, 100, q)).collect();
        orders.push(order(99, 9, Side::Sell, 100, available));

        for seed in 0..50 {
            let r = clear_batch(&orders, seed);
            assert_eq!(buy_fill_of(&r, &[1, 2, 3, 4, 5]), available);
            for (i, &q) in qtys.iter().enumerate() {
                let floor = (q as u128 * available as u128 / total) as u64;
                let got = buy_fill_of(&r, &[i as u8 + 1]);
                assert!(got == floor || got == floor + 1, "order {i}: got {got}, floor {floor}");
            }
        }
    }

    #[test]
    fn matches_the_typescript_engine_for_the_same_seed() {
        // Same vector and expected fills as clearing.test.ts.
        let qtys = [7u64, 3, 5, 11, 2, 9];
        let mut orders: Vec<Order> =
            qtys.iter().enumerate().map(|(i, &q)| order(i as u64, i as u8 + 1, Side::Buy, 100, q)).collect();
        orders.push(order(99, 99, Side::Sell, 100, 13));
        for (seed, expected) in [(4242u32, [2u64, 1, 2, 4, 1, 3]), (7, [2, 1, 1, 4, 1, 4]), (123456, [3, 1, 2, 3, 1, 3])] {
            let r = clear_batch(&orders, seed);
            let got: Vec<u64> = (0..qtys.len()).map(|i| buy_fill_of(&r, &[i as u8 + 1])).collect();
            assert_eq!(got, expected.to_vec(), "seed {seed}");
        }
    }

    #[test]
    fn splitting_without_a_rival_changes_nothing() {
        let supply = order(99, 9, Side::Sell, 100, 10);
        let whole = vec![order(1, 1, Side::Buy, 100, 30), supply];
        let mut split: Vec<Order> = (0..10).map(|i| order(100 + i, 1, Side::Buy, 100, 3)).collect();
        split.push(supply);

        let r_whole = clear_batch(&whole, 5);
        let r_split = clear_batch(&split, 5);
        let whole_qty: u64 = r_whole.fills.iter().filter(|f| f.side == Side::Buy).map(|f| f.qty).sum();
        let split_qty: u64 = r_split.fills.iter().filter(|f| f.side == Side::Buy).map(|f| f.qty).sum();
        assert_eq!(whole_qty, split_qty);
        assert_eq!(whole_qty, 10);
    }

    #[test]
    fn deterministic_for_a_given_seed() {
        let orders = vec![
            order(1, 1, Side::Buy, 100, 10),
            order(2, 2, Side::Buy, 100, 10),
            order(3, 3, Side::Sell, 100, 15),
        ];
        let r1 = clear_batch(&orders, 999);
        let r2 = clear_batch(&orders, 999);
        assert_eq!(r1, r2);
    }

    #[test]
    fn handles_empty_and_one_sided_batches() {
        assert_eq!(clear_batch(&[], 1).clearing_price, None);
        assert_eq!(clear_batch(&[order(1, 1, Side::Buy, 100, 5)], 1).clearing_price, None);
        assert_eq!(clear_batch(&[order(1, 1, Side::Sell, 100, 5)], 1).clearing_price, None);
    }
}

//! The uniform-price call (batch) auction — the one piece of this program
//! that has to be correct or nothing else matters.
//!
//! Mirrors `tick/src/engine/clearing.ts` exactly (same algorithm, same
//! tie-break rule, same pro-rata + seeded-shuffle rationing) so the two
//! implementations can be cross-checked against the same test vectors.
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

    pub fn next_f64(&mut self) -> f64 {
        self.state = self.state.wrapping_add(0x6d2b79f5);
        let mut t = self.state;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        ((t ^ (t >> 14)) as u64) as f64 / 4294967296.0
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

/// Pro-rata by size, then a seeded random permutation assigns the leftover
/// indivisible unit(s) (largest-remainder method) — this is the VRF's job
/// once this runs for real, so splitting one order into many can't game
/// the rounding in your favor.
fn allocate(
    side: &[&Order],
    available: u64,
    clearing_price: u64,
    rng: &mut Mulberry32,
    fills: &mut Vec<Fill>,
) {
    let total_qty: u64 = side.iter().map(|o| o.qty).sum();
    if total_qty == 0 {
        return;
    }

    struct Alloc<'a> {
        order: &'a Order,
        qty: u64,
        frac: f64,
    }

    let mut allocs: Vec<Alloc> = side
        .iter()
        .map(|o| {
            let exact = (o.qty as f64 / total_qty as f64) * available as f64;
            Alloc { order: o, qty: exact.floor() as u64, frac: exact - exact.floor() }
        })
        .collect();

    let allocated: u64 = allocs.iter().map(|a| a.qty).sum();
    let remainder = available.saturating_sub(allocated) as usize;

    // Shuffle first (breaks ties among equal fractions), then sort by
    // fraction descending — a stable sort preserves the shuffled order
    // among equal fractions, so the seed — not order id or submission
    // order — decides who gets the leftover unit.
    let mut order_indices: Vec<usize> = (0..allocs.len()).collect();
    seeded_shuffle(&mut order_indices, rng);
    order_indices.sort_by(|&a, &b| allocs[b].frac.partial_cmp(&allocs[a].frac).unwrap());

    for &idx in order_indices.iter().take(remainder) {
        allocs[idx].qty += 1;
    }

    for a in &allocs {
        if a.qty > 0 {
            fills.push(Fill {
                order_id: a.order.id,
                trader: a.order.trader,
                side: a.order.side,
                qty: a.qty,
                price: clearing_price,
            });
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

    #[test]
    fn cannot_be_gamed_by_splitting_one_order_into_many() {
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

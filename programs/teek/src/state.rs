use anchor_lang::prelude::*;

/// Hard cap on orders per batch. Solana accounts are fixed-size, so the
/// order book is a fixed array rather than a Vec — this can go much higher
/// than a naive account design would allow precisely because `OrderBook`
/// and `Reveal` below are zero-copy (see the comment on `OrderBook`): the
/// cap is a real capacity limit on the account's byte size, not an
/// artificial one imposed by the BPF stack.
pub const MAX_ORDERS_PER_BATCH: usize = 128;
pub const MAX_FILLS_PER_BATCH: usize = 128;

#[account]
pub struct Market {
    pub authority: Pubkey,
    /// The base and quote mints this market trades.
    pub base_mint: Pubkey,
    pub quote_mint: Pubkey,
    /// How many sub-ticks (roughly, how many ER slots) a batch stays open
    /// before it seals and clears. Tuned for legibility during the demo;
    /// production would push this toward the ER's real floor.
    pub batch_period_slots: u64,
    /// The slot the *current* batch's submission window opened at.
    pub batch_open_slot: u64,
    pub current_batch_id: u64,
    /// Bump seeds for the market's PDA and its two custody vaults.
    pub bump: u8,
    pub base_vault_bump: u8,
    pub quote_vault_bump: u8,
}

impl Market {
    pub const SEED_PREFIX: &'static [u8] = b"market";
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 8 + 8 + 8 + 1 + 1 + 1;
}

/// A single sealed order as stored on-chain. Deliberately a plain,
/// fixed-layout (`bytemuck::Pod`-compatible) struct — `side` is a raw `u8`
/// (0 = buy, 1 = sell) rather than the ergonomic `clearing::Side` enum,
/// because zero-copy accounts require every field to be plain old data.
/// Converted to/from `clearing::Order` right at the boundary where
/// `clear_batch` runs the actual auction — see `lib.rs`.
#[zero_copy]
#[repr(C)]
#[derive(Default)]
pub struct OnchainOrder {
    pub trader: Pubkey,
    pub id: u64,
    pub price: u64,
    pub qty: u64,
    pub side: u8,
    _padding: [u8; 7],
}

impl OnchainOrder {
    pub fn new(id: u64, trader: Pubkey, side: u8, price: u64, qty: u64) -> Self {
        Self { trader, id, price, qty, side, _padding: [0; 7] }
    }
}

/// A single settled fill as stored on-chain — same plain-old-data
/// constraint as `OnchainOrder`, for the same reason.
#[zero_copy]
#[repr(C)]
#[derive(Default)]
pub struct OnchainFill {
    pub trader: Pubkey,
    pub qty: u64,
    pub price: u64,
    pub side: u8,
    _padding: [u8; 7],
}

impl OnchainFill {
    pub fn new(trader: Pubkey, side: u8, qty: u64, price: u64) -> Self {
        Self { trader, qty, price, side, _padding: [0; 7] }
    }
}

/// The sealed order book for the market's current batch. While this
/// account is delegated into a Private ER, its contents are invisible to
/// everyone — including the sequencer operator — until the batch seals and
/// `clear_batch` runs. That invisibility is what a continuous book cannot
/// give you: on a normal book, resting orders are public the instant
/// they're submitted.
///
/// This is `zero_copy` (accessed via `AccountLoader`, not `Account`) on
/// purpose: at `MAX_ORDERS_PER_BATCH` = 128, the plain struct is well over
/// 8KB, and Anchor's normal `Account<T>` deserializes the *entire struct
/// onto the stack* — SBF caps a single function's stack frame at 4096
/// bytes, so that blew up immediately (`cargo build-sbf` reported 30KB+
/// frames on `initialize_market`/`clear_batch`). Zero-copy accounts hold a
/// reference straight into the account's own byte buffer instead of ever
/// materializing the whole struct as a stack value — the standard fix for
/// any account this shape (an order book is exactly the case zero-copy
/// exists for).
#[account(zero_copy)]
#[repr(C)]
pub struct OrderBook {
    pub market: Pubkey,
    pub batch_id: u64,
    pub order_count: u16,
    /// Set while a `clear_batch` VRF request is in flight, so
    /// `submit_order` can reject new orders until the callback actually
    /// clears the batch — otherwise an order could sneak in between the
    /// randomness request and its fulfillment, defeating the seal.
    pub awaiting_vrf: u8,
    _padding: [u8; 5],
    pub orders: [OnchainOrder; MAX_ORDERS_PER_BATCH],
}

impl OrderBook {
    pub const SEED_PREFIX: &'static [u8] = b"order_book";
    pub const SPACE: usize = 8 + 32 + 8 + 2 + 1 + 5 + MAX_ORDERS_PER_BATCH * std::mem::size_of::<OnchainOrder>();
}

/// The public result of the most recently cleared batch — this is the only
/// thing anyone ever sees about a batch's orders: one price, and the fills
/// against it. Nothing about who bid what, or when, is ever exposed.
/// Zero-copy for the same reason as `OrderBook`.
#[account(zero_copy)]
#[repr(C)]
pub struct Reveal {
    pub market: Pubkey,
    pub batch_id: u64,
    pub clearing_price: u64,
    pub matched_qty: u64,
    // Field order matters here: `Pod` forbids any compiler-inserted
    // padding, so these need to land at offsets `repr(C)` would pick
    // anyway. u16 at 56 (even, no gap), u8 at 58, then this explicit
    // 5-byte pad brings us to 64 — an 8-byte boundary, exactly what
    // `fills` (whose elements are 8-byte aligned) needs next.
    pub fill_count: u16,
    pub had_trade: u8,
    _padding: [u8; 5],
    pub fills: [OnchainFill; MAX_FILLS_PER_BATCH],
}

impl Reveal {
    pub const SEED_PREFIX: &'static [u8] = b"reveal";
    pub const SPACE: usize = 8 + 32 + 8 + 8 + 8 + 1 + 2 + 5 + MAX_FILLS_PER_BATCH * std::mem::size_of::<OnchainFill>();
}

/// Per-trader balances held in custody by the market — deposited on L1,
/// spent/earned inside the ER as batches clear, withdrawable on L1 after
/// commit + undelegate. Keeping this as its own small PDA (rather than
/// real token transfers per fill) is what makes clearing hundreds of
/// sealed orders per batch cheap: settlement is a balance write, not a
/// token transfer, until the trader actually withdraws. Small and
/// fixed-shape enough that a regular (non-zero-copy) account is fine.
#[account]
pub struct TraderAccount {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub base_balance: u64,
    pub quote_balance: u64,
    pub base_locked: u64,
    pub quote_locked: u64,
    pub bump: u8,
}

impl TraderAccount {
    pub const SEED_PREFIX: &'static [u8] = b"trader";
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 8 + 8 + 8 + 1;
}

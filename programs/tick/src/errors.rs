use anchor_lang::prelude::*;

#[error_code]
pub enum TickError {
    #[msg("The order book for this batch is full")]
    OrderBookFull,
    #[msg("Order price or quantity must be greater than zero")]
    InvalidOrderParams,
    #[msg("The current batch's submission window has already closed")]
    BatchSealed,
    #[msg("The current batch's submission window is still open — too early to clear")]
    BatchStillOpen,
    #[msg("Insufficient balance to cover this order")]
    InsufficientBalance,
    #[msg("Arithmetic overflow")]
    Overflow,
}

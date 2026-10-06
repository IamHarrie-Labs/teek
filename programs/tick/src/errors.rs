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
    #[msg("Launch funding is closed")]
    FundingClosed,
    #[msg("Launch bidding is not open")]
    BiddingClosed,
    #[msg("Launch bidding is still open")]
    BiddingStillOpen,
    #[msg("Invalid launch time window")]
    InvalidWindow,
    #[msg("Invalid launch terms")]
    InvalidTerms,
    #[msg("Amount is outside the launch limits")]
    InvalidAmount,
    #[msg("Launch bidder capacity reached")]
    TooManyBidders,
    #[msg("Bid account does not belong to this launch or bidder")]
    InvalidBid,
    #[msg("Bid exceeds deposited funding")]
    InsufficientFunding,
    #[msg("Private bid permissions have not been activated")]
    PrivacyNotReady,
    #[msg("Every registered bid must be supplied exactly once")]
    IncompleteBids,
    #[msg("Bid has not returned from the private ER")]
    BidStillDelegated,
    #[msg("Launch has already closed")]
    AlreadyClosed,
    #[msg("Settlement deadline has passed")]
    SettlementExpired,
    #[msg("Settlement deadline has not passed")]
    SettlementNotExpired,
    #[msg("DBC configuration is unsupported or changed")]
    InvalidDbcConfig,
    #[msg("Launch settlement is not configured or not ready")]
    SettlementNotReady,
    #[msg("Randomness has already been requested or delivered")]
    RandomnessAlreadyRequested,
    #[msg("Settlement output is below the immutable launch minimum")]
    LaunchSlippage,
    #[msg("Launch assets or custody accounts do not match the accepted terms")]
    InvalidLaunchAssets,
    #[msg("Allocation or claim conservation check failed")]
    AllocationInvariant,
    #[msg("This allocation has already been claimed")]
    AlreadyClaimed,
    #[msg("Fresh pool creation is required for the opening purchase")]
    PoolAlreadyExists,
    #[msg("Random sampling exhausted its bounded rejection attempts")]
    RandomnessExhausted,
}

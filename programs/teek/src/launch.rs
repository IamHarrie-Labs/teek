//! Launch funding and confidential bid intake. DBC execution is a separate
//! milestone: Ready launches remain refundable after the settlement deadline.
//! Only public funding is accepted on L1. Nonzero bid amounts are written only
//! after a private ephemeral permission has been created on the pinned TEE.
use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer as LamportTransfer};
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use ephemeral_rollups_sdk::{
    access_control::{
        instructions::{CloseEphemeralPermissionCpi, CreateEphemeralPermissionCpi},
        structs::{
            EphemeralMembersArgs, EphemeralPermission, Member, ACCOUNT_SIGNATURES_FLAG,
            PERMISSION_SEED, TX_BALANCES_FLAG, TX_LOGS_FLAG, TX_MESSAGE_FLAG,
        },
    },
    anchor::{commit, delegate},
    consts::{EPHEMERAL_VAULT_ID, MAGIC_PROGRAM_ID, PERMISSION_PROGRAM_ID},
    cpi::DelegateConfig,
    ephem::commit_and_undelegate_accounts,
};

pub const MAX_LAUNCH_BIDDERS: usize = 24;
pub const PRIVATE_VALIDATOR: Pubkey = pubkey!("MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo");
pub const BID_VIEW_FLAGS: u8 =
    TX_LOGS_FLAG | TX_BALANCES_FLAG | TX_MESSAGE_FLAG | ACCOUNT_SIGNATURES_FLAG;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct LaunchTerms {
    pub base_mint: Pubkey,
    pub dbc_config: Pubkey,
    pub bidding_opens_at: i64,
    pub bidding_closes_at: i64,
    pub settlement_deadline: i64,
    pub min_raise: u64,
    pub max_raise: u64,
    pub min_bid: u64,
    /// Hash of the creator's published metadata/config manifest. The DBC
    /// settlement instruction must independently validate the actual config.
    pub manifest_hash: [u8; 32],
}

impl LaunchTerms {
    pub fn validate(&self, now: i64) -> Result<()> {
        require!(
            now < self.bidding_opens_at
                && self.bidding_opens_at < self.bidding_closes_at
                && self.bidding_closes_at < self.settlement_deadline,
            LaunchError::InvalidWindow
        );
        require!(
            self.min_bid > 0
                && self.min_raise > 0
                && self.min_raise <= self.max_raise
                && self.min_bid <= self.max_raise,
            LaunchError::InvalidAmount
        );
        require!(
            self.base_mint != Pubkey::default() && self.dbc_config != Pubkey::default(),
            LaunchError::InvalidTerms
        );
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum LaunchStatus {
    Funding,
    Ready,
    Refunds,
    Settled,
}

#[account]
pub struct Launch {
    pub creator: Pubkey,
    pub launch_id: u64,
    pub quote_mint: Pubkey,
    pub terms: LaunchTerms,
    pub status: LaunchStatus,
    pub bid_count: u16,
    /// Public registration addresses, never bid amounts or an open tally.
    pub bids: [Pubkey; MAX_LAUNCH_BIDDERS],
    pub total_bid: u64,
    pub accepted_total: u64,
    pub bump: u8,
    pub quote_vault_bump: u8,
}

impl Launch {
    pub const SEED: &'static [u8] = b"launch";
    pub const SPACE: usize = 8
        + 32
        + 8
        + 32
        + (32 + 32 + 8 * 3 + 8 * 3 + 32)
        + 1
        + 2
        + 32 * MAX_LAUNCH_BIDDERS
        + 8
        + 8
        + 1
        + 1;

    pub fn check_funding(&self, now: i64) -> Result<()> {
        require!(
            self.status == LaunchStatus::Funding && now < self.terms.bidding_opens_at,
            LaunchError::FundingClosed
        );
        Ok(())
    }

    pub fn check_bidding(&self, now: i64) -> Result<()> {
        require!(
            self.status == LaunchStatus::Funding
                && now >= self.terms.bidding_opens_at
                && now < self.terms.bidding_closes_at,
            LaunchError::BiddingClosed
        );
        Ok(())
    }
}

#[account]
pub struct LaunchBid {
    pub launch: Pubkey,
    pub bidder: Pubkey,
    /// Publicly funded balance; only `amount` becomes confidential on the ER.
    pub funded: u64,
    pub amount: u64,
    pub privacy_ready: bool,
    pub closed: bool,
    pub bump: u8,
}

impl LaunchBid {
    pub const SEED: &'static [u8] = b"launch_bid";
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 8 + 1 + 1 + 1;

    pub fn set_amount(&mut self, terms: &LaunchTerms, amount: u64) -> Result<()> {
        require!(
            self.privacy_ready && !self.closed,
            LaunchError::PrivacyNotReady
        );
        require!(
            amount == 0 || amount >= terms.min_bid,
            LaunchError::InvalidAmount
        );
        require!(amount <= self.funded, LaunchError::InsufficientFunding);
        self.amount = amount;
        Ok(())
    }
}

pub fn initialize(
    ctx: Context<InitializeLaunch>,
    launch_id: u64,
    terms: LaunchTerms,
) -> Result<()> {
    terms.validate(Clock::get()?.unix_timestamp)?;
    let launch = &mut ctx.accounts.launch;
    launch.creator = ctx.accounts.creator.key();
    launch.launch_id = launch_id;
    launch.quote_mint = ctx.accounts.quote_mint.key();
    launch.terms = terms;
    launch.status = LaunchStatus::Funding;
    launch.bump = ctx.bumps.launch;
    launch.quote_vault_bump = ctx.bumps.quote_vault;
    Ok(())
}

fn check_venue_configured(launch: &Account<Launch>, info: &UncheckedAccount) -> Result<()> {
    use crate::launch_settlement::{SettlementState, MINT_SEED};
    let mint = Pubkey::find_program_address(&[MINT_SEED,launch.key().as_ref()],&crate::ID).0;
    if launch.terms.base_mint == mint {
        require_keys_eq!(*info.owner, crate::ID, LaunchError::SettlementNotReady);
        let state = SettlementState::try_deserialize(&mut &info.try_borrow_data()?[..])?;
        require_keys_eq!(state.launch, launch.key(), LaunchError::SettlementNotReady);
        require!(state.phase == 0, LaunchError::SettlementNotReady);
    }
    Ok(())
}

pub fn register(ctx: Context<RegisterLaunchBid>, amount: u64) -> Result<()> {
    check_venue_configured(&ctx.accounts.launch, &ctx.accounts.settlement)?;
    ctx.accounts
        .launch
        .check_funding(Clock::get()?.unix_timestamp)?;
    require!(
        amount >= ctx.accounts.launch.terms.min_bid,
        LaunchError::InvalidAmount
    );
    let index = usize::from(ctx.accounts.launch.bid_count);
    require!(index < MAX_LAUNCH_BIDDERS, LaunchError::TooManyBidders);
    let bid = &mut ctx.accounts.bid;
    bid.launch = ctx.accounts.launch.key();
    bid.bidder = ctx.accounts.bidder.key();
    bid.funded = amount;
    bid.bump = ctx.bumps.bid;
    ctx.accounts.launch.bids[index] = bid.key();
    ctx.accounts.launch.bid_count = ctx
        .accounts
        .launch
        .bid_count
        .checked_add(1)
        .ok_or(LaunchError::Overflow)?;
    // Preload permission rent so an authenticated bidder needs no ER sponsor.
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            LamportTransfer {
                from: ctx.accounts.bidder.to_account_info(),
                to: bid.to_account_info(),
            },
        ),
        ephemeral_rollups_sdk::ephemeral_accounts::rent(EphemeralPermission::size_of(1) as u32),
    )?;
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.source.to_account_info(),
                to: ctx.accounts.quote_vault.to_account_info(),
                authority: ctx.accounts.bidder.to_account_info(),
            },
        ),
        amount,
    )
}

pub fn fund(ctx: Context<FundLaunchBid>, amount: u64) -> Result<()> {
    check_venue_configured(&ctx.accounts.launch, &ctx.accounts.settlement)?;
    ctx.accounts
        .launch
        .check_funding(Clock::get()?.unix_timestamp)?;
    require!(
        !ctx.accounts.bid.closed && !ctx.accounts.bid.privacy_ready,
        LaunchError::FundingClosed
    );
    require!(amount > 0, LaunchError::InvalidAmount);
    ctx.accounts.bid.funded = ctx
        .accounts
        .bid
        .funded
        .checked_add(amount)
        .ok_or(LaunchError::Overflow)?;
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.source.to_account_info(),
                to: ctx.accounts.quote_vault.to_account_info(),
                authority: ctx.accounts.bidder.to_account_info(),
            },
        ),
        amount,
    )
}

pub fn withdraw(ctx: Context<WithdrawLaunchBid>, amount: u64) -> Result<()> {
    let launch = &ctx.accounts.launch;
    if launch.status != LaunchStatus::Refunds {
        launch.check_funding(Clock::get()?.unix_timestamp)?;
        require!(!ctx.accounts.bid.privacy_ready, LaunchError::FundingClosed);
    }
    require!(
        amount > 0 && amount <= ctx.accounts.bid.funded,
        LaunchError::InsufficientFunding
    );
    ctx.accounts.bid.funded = ctx
        .accounts
        .bid
        .funded
        .checked_sub(amount)
        .ok_or(LaunchError::Overflow)?;
    let id = launch.launch_id.to_le_bytes();
    let bump = [launch.bump];
    let seeds = &[
        Launch::SEED,
        launch.creator.as_ref(),
        id.as_ref(),
        bump.as_ref(),
    ];
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.quote_vault.to_account_info(),
                to: ctx.accounts.destination.to_account_info(),
                authority: launch.to_account_info(),
            },
        )
        .with_signer(&[seeds]),
        amount,
    )
}

pub fn delegate_bid(ctx: Context<DelegateLaunchBid>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(
        ctx.accounts.launch.status == LaunchStatus::Funding
            && now < ctx.accounts.launch.terms.bidding_closes_at,
        LaunchError::BiddingClosed
    );
    let bid = LaunchBid::try_deserialize(&mut &ctx.accounts.bid.try_borrow_data()?[..])?;
    require!(
        !bid.closed && !bid.privacy_ready && bid.amount == 0 && bid.funded > 0,
        LaunchError::InvalidBid
    );
    require_keys_eq!(
        bid.launch,
        ctx.accounts.launch.key(),
        LaunchError::InvalidBid
    );
    require_keys_eq!(
        bid.bidder,
        ctx.accounts.payer.key(),
        LaunchError::InvalidBid
    );
    let launch = ctx.accounts.launch.key();
    let payer = ctx.accounts.payer.key();
    ctx.accounts.delegate_bid(
        &ctx.accounts.payer,
        &[LaunchBid::SEED, launch.as_ref(), payer.as_ref()],
        DelegateConfig {
            validator: Some(PRIVATE_VALIDATOR),
            ..Default::default()
        },
    )?;
    Ok(())
}

pub fn activate(ctx: Context<ActivateLaunchBid>) -> Result<()> {
    require!(
        ctx.accounts.launch.status == LaunchStatus::Funding
            && Clock::get()?.unix_timestamp < ctx.accounts.launch.terms.bidding_closes_at,
        LaunchError::BiddingClosed
    );
    require!(
        !ctx.accounts.bid.closed && !ctx.accounts.bid.privacy_ready,
        LaunchError::InvalidBid
    );
    let launch = ctx.accounts.launch.key();
    let bidder = ctx.accounts.bidder.key();
    let bump = [ctx.accounts.bid.bump];
    let seeds = &[
        LaunchBid::SEED,
        launch.as_ref(),
        bidder.as_ref(),
        bump.as_ref(),
    ];
    // No creator and no AUTHORITY flag: bidders can read their own bid but
    // cannot grant other users access through the Permission Program.
    CreateEphemeralPermissionCpi {
        payer: ctx.accounts.bid.to_account_info(),
        permissioned_account: ctx.accounts.bid.to_account_info(),
        permission: ctx.accounts.permission.to_account_info(),
        vault: ctx.accounts.ephemeral_vault.to_account_info(),
        magic_program: ctx.accounts.magic_program.to_account_info(),
        permission_program: ctx.accounts.permission_program.to_account_info(),
        args: EphemeralMembersArgs {
            is_private: true,
            members: vec![Member {
                pubkey: bidder,
                flags: BID_VIEW_FLAGS,
            }],
        },
    }
    .invoke_signed(&[seeds])?;
    ctx.accounts.bid.privacy_ready = true;
    Ok(())
}

pub fn edit(ctx: Context<EditLaunchBid>, amount: u64) -> Result<()> {
    ctx.accounts
        .launch
        .check_bidding(Clock::get()?.unix_timestamp)?;
    ctx.accounts
        .bid
        .set_amount(&ctx.accounts.launch.terms, amount)
}

pub fn return_bid(ctx: Context<CommitLaunchBid>) -> Result<()> {
    require!(
        ctx.accounts.launch.status == LaunchStatus::Refunds
            || Clock::get()?.unix_timestamp >= ctx.accounts.launch.terms.bidding_closes_at,
        LaunchError::BiddingStillOpen
    );
    let launch = ctx.accounts.launch.key();
    let bidder = ctx.accounts.bid.bidder;
    let bump = [ctx.accounts.bid.bump];
    let seeds = &[
        LaunchBid::SEED,
        launch.as_ref(),
        bidder.as_ref(),
        bump.as_ref(),
    ];
    if ctx.accounts.bid.privacy_ready {
        CloseEphemeralPermissionCpi {
            payer: ctx.accounts.bid.to_account_info(),
            authority: ctx.accounts.bid.to_account_info(),
            permissioned_account: ctx.accounts.bid.to_account_info(),
            permission: ctx.accounts.permission.to_account_info(),
            vault: ctx.accounts.ephemeral_vault.to_account_info(),
            magic_program: ctx.accounts.magic_program.to_account_info(),
            permission_program: ctx.accounts.permission_program.to_account_info(),
            authority_is_signer: true,
        }
        .invoke_signed(&[seeds])?;
    }
    ctx.accounts.bid.privacy_ready = false;
    ctx.accounts.bid.closed = true;
    // Serialize before scheduling the commit, so L1 receives the seal flags.
    ctx.accounts.bid.exit(&crate::ID)?;
    commit_and_undelegate_accounts(
        &ctx.accounts.payer.to_account_info(),
        vec![&ctx.accounts.bid.to_account_info()],
        &ctx.accounts.magic_context.to_account_info(),
        &ctx.accounts.magic_program.to_account_info(),
        None,
    )?;
    Ok(())
}

pub fn close<'info>(ctx: Context<'info, CloseLaunch<'info>>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(
        now >= ctx.accounts.launch.terms.bidding_closes_at,
        LaunchError::BiddingStillOpen
    );
    require!(
        now < ctx.accounts.launch.terms.settlement_deadline,
        LaunchError::SettlementExpired
    );
    require!(
        ctx.accounts.launch.status == LaunchStatus::Funding,
        LaunchError::AlreadyClosed
    );
    let count = usize::from(ctx.accounts.launch.bid_count);
    require!(
        ctx.remaining_accounts.len() == count,
        LaunchError::IncompleteBids
    );
    let mut total = 0u64;
    for (index, info) in ctx.remaining_accounts.iter().enumerate() {
        require_keys_eq!(
            info.key(),
            ctx.accounts.launch.bids[index],
            LaunchError::InvalidBid
        );
        require_keys_eq!(*info.owner, crate::ID, LaunchError::BidStillDelegated);
        let bid = LaunchBid::try_deserialize(&mut &info.try_borrow_data()?[..])?;
        require_keys_eq!(
            bid.launch,
            ctx.accounts.launch.key(),
            LaunchError::InvalidBid
        );
        // Never-delegated bids stay zero; delegated bids must have returned.
        require!(
            !bid.privacy_ready && (bid.closed || bid.amount == 0),
            LaunchError::BidStillDelegated
        );
        require!(bid.amount <= bid.funded, LaunchError::InvalidBid);
        total = total.checked_add(bid.amount).ok_or(LaunchError::Overflow)?;
    }
    let launch = &mut ctx.accounts.launch;
    launch.total_bid = total;
    launch.accepted_total = total.min(launch.terms.max_raise);
    launch.status = if total < launch.terms.min_raise {
        LaunchStatus::Refunds
    } else {
        LaunchStatus::Ready
    };
    Ok(())
}

pub fn expire(ctx: Context<ExpireLaunch>) -> Result<()> {
    require!(
        Clock::get()?.unix_timestamp >= ctx.accounts.launch.terms.settlement_deadline,
        LaunchError::SettlementNotExpired
    );
    require!(
        ctx.accounts.launch.status != LaunchStatus::Settled,
        LaunchError::AlreadyClosed
    );
    ctx.accounts.launch.status = LaunchStatus::Refunds;
    Ok(())
}

/// Emergency cancellation stops intake/settlement and preserves full refunds.
/// It cannot seize funds or affect already-settled claims.
pub fn cancel(ctx: Context<CancelLaunch>) -> Result<()> {
    require!(ctx.accounts.launch.status != LaunchStatus::Settled, LaunchError::AlreadyClosed);
    ctx.accounts.launch.status = LaunchStatus::Refunds;
    Ok(())
}

#[derive(Accounts)]
#[instruction(launch_id: u64)]
pub struct InitializeLaunch<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    pub quote_mint: Account<'info, Mint>,
    #[account(init, payer = creator, space = Launch::SPACE,
        seeds = [Launch::SEED, creator.key().as_ref(), &launch_id.to_le_bytes()], bump)]
    pub launch: Box<Account<'info, Launch>>,
    #[account(init, payer = creator, seeds = [b"launch_quote", launch.key().as_ref()], bump,
        token::mint = quote_mint, token::authority = launch)]
    pub quote_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterLaunchBid<'info> {
    #[account(mut)]
    pub bidder: Signer<'info>,
    #[account(mut, seeds = [Launch::SEED, launch.creator.as_ref(), &launch.launch_id.to_le_bytes()], bump = launch.bump)]
    pub launch: Box<Account<'info, Launch>>,
    /// CHECK: canonical sidecar is required and deserialized for venue launches;
    /// legacy intake accounts remain withdrawable and usable in escrow tests.
    #[account(seeds=[crate::launch_settlement::STATE_SEED,launch.key().as_ref()],bump)]
    pub settlement: UncheckedAccount<'info>,
    #[account(init, payer = bidder, space = LaunchBid::SPACE,
        seeds = [LaunchBid::SEED, launch.key().as_ref(), bidder.key().as_ref()], bump)]
    pub bid: Account<'info, LaunchBid>,
    #[account(mut, token::mint = launch.quote_mint, token::authority = bidder)]
    pub source: Account<'info, TokenAccount>,
    #[account(mut, seeds = [b"launch_quote", launch.key().as_ref()], bump = launch.quote_vault_bump,
        token::mint = launch.quote_mint, token::authority = launch)]
    pub quote_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FundLaunchBid<'info> {
    pub bidder: Signer<'info>,
    #[account(seeds = [Launch::SEED, launch.creator.as_ref(), &launch.launch_id.to_le_bytes()], bump = launch.bump)]
    pub launch: Box<Account<'info, Launch>>,
    /// CHECK: validated by check_venue_configured for Teek's planned token PDA.
    #[account(seeds=[crate::launch_settlement::STATE_SEED,launch.key().as_ref()],bump)]
    pub settlement: UncheckedAccount<'info>,
    #[account(mut, seeds = [LaunchBid::SEED, launch.key().as_ref(), bidder.key().as_ref()], bump = bid.bump, has_one = launch, has_one = bidder)]
    pub bid: Account<'info, LaunchBid>,
    #[account(mut, token::mint = launch.quote_mint, token::authority = bidder)]
    pub source: Account<'info, TokenAccount>,
    #[account(mut, seeds = [b"launch_quote", launch.key().as_ref()], bump = launch.quote_vault_bump,
        token::mint = launch.quote_mint, token::authority = launch)]
    pub quote_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct WithdrawLaunchBid<'info> {
    pub bidder: Signer<'info>,
    #[account(seeds = [Launch::SEED, launch.creator.as_ref(), &launch.launch_id.to_le_bytes()], bump = launch.bump)]
    pub launch: Box<Account<'info, Launch>>,
    #[account(mut, seeds = [LaunchBid::SEED, launch.key().as_ref(), bidder.key().as_ref()], bump = bid.bump, has_one = launch, has_one = bidder)]
    pub bid: Account<'info, LaunchBid>,
    #[account(mut, token::mint = launch.quote_mint, token::authority = bidder)]
    pub destination: Account<'info, TokenAccount>,
    #[account(mut, seeds = [b"launch_quote", launch.key().as_ref()], bump = launch.quote_vault_bump,
        token::mint = launch.quote_mint, token::authority = launch)]
    pub quote_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateLaunchBid<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub launch: Account<'info, Launch>,
    /// CHECK: canonical bidder PDA; contents checked before delegation.
    #[account(mut, del, owner = crate::ID,
        seeds = [LaunchBid::SEED, launch.key().as_ref(), payer.key().as_ref()], bump)]
    pub bid: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct ActivateLaunchBid<'info> {
    pub bidder: Signer<'info>,
    pub launch: Account<'info, Launch>,
    #[account(mut, seeds = [LaunchBid::SEED, launch.key().as_ref(), bidder.key().as_ref()], bump = bid.bump, has_one = launch, has_one = bidder)]
    pub bid: Account<'info, LaunchBid>,
    /// CHECK: only the Permission Program's canonical PDA is accepted.
    #[account(mut, seeds = [PERMISSION_SEED, bid.key().as_ref()], bump, seeds::program = PERMISSION_PROGRAM_ID)]
    pub permission: UncheckedAccount<'info>,
    /// CHECK: SDK-defined rent vault.
    #[account(mut, address = EPHEMERAL_VAULT_ID)]
    pub ephemeral_vault: UncheckedAccount<'info>,
    /// CHECK: SDK-defined executable Magic program.
    #[account(address = MAGIC_PROGRAM_ID, executable)]
    pub magic_program: UncheckedAccount<'info>,
    /// CHECK: SDK-defined executable permission program.
    #[account(address = PERMISSION_PROGRAM_ID, executable)]
    pub permission_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct EditLaunchBid<'info> {
    pub bidder: Signer<'info>,
    pub launch: Account<'info, Launch>,
    #[account(mut, seeds = [LaunchBid::SEED, launch.key().as_ref(), bidder.key().as_ref()], bump = bid.bump, has_one = launch, has_one = bidder)]
    pub bid: Account<'info, LaunchBid>,
}

#[commit]
#[derive(Accounts)]
pub struct CommitLaunchBid<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub launch: Account<'info, Launch>,
    #[account(mut, seeds = [LaunchBid::SEED, launch.key().as_ref(), bid.bidder.as_ref()], bump = bid.bump, has_one = launch)]
    pub bid: Account<'info, LaunchBid>,
    /// CHECK: canonical permission PDA, closed before the bid returns to L1.
    #[account(mut, seeds = [PERMISSION_SEED, bid.key().as_ref()], bump, seeds::program = PERMISSION_PROGRAM_ID)]
    pub permission: UncheckedAccount<'info>,
    /// CHECK: SDK-defined rent vault.
    #[account(mut, address = EPHEMERAL_VAULT_ID)]
    pub ephemeral_vault: UncheckedAccount<'info>,
    /// CHECK: SDK-defined executable permission program.
    #[account(address = PERMISSION_PROGRAM_ID, executable)]
    pub permission_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct CloseLaunch<'info> {
    #[account(mut, seeds = [Launch::SEED, launch.creator.as_ref(), &launch.launch_id.to_le_bytes()], bump = launch.bump)]
    pub launch: Account<'info, Launch>,
}

#[derive(Accounts)]
pub struct ExpireLaunch<'info> {
    #[account(mut, seeds = [Launch::SEED, launch.creator.as_ref(), &launch.launch_id.to_le_bytes()], bump = launch.bump)]
    pub launch: Account<'info, Launch>,
}

#[derive(Accounts)]
pub struct CancelLaunch<'info> {
    pub creator: Signer<'info>,
    #[account(mut, seeds=[Launch::SEED,creator.key().as_ref(),&launch.launch_id.to_le_bytes()],bump=launch.bump,has_one=creator)]
    pub launch: Account<'info,Launch>,
}

// Anchor emits one error table per program. Preserve existing Teek codes.
pub use crate::errors::TeekError as LaunchError;

#[cfg(test)]
mod tests {
    use super::*;
    fn terms() -> LaunchTerms {
        LaunchTerms {
            base_mint: Pubkey::new_unique(),
            dbc_config: Pubkey::new_unique(),
            bidding_opens_at: 100,
            bidding_closes_at: 200,
            settlement_deadline: 300,
            min_raise: 10,
            max_raise: 100,
            min_bid: 2,
            manifest_hash: [0; 32],
        }
    }
    fn bid() -> LaunchBid {
        LaunchBid {
            launch: Pubkey::new_unique(),
            bidder: Pubkey::new_unique(),
            funded: 20,
            amount: 0,
            privacy_ready: true,
            closed: false,
            bump: 255,
        }
    }
    #[test]
    fn rejects_invalid_windows_and_caps() {
        assert!(terms().validate(99).is_ok());
        assert!(terms().validate(100).is_err());
        let mut t = terms();
        t.bidding_closes_at = 100;
        assert!(t.validate(99).is_err());
        let mut t = terms();
        t.max_raise = 9;
        assert!(t.validate(99).is_err());
    }
    #[test]
    fn bids_are_funded_editable_and_cancellable() {
        let mut b = bid();
        b.set_amount(&terms(), 12).unwrap();
        b.set_amount(&terms(), 20).unwrap();
        assert!(b.set_amount(&terms(), 21).is_err());
        assert_eq!(b.amount, 20);
        assert!(b.set_amount(&terms(), 1).is_err());
        b.set_amount(&terms(), 0).unwrap();
        assert_eq!(b.amount, 0);
    }
    #[test]
    fn refuses_unprotected_or_closed_bid_writes() {
        let mut b = bid();
        b.privacy_ready = false;
        assert!(b.set_amount(&terms(), 10).is_err());
        b.privacy_ready = true;
        b.closed = true;
        assert!(b.set_amount(&terms(), 10).is_err());
        assert_eq!(b.amount, 0);
    }
    #[test]
    fn funding_and_bidding_boundaries_do_not_overlap() {
        let l = Launch {
            creator: Pubkey::new_unique(),
            launch_id: 0,
            quote_mint: Pubkey::new_unique(),
            terms: terms(),
            status: LaunchStatus::Funding,
            bid_count: 0,
            bids: [Pubkey::default(); MAX_LAUNCH_BIDDERS],
            total_bid: 0,
            accepted_total: 0,
            bump: 255,
            quote_vault_bump: 255,
        };
        assert!(l.check_funding(99).is_ok());
        assert!(l.check_funding(100).is_err());
        assert!(l.check_bidding(99).is_err());
        assert!(l.check_bidding(100).is_ok());
        assert!(l.check_bidding(199).is_ok());
        assert!(l.check_bidding(200).is_err());
    }
}

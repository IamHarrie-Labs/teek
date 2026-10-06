//! Tick — a sealed, uniform-price batch auction on MagicBlock Ephemeral
//! Rollups. See `PLAN.md` at the workspace root for the full design and
//! build order. The clearing algorithm itself lives in `clearing.rs` and
//! is fully ported and tested (`cargo test`); this file wires it into
//! Anchor accounts and instructions, including real `ephemeral-rollups-sdk`
//! delegation (`delegate_accounts`) and commit/undelegate
//! (`commit_and_undelegate`) — both confirmed against the SDK's own source
//! (read directly from the installed crate, not guessed at) rather than
//! remembered API shape, since the crate has moved fast enough that
//! guessing was wrong more than once already in this build (see
//! PLAN.md). VRF is also real now: `clear_batch` requests randomness from
//! the MagicBlock VRF oracle instead of taking a raw seed, and
//! `clear_batch_callback` (invoked by the oracle, not by any client) runs
//! the actual clearing once real randomness arrives — modeled directly on
//! MagicBlock's own `roll-dice` example, since VRF requests are
//! asynchronous by nature (no single instruction can both ask an oracle
//! for randomness and use the answer). Balance locking/settlement is
//! also real: `submit_order` locks a trader's worst case against their
//! `TraderAccount`, and `clear_batch_callback` releases and settles it
//! once the batch's uniform price exists, looking each trader up by PDA
//! among the `remaining_accounts` `clear_batch` asked the oracle to hand
//! back.

use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral, vrf, vrf_callback};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::commit_and_undelegate_accounts;
use ephemeral_rollups_sdk::vrf::{
    self, instructions::{create_request_randomness_ix, RequestRandomnessParams},
    types::SerializableAccountMeta,
};

pub mod clearing;
pub mod errors;
pub mod launch;
pub mod dbc_wire;
pub mod launch_allocation;
pub mod launch_settlement;
pub mod state;

pub use launch::*;
pub use launch_settlement::*;

use clearing::{clear_batch as run_clearing, Order, Side};

const SIDE_BUY: u8 = 0;
const SIDE_SELL: u8 = 1;
use errors::TickError;
use state::*;

// TODO(toolchain): replace with the real program keypair's pubkey (see
// Anchor.toml) once `solana-keygen new` + `anchor keys sync` have run.
declare_id!("B6eqSCBhokuZLKqBrzwhquUho183P3Fvu8pgC4a9PFkY");

#[ephemeral]
#[program]
pub mod tick {
    use super::*;

    pub fn initialize_launch(ctx: Context<InitializeLaunch>, launch_id: u64, terms: LaunchTerms) -> Result<()> {
        launch::initialize(ctx, launch_id, terms)
    }

    pub fn register_launch_bid(ctx: Context<RegisterLaunchBid>, amount: u64) -> Result<()> {
        launch::register(ctx, amount)
    }

    pub fn fund_launch_bid(ctx: Context<FundLaunchBid>, amount: u64) -> Result<()> {
        launch::fund(ctx, amount)
    }

    pub fn withdraw_launch_funding(ctx: Context<WithdrawLaunchBid>, amount: u64) -> Result<()> {
        launch::withdraw(ctx, amount)
    }

    pub fn delegate_launch_bid(ctx: Context<DelegateLaunchBid>) -> Result<()> {
        launch::delegate_bid(ctx)
    }

    pub fn activate_private_launch_bid(ctx: Context<ActivateLaunchBid>) -> Result<()> {
        launch::activate(ctx)
    }

    pub fn edit_launch_bid(ctx: Context<EditLaunchBid>, amount: u64) -> Result<()> {
        launch::edit(ctx, amount)
    }

    pub fn commit_launch_bid(ctx: Context<CommitLaunchBid>) -> Result<()> {
        launch::return_bid(ctx)
    }

    pub fn close_launch<'info>(ctx: Context<'info, CloseLaunch<'info>>) -> Result<()> {
        launch::close(ctx)
    }

    pub fn expire_launch(ctx: Context<ExpireLaunch>) -> Result<()> {
        launch::expire(ctx)
    }
    pub fn cancel_launch(ctx: Context<CancelLaunch>) -> Result<()> {
        launch::cancel(ctx)
    }

    pub fn configure_launch_settlement(ctx: Context<ConfigureLaunchSettlement>, min_tokens_at_cap: u64, metadata: LaunchMetadata) -> Result<()> {
        launch_settlement::configure(ctx,min_tokens_at_cap,metadata)
    }
    pub fn request_launch_randomness<'info>(ctx: Context<'info,RequestLaunchRandomness<'info>>) -> Result<()> {
        launch_settlement::request(ctx)
    }
    pub fn launch_randomness_callback(ctx: Context<LaunchRandomnessCallback>, randomness: [u8;32], commitment: [u8;32]) -> Result<()> {
        launch_settlement::receive(ctx,randomness,commitment)
    }
    pub fn settle_launch<'info>(ctx: Context<'info,SettleLaunch<'info>>) -> Result<()> {
        launch_settlement::settle(ctx)
    }
    pub fn claim_launch_allocation(ctx: Context<ClaimLaunchAllocation>) -> Result<()> {
        launch_settlement::claim(ctx)
    }

    pub fn initialize_market(ctx: Context<InitializeMarket>, batch_period_slots: u64) -> Result<()> {
        let market = &mut ctx.accounts.market;
        market.authority = ctx.accounts.authority.key();
        market.base_mint = ctx.accounts.base_mint.key();
        market.quote_mint = ctx.accounts.quote_mint.key();
        market.batch_period_slots = batch_period_slots;
        market.batch_open_slot = Clock::get()?.slot;
        market.current_batch_id = 0;
        market.bump = ctx.bumps.market;
        market.base_vault_bump = ctx.bumps.base_vault;
        market.quote_vault_bump = ctx.bumps.quote_vault;

        let market_key = market.key();
        let mut order_book = ctx.accounts.order_book.load_init()?;
        order_book.market = market_key;
        order_book.batch_id = 0;
        order_book.order_count = 0;

        let mut reveal = ctx.accounts.reveal.load_init()?;
        reveal.market = market_key;

        Ok(())
    }

    /// Delegates the market's live-trading accounts — `market`,
    /// `order_book`, and `reveal` — into MagicBlock's Ephemeral Rollup so
    /// `submit_order`/`clear_batch` can run at ER speed there instead of
    /// L1 block time, and (once Private ER is selected as the validator)
    /// so the order book is invisible to the sequencer operator while a
    /// batch is open. All three must be delegated together: any account
    /// an ER instruction writes to has to already be owned by the
    /// delegation program, and both `submit_order` and `clear_batch`
    /// write to all three.
    ///
    /// `validator` pins the delegation to a specific ER validator (pass
    /// `None` to let the network assign one). For local testing against
    /// `@magicblock-labs/ephemeral-validator`, pass that validator's own
    /// identity — otherwise delegation defaults to MagicBlock's hosted
    /// validator, which a local ER instance never sees.
    ///
    /// `base_mint`/`quote_mint` are passed in rather than read off
    /// `ctx.accounts.market` because `market` here is an `UncheckedAccount`,
    /// not the typed `Account<Market>` — deliberately: Anchor
    /// auto-reserializes a `mut` typed `Account<T>` back into its buffer
    /// when the instruction returns, but by then `delegate_market` below
    /// has already handed `market`'s ownership to the delegation program,
    /// so that auto-write fails with "modified data of an account it does
    /// not own." `UncheckedAccount` skips that reserialize entirely — the
    /// same reason the SDK's own generated buffer/record/metadata fields
    /// use it. Confirmed by hitting exactly that error against real devnet.
    pub fn delegate_accounts(
        ctx: Context<DelegateOrderBook>,
        base_mint: Pubkey,
        quote_mint: Pubkey,
        validator: Option<Pubkey>,
    ) -> Result<()> {
        let market_key = ctx.accounts.market.key();

        ctx.accounts.delegate_market(
            &ctx.accounts.payer,
            &[Market::SEED_PREFIX, base_mint.as_ref(), quote_mint.as_ref()],
            DelegateConfig { validator, ..Default::default() },
        )?;
        ctx.accounts.delegate_order_book(
            &ctx.accounts.payer,
            &[OrderBook::SEED_PREFIX, market_key.as_ref()],
            DelegateConfig { validator, ..Default::default() },
        )?;
        ctx.accounts.delegate_reveal(
            &ctx.accounts.payer,
            &[Reveal::SEED_PREFIX, market_key.as_ref()],
            DelegateConfig { validator, ..Default::default() },
        )?;

        Ok(())
    }

    /// Delegates one trader's balance sheet after deposits have been made on
    /// the base layer. `submit_order` writes both the shared order book and
    /// this per-trader account, so both must live on the same ER validator.
    pub fn delegate_trader_account(
        ctx: Context<DelegateTraderAccount>,
        market: Pubkey,
        validator: Option<Pubkey>,
    ) -> Result<()> {
        let payer_key = ctx.accounts.payer.key();
        ctx.accounts.delegate_trader_account(
            &ctx.accounts.payer,
            &[
                TraderAccount::SEED_PREFIX,
                market.as_ref(),
                payer_key.as_ref(),
            ],
            DelegateConfig {
                validator,
                ..Default::default()
            },
        )?;

        Ok(())
    }

    /// Runs inside the ER. Appends a sealed order to the current batch.
    /// Nothing about this order — side, price, size, or trader — is
    /// visible to anyone until `clear_batch` reveals the batch's single
    /// uniform price. That is the whole mechanism: arriving first, or
    /// knowing more than the next trader, buys you nothing here.
    pub fn submit_order(ctx: Context<SubmitOrder>, side: Side, price: u64, qty: u64) -> Result<()> {
        require!(price > 0 && qty > 0, TickError::InvalidOrderParams);

        let market = &ctx.accounts.market;
        let clock = Clock::get()?;
        require!(
            clock.slot < market.batch_open_slot + market.batch_period_slots,
            TickError::BatchSealed
        );

        let mut order_book = ctx.accounts.order_book.load_mut()?;
        require!(order_book.awaiting_vrf == 0, TickError::BatchSealed);
        let idx = order_book.order_count as usize;
        require!(idx < MAX_ORDERS_PER_BATCH, TickError::OrderBookFull);

        // Lock this order's worst case against the trader's deposited
        // balance — a buy needs qty*price of quote, a sell needs qty of
        // base — so an order can't be submitted (and later filled)
        // against funds that aren't really there. Released back (in
        // full) and settled (for whatever actually filled) together in
        // `clear_batch_callback`, once this batch's uniform price exists.
        let trader_account = &mut ctx.accounts.trader_account;
        match side {
            Side::Buy => {
                let required = price.checked_mul(qty).ok_or(TickError::Overflow)?;
                let available = trader_account
                    .quote_balance
                    .checked_sub(trader_account.quote_locked)
                    .ok_or(TickError::Overflow)?;
                require!(available >= required, TickError::InsufficientBalance);
                trader_account.quote_locked =
                    trader_account.quote_locked.checked_add(required).ok_or(TickError::Overflow)?;
            }
            Side::Sell => {
                let available = trader_account
                    .base_balance
                    .checked_sub(trader_account.base_locked)
                    .ok_or(TickError::Overflow)?;
                require!(available >= qty, TickError::InsufficientBalance);
                trader_account.base_locked =
                    trader_account.base_locked.checked_add(qty).ok_or(TickError::Overflow)?;
            }
        }

        let id = order_book.batch_id * (MAX_ORDERS_PER_BATCH as u64) + idx as u64;
        let side_raw = if side == Side::Buy { SIDE_BUY } else { SIDE_SELL };
        order_book.orders[idx] =
            OnchainOrder::new(id, ctx.accounts.trader.key(), side_raw, price, qty);
        order_book.order_count += 1;

        Ok(())
    }

    /// Seals the current batch and requests real randomness from the
    /// MagicBlock VRF oracle for the marginal-allocation tie-break. This
    /// does NOT clear the batch itself — VRF is asynchronous by nature
    /// (an oracle has to actually respond), so the real clearing happens
    /// in `clear_batch_callback` once that randomness arrives. Meant to
    /// be called by MagicBlock's Automation on a fixed cadence — this is
    /// the "metronome tick."
    pub fn clear_batch(ctx: Context<ClearBatch>) -> Result<()> {
        let market = &ctx.accounts.market;
        let clock = Clock::get()?;
        require!(
            clock.slot >= market.batch_open_slot + market.batch_period_slots,
            TickError::BatchStillOpen
        );

        let mut order_book = ctx.accounts.order_book.load_mut()?;
        require!(order_book.awaiting_vrf == 0, TickError::BatchStillOpen);
        order_book.awaiting_vrf = 1;

        // Distinguishes this request from others; the oracle supplies the
        // actual entropy, this doesn't need to be secret or unpredictable
        // itself — matches MagicBlock's own `roll-dice` example, which
        // uses a plain client-supplied byte the same way.
        let mut caller_seed = [0u8; 32];
        caller_seed[..8].copy_from_slice(&order_book.batch_id.to_le_bytes());

        // Every unique trader with an order in this batch needs their
        // `TraderAccount` passed in as a remaining account (by whoever
        // cranks `clear_batch` — computed off-chain from the order book,
        // deduplicated) so `clear_batch_callback` can settle balances
        // once it knows the batch's uniform price. `accounts_metas` is
        // what tells the oracle which accounts to hand back to the
        // callback; anything beyond `market`/`order_book`/`reveal` here
        // shows up there as `remaining_accounts`, in this same order.
        let mut accounts_metas = vec![
            SerializableAccountMeta { pubkey: market.key(), is_signer: false, is_writable: true },
            SerializableAccountMeta {
                pubkey: ctx.accounts.order_book.key(),
                is_signer: false,
                is_writable: true,
            },
            SerializableAccountMeta {
                pubkey: ctx.accounts.reveal.key(),
                is_signer: false,
                is_writable: true,
            },
        ];
        for trader_account in ctx.remaining_accounts.iter() {
            accounts_metas.push(SerializableAccountMeta {
                pubkey: trader_account.key(),
                is_signer: false,
                is_writable: true,
            });
        }

        let ix = create_request_randomness_ix(RequestRandomnessParams {
            payer: ctx.accounts.cranker.key(),
            oracle_queue: ctx.accounts.oracle_queue.key(),
            callback_program_id: ID,
            callback_discriminator: instruction::ClearBatchCallback::DISCRIMINATOR.to_vec(),
            caller_seed,
            accounts_metas: Some(accounts_metas),
            ..Default::default()
        });
        ctx.accounts
            .invoke_signed_vrf(&ctx.accounts.cranker.to_account_info(), &ix)?;

        Ok(())
    }

    /// Invoked by the VRF oracle (never called directly by a client) once
    /// real randomness for the request above is ready. Runs the actual
    /// uniform-price auction over every order submitted this window,
    /// writes the clearing price and every fill to `Reveal`, and opens
    /// the next batch.
    pub fn clear_batch_callback(ctx: Context<ClearBatchCallback>, randomness: [u8; 32]) -> Result<()> {
        let market = &mut ctx.accounts.market;
        let mut order_book = ctx.accounts.order_book.load_mut()?;

        // Converting each raw on-chain order into the ergonomic
        // `clearing::Order` here is fine — this builds one small value at
        // a time onto the stack inside the loop and pushes it onto a
        // *heap*-allocated Vec; the thing that blew the stack before was
        // ever holding the whole 128-order array as one big struct value,
        // which this never does.
        let orders: Vec<Order> = order_book.orders[..order_book.order_count as usize]
            .iter()
            .map(|o| Order {
                id: o.id,
                trader: o.trader,
                side: if o.side == SIDE_BUY { Side::Buy } else { Side::Sell },
                price: o.price,
                qty: o.qty,
            })
            .collect();

        // Real VRF entropy — this is the actual marginal-allocation
        // tie-break the whole design leans on: rationing leftover
        // indivisible units by a seed nobody (including the traders who
        // just submitted orders, and the cranker who requested this) had
        // any way to predict or influence.
        let vrf_seed = u32::from_le_bytes([randomness[0], randomness[1], randomness[2], randomness[3]]);
        let result = run_clearing(&orders, vrf_seed);

        let mut reveal = ctx.accounts.reveal.load_mut()?;
        reveal.market = market.key();
        reveal.batch_id = order_book.batch_id;
        reveal.had_trade = if result.clearing_price.is_some() { 1 } else { 0 };
        reveal.clearing_price = result.clearing_price.unwrap_or(0);
        reveal.matched_qty = result.matched_qty;
        reveal.fill_count = result.fills.len().min(MAX_FILLS_PER_BATCH) as u16;
        for (i, f) in result.fills.iter().take(MAX_FILLS_PER_BATCH).enumerate() {
            let side_raw = if f.side == Side::Buy { SIDE_BUY } else { SIDE_SELL };
            reveal.fills[i] = OnchainFill::new(f.trader, side_raw, f.qty, f.price);
        }

        // Settle every order against its trader's balance: release the
        // full amount that order locked in `submit_order` (whether or
        // not it filled), then apply whatever actually filled at the
        // batch's one uniform price. `remaining_accounts` here is
        // whatever `clear_batch` requested the oracle hand back to this
        // callback — one `TraderAccount` per unique trader in the batch.
        let market_key = market.key();
        for order in orders.iter() {
            let fill = result.fills.iter().find(|f| f.order_id == order.id);
            settle_order(ctx.remaining_accounts, &market_key, order, fill)?;
        }

        order_book.batch_id += 1;
        order_book.order_count = 0;
        order_book.awaiting_vrf = 0;
        market.current_batch_id = order_book.batch_id;
        market.batch_open_slot = Clock::get()?.slot;

        Ok(())
    }

    /// Commits the market's settled state back to L1 and undelegates
    /// `market`, `order_book`, and `reveal` from the ER — the point where
    /// a batch's results become durable on mainnet rather than only
    /// existing inside the rollup. In production this is a periodic
    /// checkpoint (every N batches) driven by MagicBlock Automation, not
    /// something that has to happen every single batch.
    pub fn commit_and_undelegate<'info>(
        ctx: Context<'info, CommitAndUndelegate<'info>>,
    ) -> Result<()> {
        let market_key = ctx.accounts.market.key();
        let market_info = ctx.accounts.market.to_account_info();
        let order_book_info = ctx.accounts.order_book.to_account_info();
        let reveal_info = ctx.accounts.reveal.to_account_info();
        let mut accounts_to_commit = vec![
            &market_info,
            &order_book_info,
            &reveal_info,
        ];

        // Trader balance sheets are supplied as remaining accounts because a
        // batch can contain a variable number of traders. Validate every one
        // before asking the Magic program to commit it.
        for account in ctx.remaining_accounts.iter() {
            let data = account.try_borrow_data()?;
            let mut data_slice: &[u8] = &data;
            let trader_account = TraderAccount::try_deserialize(&mut data_slice)?;
            require_keys_eq!(trader_account.market, market_key, TickError::InvalidOrderParams);
            let (expected, _) = Pubkey::find_program_address(
                &[
                    TraderAccount::SEED_PREFIX,
                    market_key.as_ref(),
                    trader_account.owner.as_ref(),
                ],
                &ID,
            );
            require_keys_eq!(expected, account.key(), TickError::InvalidOrderParams);
            drop(data);
            accounts_to_commit.push(account);
        }

        commit_and_undelegate_accounts(
            &ctx.accounts.payer.to_account_info(),
            accounts_to_commit,
            &ctx.accounts.magic_context.to_account_info(),
            &ctx.accounts.magic_program.to_account_info(),
            None,
        )?;

        Ok(())
    }

    /// Opens a trader's balance sheet for a market — one PDA per
    /// (market, owner), holding the base/quote balances `submit_order`
    /// locks against and `clear_batch_callback` settles into. Required
    /// once, before a trader's first deposit or order.
    pub fn init_trader_account(ctx: Context<InitTraderAccount>) -> Result<()> {
        let trader_account = &mut ctx.accounts.trader_account;
        trader_account.market = ctx.accounts.market.key();
        trader_account.owner = ctx.accounts.trader.key();
        trader_account.base_balance = 0;
        trader_account.quote_balance = 0;
        trader_account.base_locked = 0;
        trader_account.quote_locked = 0;
        trader_account.bump = ctx.bumps.trader_account;
        Ok(())
    }

    /// Moves `amount` of the base token from the trader's own token
    /// account into the market's custody vault, crediting their
    /// `TraderAccount` balance by the same amount so it becomes
    /// available to back sell orders.
    pub fn deposit_base(ctx: Context<DepositBase>, amount: u64) -> Result<()> {
        require!(amount > 0, TickError::InvalidOrderParams);
        anchor_spl::token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.trader_token_account.to_account_info(),
                    to: ctx.accounts.base_vault.to_account_info(),
                    authority: ctx.accounts.trader.to_account_info(),
                },
            ),
            amount,
        )?;
        let trader_account = &mut ctx.accounts.trader_account;
        trader_account.base_balance =
            trader_account.base_balance.checked_add(amount).ok_or(TickError::Overflow)?;
        Ok(())
    }

    /// Same as `deposit_base`, for the quote token — this is what backs
    /// buy orders.
    pub fn deposit_quote(ctx: Context<DepositQuote>, amount: u64) -> Result<()> {
        require!(amount > 0, TickError::InvalidOrderParams);
        anchor_spl::token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.trader_token_account.to_account_info(),
                    to: ctx.accounts.quote_vault.to_account_info(),
                    authority: ctx.accounts.trader.to_account_info(),
                },
            ),
            amount,
        )?;
        let trader_account = &mut ctx.accounts.trader_account;
        trader_account.quote_balance =
            trader_account.quote_balance.checked_add(amount).ok_or(TickError::Overflow)?;
        Ok(())
    }

    /// Withdraws `amount` of the base token back to the trader — only
    /// ever from the *unlocked* balance, so funds backing an open order
    /// can't be pulled out from under it.
    pub fn withdraw_base(ctx: Context<WithdrawBase>, amount: u64) -> Result<()> {
        require!(amount > 0, TickError::InvalidOrderParams);
        let available = ctx
            .accounts
            .trader_account
            .base_balance
            .checked_sub(ctx.accounts.trader_account.base_locked)
            .ok_or(TickError::Overflow)?;
        require!(available >= amount, TickError::InsufficientBalance);
        ctx.accounts.trader_account.base_balance = ctx
            .accounts
            .trader_account
            .base_balance
            .checked_sub(amount)
            .ok_or(TickError::Overflow)?;

        let market = &ctx.accounts.market;
        let signer_seeds: &[&[u8]] =
            &[Market::SEED_PREFIX, market.base_mint.as_ref(), market.quote_mint.as_ref(), &[market.bump]];
        anchor_spl::token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.base_vault.to_account_info(),
                    to: ctx.accounts.trader_token_account.to_account_info(),
                    authority: ctx.accounts.market.to_account_info(),
                },
                &[signer_seeds],
            ),
            amount,
        )?;
        Ok(())
    }

    /// Same as `withdraw_base`, for the quote token.
    pub fn withdraw_quote(ctx: Context<WithdrawQuote>, amount: u64) -> Result<()> {
        require!(amount > 0, TickError::InvalidOrderParams);
        let available = ctx
            .accounts
            .trader_account
            .quote_balance
            .checked_sub(ctx.accounts.trader_account.quote_locked)
            .ok_or(TickError::Overflow)?;
        require!(available >= amount, TickError::InsufficientBalance);
        ctx.accounts.trader_account.quote_balance = ctx
            .accounts
            .trader_account
            .quote_balance
            .checked_sub(amount)
            .ok_or(TickError::Overflow)?;

        let market = &ctx.accounts.market;
        let signer_seeds: &[&[u8]] =
            &[Market::SEED_PREFIX, market.base_mint.as_ref(), market.quote_mint.as_ref(), &[market.bump]];
        anchor_spl::token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.quote_vault.to_account_info(),
                    to: ctx.accounts.trader_token_account.to_account_info(),
                    authority: ctx.accounts.market.to_account_info(),
                },
                &[signer_seeds],
            ),
            amount,
        )?;
        Ok(())
    }
}

/// Settles one order against its trader's `TraderAccount`: releases the
/// full amount that order locked in `submit_order` (regardless of
/// whether it filled), then — if `fill` is `Some` — applies the actual
/// trade at the batch's uniform price. Looks the trader's account up by
/// its canonical PDA among `remaining_accounts` rather than trusting
/// position alone, so a cranker can't settle an order against the wrong
/// trader's balance by reordering or substituting accounts.
fn settle_order<'info>(
    remaining_accounts: &'info [AccountInfo<'info>],
    market_key: &Pubkey,
    order: &Order,
    fill: Option<&clearing::Fill>,
) -> Result<()> {
    let (expected_pda, _bump) = Pubkey::find_program_address(
        &[TraderAccount::SEED_PREFIX, market_key.as_ref(), order.trader.as_ref()],
        &ID,
    );
    let info = remaining_accounts
        .iter()
        .find(|a| a.key() == expected_pda)
        .ok_or(error!(TickError::InvalidOrderParams))?;

    let mut trader_account: Account<TraderAccount> = Account::try_from(info)?;

    match order.side {
        Side::Buy => {
            let locked = order.price.checked_mul(order.qty).ok_or(TickError::Overflow)?;
            trader_account.quote_locked =
                trader_account.quote_locked.checked_sub(locked).ok_or(TickError::Overflow)?;
            if let Some(f) = fill {
                let cost = f.price.checked_mul(f.qty).ok_or(TickError::Overflow)?;
                trader_account.quote_balance =
                    trader_account.quote_balance.checked_sub(cost).ok_or(TickError::Overflow)?;
                trader_account.base_balance =
                    trader_account.base_balance.checked_add(f.qty).ok_or(TickError::Overflow)?;
            }
        }
        Side::Sell => {
            trader_account.base_locked =
                trader_account.base_locked.checked_sub(order.qty).ok_or(TickError::Overflow)?;
            if let Some(f) = fill {
                let proceeds = f.price.checked_mul(f.qty).ok_or(TickError::Overflow)?;
                trader_account.base_balance =
                    trader_account.base_balance.checked_sub(f.qty).ok_or(TickError::Overflow)?;
                trader_account.quote_balance =
                    trader_account.quote_balance.checked_add(proceeds).ok_or(TickError::Overflow)?;
            }
        }
    }

    trader_account.exit(&ID)
}

#[derive(Accounts)]
pub struct InitializeMarket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    pub base_mint: Account<'info, Mint>,
    pub quote_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = authority,
        space = Market::SPACE,
        seeds = [Market::SEED_PREFIX, base_mint.key().as_ref(), quote_mint.key().as_ref()],
        bump,
    )]
    pub market: Account<'info, Market>,

    #[account(
        init,
        payer = authority,
        token::mint = base_mint,
        token::authority = market,
        seeds = [b"base_vault", market.key().as_ref()],
        bump,
    )]
    pub base_vault: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = authority,
        token::mint = quote_mint,
        token::authority = market,
        seeds = [b"quote_vault", market.key().as_ref()],
        bump,
    )]
    pub quote_vault: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = authority,
        space = OrderBook::SPACE,
        seeds = [OrderBook::SEED_PREFIX, market.key().as_ref()],
        bump,
    )]
    pub order_book: AccountLoader<'info, OrderBook>,

    #[account(
        init,
        payer = authority,
        space = Reveal::SPACE,
        seeds = [Reveal::SEED_PREFIX, market.key().as_ref()],
        bump,
    )]
    pub reveal: AccountLoader<'info, Reveal>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

// `#[delegate]` (from `ephemeral_rollups_sdk::anchor`) reads the `del`
// marker on each `#[account(mut, del)]` field below and, for each one,
// generates the buffer/delegation-record/delegation-metadata PDA accounts
// the delegation program needs, plus a `delegate_<field>()` method that
// wraps `ephemeral_rollups_sdk::cpi::delegate_account`. It also fills in
// `owner_program`/`delegation_program`/`system_program` if they're not
// already present — confirmed by reading the macro's own source rather
// than assumed, since this crate moved fast enough that guessing was
// wrong more than once already in this build (see PLAN.md).
#[delegate]
#[derive(Accounts)]
#[instruction(base_mint: Pubkey, quote_mint: Pubkey, validator: Option<Pubkey>)]
pub struct DelegateOrderBook<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: constrained to the canonical PDA for `base_mint`/
    /// `quote_mint` by the seeds below. `UncheckedAccount` rather than
    /// `Account<Market>` on purpose — Anchor auto-reserializes a `mut`
    /// typed account when the instruction returns, which fails once
    /// `delegate_market` (below) has already handed this account's
    /// ownership to the delegation program mid-instruction. Confirmed by
    /// hitting exactly that error ("modified data of an account it does
    /// not own") against real devnet.
    #[account(
        mut, del,
        seeds = [Market::SEED_PREFIX, base_mint.as_ref(), quote_mint.as_ref()],
        bump,
    )]
    pub market: UncheckedAccount<'info>,

    /// CHECK: same reasoning as `market` above — real logs confirmed all
    /// three delegate CPIs (market, order_book, reveal) succeed, and the
    /// failure happens only once the instruction itself returns, i.e.
    /// exactly Anchor's auto-exit-write for whichever `mut` typed
    /// accounts remained. Both had to move to `UncheckedAccount`, not
    /// just `market`.
    #[account(mut, del, seeds = [OrderBook::SEED_PREFIX, market.key().as_ref()], bump)]
    pub order_book: UncheckedAccount<'info>,

    /// CHECK: see `order_book` above.
    #[account(mut, del, seeds = [Reveal::SEED_PREFIX, market.key().as_ref()], bump)]
    pub reveal: UncheckedAccount<'info>,
}

#[delegate]
#[derive(Accounts)]
#[instruction(market: Pubkey, validator: Option<Pubkey>)]
pub struct DelegateTraderAccount<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: constrained to the caller's canonical TraderAccount PDA.
    /// UncheckedAccount avoids Anchor trying to serialize after the
    /// delegation CPI has transferred ownership away from this program.
    #[account(
        mut,
        del,
        seeds = [
            TraderAccount::SEED_PREFIX,
            market.as_ref(),
            payer.key().as_ref(),
        ],
        bump,
    )]
    pub trader_account: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct InitTraderAccount<'info> {
    #[account(mut)]
    pub trader: Signer<'info>,

    #[account(seeds = [Market::SEED_PREFIX, market.base_mint.as_ref(), market.quote_mint.as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,

    #[account(
        init,
        payer = trader,
        space = TraderAccount::SPACE,
        seeds = [TraderAccount::SEED_PREFIX, market.key().as_ref(), trader.key().as_ref()],
        bump,
    )]
    pub trader_account: Account<'info, TraderAccount>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositBase<'info> {
    #[account(mut)]
    pub trader: Signer<'info>,

    #[account(seeds = [Market::SEED_PREFIX, market.base_mint.as_ref(), market.quote_mint.as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,

    #[account(mut, seeds = [b"base_vault", market.key().as_ref()], bump = market.base_vault_bump)]
    pub base_vault: Account<'info, TokenAccount>,

    #[account(mut, token::mint = market.base_mint, token::authority = trader)]
    pub trader_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [TraderAccount::SEED_PREFIX, market.key().as_ref(), trader.key().as_ref()],
        bump = trader_account.bump,
    )]
    pub trader_account: Account<'info, TraderAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct DepositQuote<'info> {
    #[account(mut)]
    pub trader: Signer<'info>,

    #[account(seeds = [Market::SEED_PREFIX, market.base_mint.as_ref(), market.quote_mint.as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,

    #[account(mut, seeds = [b"quote_vault", market.key().as_ref()], bump = market.quote_vault_bump)]
    pub quote_vault: Account<'info, TokenAccount>,

    #[account(mut, token::mint = market.quote_mint, token::authority = trader)]
    pub trader_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [TraderAccount::SEED_PREFIX, market.key().as_ref(), trader.key().as_ref()],
        bump = trader_account.bump,
    )]
    pub trader_account: Account<'info, TraderAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct WithdrawBase<'info> {
    #[account(mut)]
    pub trader: Signer<'info>,

    #[account(seeds = [Market::SEED_PREFIX, market.base_mint.as_ref(), market.quote_mint.as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,

    #[account(mut, seeds = [b"base_vault", market.key().as_ref()], bump = market.base_vault_bump)]
    pub base_vault: Account<'info, TokenAccount>,

    #[account(mut, token::mint = market.base_mint, token::authority = trader)]
    pub trader_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [TraderAccount::SEED_PREFIX, market.key().as_ref(), trader.key().as_ref()],
        bump = trader_account.bump,
    )]
    pub trader_account: Account<'info, TraderAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct WithdrawQuote<'info> {
    #[account(mut)]
    pub trader: Signer<'info>,

    #[account(seeds = [Market::SEED_PREFIX, market.base_mint.as_ref(), market.quote_mint.as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,

    #[account(mut, seeds = [b"quote_vault", market.key().as_ref()], bump = market.quote_vault_bump)]
    pub quote_vault: Account<'info, TokenAccount>,

    #[account(mut, token::mint = market.quote_mint, token::authority = trader)]
    pub trader_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [TraderAccount::SEED_PREFIX, market.key().as_ref(), trader.key().as_ref()],
        bump = trader_account.bump,
    )]
    pub trader_account: Account<'info, TraderAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SubmitOrder<'info> {
    #[account(mut)]
    pub trader: Signer<'info>,

    #[account(seeds = [Market::SEED_PREFIX, market.base_mint.as_ref(), market.quote_mint.as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,

    #[account(mut, seeds = [OrderBook::SEED_PREFIX, market.key().as_ref()], bump)]
    pub order_book: AccountLoader<'info, OrderBook>,

    #[account(
        mut,
        seeds = [TraderAccount::SEED_PREFIX, market.key().as_ref(), trader.key().as_ref()],
        bump = trader_account.bump,
    )]
    pub trader_account: Account<'info, TraderAccount>,
}

// `#[vrf]` (from `ephemeral_rollups_sdk::anchor`) adds whatever accounts
// the VRF oracle program CPI needs and generates `invoke_signed_vrf` —
// confirmed against MagicBlock's own `roll-dice` example, which uses the
// identical shape (payer + a domain account + an `oracle_queue`).
#[vrf]
#[derive(Accounts)]
pub struct ClearBatch<'info> {
    /// Anyone can crank this once the window has elapsed — in production
    /// this is called by MagicBlock Automation on a fixed cadence, not by
    /// a privileged party, which is part of why speed within a batch can't
    /// be bought: there's no gatekeeper to bribe or race either.
    #[account(mut)]
    pub cranker: Signer<'info>,

    #[account(seeds = [Market::SEED_PREFIX, market.base_mint.as_ref(), market.quote_mint.as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,

    #[account(mut, seeds = [OrderBook::SEED_PREFIX, market.key().as_ref()], bump)]
    pub order_book: AccountLoader<'info, OrderBook>,

    /// Only read here for its address (passed to the VRF callback via
    /// `accounts_metas`) — `clear_batch_callback` is what actually writes
    /// to it, once real randomness has arrived.
    #[account(seeds = [Reveal::SEED_PREFIX, market.key().as_ref()], bump)]
    pub reveal: AccountLoader<'info, Reveal>,

    /// CHECK: the VRF oracle queue for base-layer, ER, or local testing.
    #[account(
        mut,
        constraint =
            oracle_queue.key() == vrf::consts::DEFAULT_QUEUE ||
            oracle_queue.key() == vrf::consts::DEFAULT_EPHEMERAL_QUEUE ||
            oracle_queue.key() == vrf::consts::DEFAULT_TEST_QUEUE
            @ TickError::InvalidOrderParams
    )]
    pub oracle_queue: UncheckedAccount<'info>,
}

/// Invoked by the VRF oracle program, never called directly by a client —
/// `#[vrf_callback]` adds whatever verification that requires.
#[vrf_callback]
#[derive(Accounts)]
pub struct ClearBatchCallback<'info> {
    #[account(mut, seeds = [Market::SEED_PREFIX, market.base_mint.as_ref(), market.quote_mint.as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,

    #[account(mut, seeds = [OrderBook::SEED_PREFIX, market.key().as_ref()], bump)]
    pub order_book: AccountLoader<'info, OrderBook>,

    #[account(mut, seeds = [Reveal::SEED_PREFIX, market.key().as_ref()], bump)]
    pub reveal: AccountLoader<'info, Reveal>,
}

// `#[commit]` adds `magic_program`/`magic_context` (if not already
// present) — the two accounts `commit_and_undelegate_accounts` needs to
// CPI into the Magic program. It does not generate a commit method itself
// (unlike `#[delegate]`); the actual call happens in the instruction body
// above.
#[commit]
#[derive(Accounts)]
pub struct CommitAndUndelegate<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut)]
    pub market: Account<'info, Market>,

    #[account(mut)]
    pub order_book: AccountLoader<'info, OrderBook>,

    #[account(mut)]
    pub reveal: AccountLoader<'info, Reveal>,
}

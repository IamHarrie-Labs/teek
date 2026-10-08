//! Immutable venue binding, one-shot scoped VRF, atomic DBC opening purchase,
//! and conserved allocation claims. Legacy intake layouts remain unchanged.
use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use ephemeral_rollups_sdk::{anchor::{vrf, vrf_callback}, vrf::{self,
    instructions::{create_request_randomness_ix, RequestRandomnessParams}, types::SerializableAccountMeta}};
use crate::{dbc_wire as dbc, errors::TeekError as E, launch::{Launch, LaunchBid, LaunchStatus, MAX_LAUNCH_BIDDERS}, launch_allocation as allocation};

pub const STATE_SEED: &[u8] = b"launch_settlement";
pub const MINT_SEED: &[u8] = b"launch_token";
pub const BASE_SEED: &[u8] = b"launch_base";

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct LaunchMetadata { pub name: String, pub symbol: String, pub uri: String }

#[account]
pub struct SettlementState {
    pub launch: Pubkey,
    pub config_hash: [u8;32],
    /// SHA256 binds the ordered closed bids, funding, terms, config and venue.
    pub commitment: [u8;32],
    pub randomness: [u8;32],
    pub min_tokens_at_cap: u64,
    pub base_received: u64,
    pub quote_spent: u64,
    pub accepted: [u64;MAX_LAUNCH_BIDDERS],
    pub tokens: [u64;MAX_LAUNCH_BIDDERS],
    pub refunds: [u64;MAX_LAUNCH_BIDDERS],
    pub claimed: u32,
    /// 0=configured, 1=requested, 2=randomness ready, 3=settled.
    pub phase: u8,
    pub bump: u8,
    pub metadata: LaunchMetadata,
}
impl SettlementState { pub const SPACE: usize = 8+32*4+8*3+8*MAX_LAUNCH_BIDDERS*3+4+2+4*3+32+10+200; }

pub fn configure(ctx: Context<ConfigureLaunchSettlement>, min_tokens_at_cap: u64, metadata: LaunchMetadata) -> Result<()> {
    let launch = &ctx.accounts.launch;
    launch.check_funding(Clock::get()?.unix_timestamp)?;
    require!(launch.bid_count == 0 && min_tokens_at_cap > 0, E::InvalidTerms);
    require!(!metadata.name.is_empty() && metadata.name.len() <=32 && !metadata.symbol.is_empty()
        && metadata.symbol.len() <=10 && metadata.uri.len()<=200, E::InvalidTerms);
    require_keys_eq!(launch.terms.base_mint, Pubkey::find_program_address(&[MINT_SEED,launch.key().as_ref()],&crate::ID).0, E::InvalidLaunchAssets);
    let data = ctx.accounts.dbc_config.try_borrow_data()?;
    let config_hash = dbc::config_hash(&data,&launch.quote_mint)?;
    let threshold = u64::from_le_bytes(data[8+256..8+264].try_into().map_err(|_|E::InvalidDbcConfig)?);
    require!(launch.terms.max_raise <= threshold, E::InvalidDbcConfig);
    let state = &mut ctx.accounts.settlement;
    state.launch=launch.key(); state.config_hash=config_hash;
    state.min_tokens_at_cap=min_tokens_at_cap; state.metadata=metadata; state.bump=ctx.bumps.settlement;
    Ok(())
}

/// Verify the complete canonical set before requesting randomness or spending.
/// No missing account can poison a committed oracle request.
fn snapshot<'info>(launch: &Account<'info,Launch>, state: &SettlementState,
    accounts: &[AccountInfo<'info>]) -> Result<(Vec<u64>,Vec<u64>,[u8;32])> {
    let count=usize::from(launch.bid_count);
    require!(count<=MAX_LAUNCH_BIDDERS && accounts.len()==count, E::IncompleteBids);
    let mut weights=Vec::with_capacity(count); let mut funded=Vec::with_capacity(count);
    let mut encoded=Vec::new();
    encoded.extend_from_slice(b"teek/launch/snapshot/v1"); encoded.extend_from_slice(crate::ID.as_ref());
    encoded.extend_from_slice(launch.key().as_ref()); encoded.extend_from_slice(launch.creator.as_ref());
    encoded.extend_from_slice(launch.quote_mint.as_ref()); launch.terms.serialize(&mut encoded)?;
    encoded.extend_from_slice(&state.config_hash); encoded.extend_from_slice(&state.min_tokens_at_cap.to_le_bytes());
    state.metadata.serialize(&mut encoded)?; encoded.extend_from_slice(&launch.bid_count.to_le_bytes());
    let mut total=0u64;
    for (i,info) in accounts.iter().enumerate() {
        require_keys_eq!(*info.key,launch.bids[i],E::InvalidBid);
        require_keys_eq!(*info.owner,crate::ID,E::BidStillDelegated);
        let bid=LaunchBid::try_deserialize(&mut &info.try_borrow_data()?[..])?;
        require_keys_eq!(bid.launch,launch.key(),E::InvalidBid);
        require_keys_eq!(*info.key,Pubkey::find_program_address(&[LaunchBid::SEED,launch.key().as_ref(),bid.bidder.as_ref()],&crate::ID).0,E::InvalidBid);
        require!(!bid.privacy_ready && (bid.closed || bid.amount==0) && bid.amount<=bid.funded,E::InvalidBid);
        total=total.checked_add(bid.amount).ok_or(E::Overflow)?;
        encoded.extend_from_slice(info.key.as_ref()); encoded.extend_from_slice(bid.bidder.as_ref());
        encoded.extend_from_slice(&bid.funded.to_le_bytes()); encoded.extend_from_slice(&bid.amount.to_le_bytes());
        weights.push(bid.amount); funded.push(bid.funded);
    }
    require!(total==launch.total_bid && total>=launch.terms.min_raise
        && launch.accepted_total==total.min(launch.terms.max_raise),E::AllocationInvariant);
    Ok((weights,funded,solana_sha256_hasher::hash(&encoded).to_bytes()))
}

pub fn ready(launch: &Launch) -> Result<()> {
    require!(launch.status==LaunchStatus::Ready,E::SettlementNotReady);
    require!(Clock::get()?.unix_timestamp<launch.terms.settlement_deadline,E::SettlementExpired);
    Ok(())
}

pub fn request<'info>(ctx: Context<'info,RequestLaunchRandomness<'info>>) -> Result<()> {
    ready(&ctx.accounts.launch)?;
    require!(ctx.accounts.settlement.phase==0,E::RandomnessAlreadyRequested);
    let (_,_,commitment)=snapshot(&ctx.accounts.launch,&ctx.accounts.settlement,ctx.remaining_accounts)?;
    ctx.accounts.settlement.commitment=commitment; ctx.accounts.settlement.phase=1;
    let ix=create_request_randomness_ix(RequestRandomnessParams {
        payer:ctx.accounts.payer.key(),oracle_queue:ctx.accounts.oracle_queue.key(),callback_program_id:crate::ID,
        callback_discriminator:crate::instruction::LaunchRandomnessCallback::DISCRIMINATOR.to_vec(),
        caller_seed:commitment,callback_args:Some(commitment.to_vec()),
        accounts_metas:Some(vec![
            SerializableAccountMeta {pubkey:ctx.accounts.launch.key(),is_signer:false,is_writable:false},
            SerializableAccountMeta {pubkey:ctx.accounts.settlement.key(),is_signer:false,is_writable:true}]),
    });
    ctx.accounts.invoke_signed_vrf(&ctx.accounts.payer.to_account_info(),&ix)?;
    Ok(())
}

pub fn receive(ctx: Context<LaunchRandomnessCallback>, randomness: [u8;32], commitment: [u8;32]) -> Result<()> {
    ready(&ctx.accounts.launch)?;
    require!(ctx.accounts.settlement.phase==1 && ctx.accounts.settlement.commitment==commitment,E::RandomnessAlreadyRequested);
    // SDK scoped identity authenticates a request issued by THIS program.
    // Only request() selects this callback, validates the snapshot, and seals
    // this permanent PDA once. Oracle-authenticated callback args bind it.
    ctx.accounts.settlement.randomness=randomness; ctx.accounts.settlement.phase=2;
    Ok(())
}

pub fn settle<'info>(ctx: Context<'info,SettleLaunch<'info>>) -> Result<()> {
    ready(&ctx.accounts.launch)?;
    require!(ctx.accounts.settlement.phase==2,E::SettlementNotReady);
    let (weights,funding,commitment)=snapshot(&ctx.accounts.launch,&ctx.accounts.settlement,ctx.remaining_accounts)?;
    require!(commitment==ctx.accounts.settlement.commitment,E::AllocationInvariant);
    require!(dbc::config_hash(&ctx.accounts.dbc_config.try_borrow_data()?,&ctx.accounts.launch.quote_mint)?
        ==ctx.accounts.settlement.config_hash,E::InvalidDbcConfig);
    require!(ctx.accounts.pool.data_is_empty() && ctx.accounts.base_mint.data_is_empty()
        && ctx.accounts.allocation_vault.data_is_empty(),E::PoolAlreadyExists);
    let accepted_total=ctx.accounts.launch.accepted_total;
    let funded_total=funding.iter().try_fold(0u64,|a,b|a.checked_add(*b)).ok_or(E::Overflow)?;
    let before_quote=ctx.accounts.quote_vault.amount;
    require!(before_quote>=funded_total,E::AllocationInvariant);
    let min_out=allocation::minimum_output(ctx.accounts.settlement.min_tokens_at_cap,accepted_total,ctx.accounts.launch.terms.max_raise)?;
    let accepted=allocation::round(&weights,accepted_total,&ctx.accounts.settlement.randomness,&commitment,b"quote-acceptance/v1")?;
    let launch_key=ctx.accounts.launch.key(); let id=ctx.accounts.launch.launch_id.to_le_bytes();
    let lb=[ctx.accounts.launch.bump]; let mb=[ctx.bumps.base_mint]; let vb=[ctx.bumps.allocation_vault];
    let launch_seeds: &[&[u8]]=&[Launch::SEED,ctx.accounts.launch.creator.as_ref(),&id,&lb];
    let mint_seeds: &[&[u8]]=&[MINT_SEED,launch_key.as_ref(),&mb];
    let vault_seeds: &[&[u8]]=&[BASE_SEED,launch_key.as_ref(),&vb];
    // Clone infos once; no unchecked external executable can be substituted.
    let c=ctx.accounts.dbc_config.to_account_info(); let a=ctx.accounts.pool_authority.to_account_info();
    let l=ctx.accounts.launch.to_account_info(); let m=ctx.accounts.base_mint.to_account_info();
    let q=ctx.accounts.quote_mint.to_account_info(); let p=ctx.accounts.pool.to_account_info();
    let bv=ctx.accounts.dbc_base_vault.to_account_info(); let qv=ctx.accounts.dbc_quote_vault.to_account_info();
    let md=ctx.accounts.mint_metadata.to_account_info(); let mp=ctx.accounts.metadata_program.to_account_info();
    let payer=ctx.accounts.payer.to_account_info(); let token=ctx.accounts.token_program.to_account_info();
    let sys=ctx.accounts.system_program.to_account_info(); let event=ctx.accounts.dbc_event_authority.to_account_info();
    let program=ctx.accounts.dbc_program.to_account_info(); let av=ctx.accounts.allocation_vault.to_account_info();
    let escrow=ctx.accounts.quote_vault.to_account_info(); let creator=ctx.accounts.creator.to_account_info();
    let mut init=dbc::INIT.to_vec(); ctx.accounts.settlement.metadata.serialize(&mut init)?;
    dbc::call(init,&[(&c,false,false),(&a,false,false),(&l,false,true),(&m,true,true),(&q,false,false),
        (&p,true,false),(&bv,true,false),(&qv,true,false),(&md,true,false),(&mp,false,false),(&payer,true,true),
        (&token,false,false),(&token,false,false),(&sys,false,false),(&event,false,false),(&program,false,false)],
        &program,&[launch_seeds,mint_seeds])?;
    // Mint exists only after DBC initialization. Create a separate Teek vault.
    // Accept unsolicited lamport funding without letting it squat this PDA.
    let required=Rent::get()?.minimum_balance(TokenAccount::LEN).saturating_sub(av.lamports());
    if required>0 { system_program::transfer(CpiContext::new(sys.key(),system_program::Transfer {
        from:payer.clone(),to:av.clone() }),required)?; }
    system_program::allocate(CpiContext::new(sys.key(),system_program::Allocate { account_to_allocate:av.clone() })
        .with_signer(&[vault_seeds]),TokenAccount::LEN as u64)?;
    system_program::assign(CpiContext::new(sys.key(),system_program::Assign { account_to_assign:av.clone() })
        .with_signer(&[vault_seeds]),&token::ID)?;
    let init_vault=token::spl_token::instruction::initialize_account3(&token::ID,av.key,m.key,l.key)?;
    anchor_lang::solana_program::program::invoke(&init_vault,&[av.clone(),m.clone(),token.clone()])?;
    let mut swap=dbc::SWAP.to_vec(); swap.extend_from_slice(&accepted_total.to_le_bytes()); swap.extend_from_slice(&min_out.to_le_bytes());
    // Optional referral is represented by the DBC program ID sentinel.
    dbc::call(swap,&[(&a,false,false),(&c,false,false),(&p,true,false),(&escrow,true,false),(&av,true,false),
        (&bv,true,false),(&qv,true,false),(&m,false,false),(&q,false,false),(&l,false,true),
        (&token,false,false),(&token,false,false),(&program,false,false),(&event,false,false),(&program,false,false)],
        &program,&[launch_seeds])?;
    ctx.accounts.quote_vault.reload()?;
    let received=TokenAccount::try_deserialize(&mut &av.try_borrow_data()?[..])?.amount;
    require!(before_quote.checked_sub(ctx.accounts.quote_vault.amount)==Some(accepted_total),E::AllocationInvariant);
    require!(received>=min_out,E::LaunchSlippage);
    let tokens=allocation::round(&accepted,received,&ctx.accounts.settlement.randomness,&commitment,b"base-allocation/v1")?;
    // Preserve the user's native DBC creator-fee and LP rights. Teek's PDA is
    // only the creator while it atomically initializes and makes the first buy.
    dbc::call(dbc::TRANSFER_CREATOR.to_vec(),&[(&p,true,false),(&c,false,false),(&l,false,true),(&creator,false,false),
        (&event,false,false),(&program,false,false)],&program,&[launch_seeds])?;
    let state=&mut ctx.accounts.settlement;
    for i in 0..weights.len() {
        require!(accepted[i]<=weights[i],E::AllocationInvariant);
        state.accepted[i]=accepted[i]; state.tokens[i]=tokens[i];
        state.refunds[i]=funding[i].checked_sub(accepted[i]).ok_or(E::Overflow)?;
    }
    state.base_received=received; state.quote_spent=accepted_total; state.phase=3;
    ctx.accounts.launch.status=LaunchStatus::Settled;
    Ok(())
}

pub fn claim(ctx: Context<ClaimLaunchAllocation>) -> Result<()> {
    require!(ctx.accounts.launch.status==LaunchStatus::Settled && ctx.accounts.settlement.phase==3,E::SettlementNotReady);
    let index=ctx.accounts.launch.bids[..usize::from(ctx.accounts.launch.bid_count)]
        .iter().position(|key|*key==ctx.accounts.bid.key()).ok_or(E::InvalidBid)?;
    let bit=1u32.checked_shl(index as u32).ok_or(E::Overflow)?;
    require!(ctx.accounts.settlement.claimed & bit ==0,E::AlreadyClaimed);
    let quote=ctx.accounts.settlement.refunds[index]; let base=ctx.accounts.settlement.tokens[index];
    ctx.accounts.settlement.claimed|=bit;
    ctx.accounts.bid.funded=0;
    let id=ctx.accounts.launch.launch_id.to_le_bytes(); let bump=[ctx.accounts.launch.bump];
    let seeds: &[&[u8]]=&[Launch::SEED,ctx.accounts.launch.creator.as_ref(),&id,&bump];
    if quote>0 { token::transfer(CpiContext::new(ctx.accounts.token_program.key(),Transfer {
        from:ctx.accounts.quote_vault.to_account_info(),to:ctx.accounts.quote_destination.to_account_info(),
        authority:ctx.accounts.launch.to_account_info() }).with_signer(&[seeds]),quote)?; }
    if base>0 { token::transfer(CpiContext::new(ctx.accounts.token_program.key(),Transfer {
        from:ctx.accounts.allocation_vault.to_account_info(),to:ctx.accounts.base_destination.to_account_info(),
        authority:ctx.accounts.launch.to_account_info() }).with_signer(&[seeds]),base)?; }
    Ok(())
}

#[derive(Accounts)]
pub struct ConfigureLaunchSettlement<'info> {
    #[account(mut)] pub creator: Signer<'info>,
    #[account(seeds=[Launch::SEED,creator.key().as_ref(),&launch.launch_id.to_le_bytes()],bump=launch.bump,has_one=creator)]
    pub launch: Box<Account<'info,Launch>>,
    #[account(init,payer=creator,space=SettlementState::SPACE,seeds=[STATE_SEED,launch.key().as_ref()],bump)]
    pub settlement: Box<Account<'info,SettlementState>>,
    /// CHECK: exact DBC owner, key, discriminator, supported format and hash verified.
    #[account(address=launch.terms.dbc_config,owner=dbc::ID)] pub dbc_config: UncheckedAccount<'info>,
    pub system_program: Program<'info,System>,
}

#[vrf]
#[derive(Accounts)]
pub struct RequestLaunchRandomness<'info> {
    #[account(mut)] pub payer: Signer<'info>,
    #[account(seeds=[Launch::SEED,launch.creator.as_ref(),&launch.launch_id.to_le_bytes()],bump=launch.bump)]
    pub launch: Box<Account<'info,Launch>>,
    #[account(mut,seeds=[STATE_SEED,launch.key().as_ref()],bump=settlement.bump,has_one=launch)]
    pub settlement: Box<Account<'info,SettlementState>>,
    /// CHECK: only the production base-layer queue; no client-selected oracle.
    #[account(mut,address=vrf::consts::DEFAULT_QUEUE)] pub oracle_queue: UncheckedAccount<'info>,
}

#[vrf_callback]
#[derive(Accounts)]
pub struct LaunchRandomnessCallback<'info> {
    #[account(seeds=[Launch::SEED,launch.creator.as_ref(),&launch.launch_id.to_le_bytes()],bump=launch.bump)]
    pub launch: Box<Account<'info,Launch>>,
    #[account(mut,seeds=[STATE_SEED,launch.key().as_ref()],bump=settlement.bump,has_one=launch)]
    pub settlement: Box<Account<'info,SettlementState>>,
}

#[derive(Accounts)]
pub struct SettleLaunch<'info> {
    #[account(mut)] pub payer: Signer<'info>,
    #[account(mut,seeds=[Launch::SEED,launch.creator.as_ref(),&launch.launch_id.to_le_bytes()],bump=launch.bump)]
    pub launch: Box<Account<'info,Launch>>,
    #[account(mut,seeds=[STATE_SEED,launch.key().as_ref()],bump=settlement.bump,has_one=launch)]
    pub settlement: Box<Account<'info,SettlementState>>,
    #[account(mut,seeds=[b"launch_quote",launch.key().as_ref()],bump=launch.quote_vault_bump,
        token::mint=launch.quote_mint,token::authority=launch)] pub quote_vault: Box<Account<'info,TokenAccount>>,
    #[account(address=launch.quote_mint)] pub quote_mint: Box<Account<'info,Mint>>,
    /// CHECK: new Teek PDA mint is signed only for DBC creation.
    #[account(mut,address=launch.terms.base_mint,seeds=[MINT_SEED,launch.key().as_ref()],bump)] pub base_mint: UncheckedAccount<'info>,
    /// CHECK: SPL vault initialized after DBC creates the mint; canonical PDA.
    #[account(mut,seeds=[BASE_SEED,launch.key().as_ref()],bump,owner=system_program::ID)] pub allocation_vault: UncheckedAccount<'info>,
    /// CHECK: exact accepted DBC config owner and bytes.
    #[account(address=launch.terms.dbc_config,owner=dbc::ID)] pub dbc_config: UncheckedAccount<'info>,
    /// CHECK: canonical fresh DBC pool, initialized by pinned executable.
    #[account(mut,address=dbc::pool(&dbc_config.key(),&base_mint.key(),&quote_mint.key()))] pub pool: UncheckedAccount<'info>,
    /// CHECK: canonical DBC base vault.
    #[account(mut,address=dbc::vault(&base_mint.key(),&pool.key()))] pub dbc_base_vault: UncheckedAccount<'info>,
    /// CHECK: canonical DBC quote vault.
    #[account(mut,address=dbc::vault(&quote_mint.key(),&pool.key()))] pub dbc_quote_vault: UncheckedAccount<'info>,
    /// CHECK: pinned DBC authority.
    #[account(address=dbc::AUTHORITY)] pub pool_authority: UncheckedAccount<'info>,
    /// CHECK: pinned DBC event authority.
    #[account(address=dbc::event_authority())] pub dbc_event_authority: UncheckedAccount<'info>,
    /// CHECK: canonical Metaplex metadata PDA for the planned token.
    #[account(mut,address=dbc::metadata(&base_mint.key()))] pub mint_metadata: UncheckedAccount<'info>,
    /// CHECK: pinned executable Metaplex program.
    #[account(address=dbc::METADATA_ID,executable)] pub metadata_program: UncheckedAccount<'info>,
    /// CHECK: native DBC creator rights returned to immutable launch creator.
    #[account(address=launch.creator)] pub creator: UncheckedAccount<'info>,
    /// CHECK: pinned executable DBC program, never a user-selected CPI target.
    #[account(address=dbc::ID,executable)] pub dbc_program: UncheckedAccount<'info>,
    pub token_program: Program<'info,Token>, pub system_program: Program<'info,System>,
}

#[derive(Accounts)]
pub struct ClaimLaunchAllocation<'info> {
    pub bidder: Signer<'info>,
    #[account(seeds=[Launch::SEED,launch.creator.as_ref(),&launch.launch_id.to_le_bytes()],bump=launch.bump)]
    pub launch: Box<Account<'info,Launch>>,
    #[account(mut,seeds=[STATE_SEED,launch.key().as_ref()],bump=settlement.bump,has_one=launch)]
    pub settlement: Box<Account<'info,SettlementState>>,
    #[account(mut,seeds=[LaunchBid::SEED,launch.key().as_ref(),bidder.key().as_ref()],bump=bid.bump,has_one=launch,has_one=bidder)]
    pub bid: Account<'info,LaunchBid>,
    #[account(mut,seeds=[b"launch_quote",launch.key().as_ref()],bump=launch.quote_vault_bump,
        token::mint=launch.quote_mint,token::authority=launch)] pub quote_vault: Account<'info,TokenAccount>,
    #[account(mut,seeds=[BASE_SEED,launch.key().as_ref()],bump,token::mint=launch.terms.base_mint,token::authority=launch)]
    pub allocation_vault: Account<'info,TokenAccount>,
    #[account(mut,token::mint=launch.quote_mint,token::authority=bidder)] pub quote_destination: Account<'info,TokenAccount>,
    #[account(mut,token::mint=launch.terms.base_mint,token::authority=bidder)] pub base_destination: Account<'info,TokenAccount>,
    pub token_program: Program<'info,Token>,
}

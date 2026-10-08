//! Narrow DBC SPL-token adapter. ABI pinned to official SDK 1.5.13.
//! All program IDs, account order, discriminators and offsets are checked
//! against the installed official IDL in the integration suite.
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::{AccountMeta, Instruction}, program::invoke_signed};
use crate::errors::TeekError;

pub const ID: Pubkey = pubkey!("dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN");
pub const AUTHORITY: Pubkey = pubkey!("FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM");
pub const METADATA_ID: Pubkey = pubkey!("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
pub const INIT: [u8; 8] = [140,85,215,176,102,54,104,79];
pub const SWAP: [u8; 8] = [248,198,158,145,225,117,135,200];
pub const TRANSFER_CREATOR: [u8; 8] = [20,7,169,33,58,147,166,33];
pub const CONFIG: [u8; 8] = [26,108,14,123,116,230,129,43];

pub fn config_hash(data: &[u8], quote: &Pubkey) -> Result<[u8;32]> {
    require!(data.len() == 1048 && data[..8] == CONFIG, TeekError::InvalidDbcConfig);
    let b = &data[8..];
    require!(b[..32] == quote.to_bytes(), TeekError::InvalidDbcConfig);
    // Standard SPL base/quote only; immutable mint metadata; DAMM v2.
    require!(b[225] == 1 && b[229] == 0 && b[230] == 0 && b[238] == 1, TeekError::InvalidDbcConfig);
    require!((6..=9).contains(&b[227]) && b[224] <= 1 && b[226] <= 1, TeekError::InvalidDbcConfig);
    // Flat scheduler, dynamic fee disabled; CPI cannot use the top-level
    // first-swap-with-min-fee instruction inspection path.
    require!(b[104..122].iter().all(|x| *x == 0) && b[122] == 0
        && b[128] == 0 && b[357] == 0, TeekError::InvalidDbcConfig);
    Ok(solana_sha256_hasher::hash(data).to_bytes())
}

pub fn pool(config: &Pubkey, base: &Pubkey, quote: &Pubkey) -> Pubkey {
    let (high, low) = if base > quote { (base, quote) } else { (quote, base) };
    Pubkey::find_program_address(&[b"pool", config.as_ref(), high.as_ref(), low.as_ref()], &ID).0
}
pub fn vault(mint: &Pubkey, pool: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"token_vault", mint.as_ref(), pool.as_ref()], &ID).0
}
pub fn event_authority() -> Pubkey { Pubkey::find_program_address(&[b"__event_authority"], &ID).0 }
pub fn metadata(mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"metadata", METADATA_ID.as_ref(), mint.as_ref()], &METADATA_ID).0
}

/// Explicit metas retain signer privileges only where the pinned ABI needs them.
pub fn call<'info>(data: Vec<u8>, accounts: &[(&AccountInfo<'info>, bool, bool)],
    program: &AccountInfo<'info>, signers: &[&[&[u8]]]) -> Result<()> {
    let metas = accounts.iter().map(|(a, writable, signer)| if *writable {
        AccountMeta::new(*a.key, *signer)
    } else { AccountMeta::new_readonly(*a.key, *signer) }).collect();
    let mut infos: Vec<AccountInfo<'info>> = accounts.iter().map(|(a, _, _)| (*a).clone()).collect();
    infos.push(program.clone());
    invoke_signed(&Instruction { program_id: ID, accounts: metas, data }, &infos, signers)?;
    Ok(())
}

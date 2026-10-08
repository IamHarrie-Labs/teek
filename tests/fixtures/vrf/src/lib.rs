//! LOCAL VALIDATOR ONLY. Controlled oracle fixture, not a VRF proof.
//! It authenticates Teek's request PDA and signs callbacks with the same scoped
//! identity as production. Production deployment never uses this binary.
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{entrypoint, entrypoint::ProgramResult,
    instruction::{AccountMeta,Instruction}, program::invoke_signed};
entrypoint!(process_instruction);
const TICK: Pubkey=pubkey!("B6eqSCBhokuZLKqBrzwhquUho183P3Fvu8pgC4a9PFkY");
const VRF: Pubkey=pubkey!("Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz");
pub fn process_instruction(program_id:&Pubkey, accounts:&[AccountInfo], data:&[u8])->ProgramResult {
    if *program_id!=VRF { return Err(ProgramError::IncorrectProgramId); }
    if data.first()==Some(&10) {
        if accounts.len()<2 || !accounts[1].is_signer || *accounts[1].key!=Pubkey::find_program_address(&[b"identity"],&TICK).0 {
            return Err(ProgramError::MissingRequiredSignature);
        }
        return Ok(());
    }
    if data.len()!=65 || data[0]!=255 || accounts.len()!=4 { return Err(ProgramError::InvalidInstructionData); }
    let (identity,bump)=Pubkey::find_program_address(&[b"identity",TICK.as_ref()],&VRF);
    if *accounts[0].key!=identity || *accounts[3].key!=TICK || !accounts[3].executable { return Err(ProgramError::InvalidAccountData); }
    let mut payload=solana_sha256_hasher::hash(b"global:launch_randomness_callback").to_bytes()[..8].to_vec();
    payload.extend_from_slice(&data[1..]);
    let ix=Instruction{program_id:TICK,data:payload,accounts:vec![
        AccountMeta::new_readonly(identity,true),AccountMeta::new_readonly(*accounts[1].key,false),AccountMeta::new(*accounts[2].key,false)]};
    invoke_signed(&ix,accounts,&[&[b"identity",TICK.as_ref(),&[bump]]])
}

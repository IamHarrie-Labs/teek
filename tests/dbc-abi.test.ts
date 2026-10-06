import { BorshAccountsCoder, type Idl } from '@coral-xyz/anchor';
import { DynamicBondingCurveIdl } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { assert } from 'chai';
import { readFileSync } from 'fs';

describe('Pinned official Meteora DBC ABI', () => {
  const idl = DynamicBondingCurveIdl;
  const source = readFileSync('programs/tick/src/dbc_wire.rs', 'utf8');
  it('matches the production CPI discriminators and account ordering', () => {
    for (const [name,constant,accounts] of [
      ['initialize_virtual_pool_with_spl_token','INIT','config pool_authority creator base_mint quote_mint pool base_vault quote_vault mint_metadata metadata_program payer token_quote_program token_program system_program event_authority program'],
      ['swap','SWAP','pool_authority config pool input_token_account output_token_account base_vault quote_vault base_mint quote_mint payer token_base_program token_quote_program referral_token_account event_authority program'],
      ['transfer_pool_creator','TRANSFER_CREATOR','virtual_pool config creator new_creator event_authority program'],
    ]) {
      const instruction = idl.instructions.find(x => x.name === name)!;
      assert.deepEqual(instruction.accounts.map(x => x.name), accounts.split(' '));
      const bytes=source.match(new RegExp(`pub const ${constant}: \\[u8; 8\\] = \\[([^\\]]+)\\]`))![1].split(',').map(Number);
      assert.deepEqual(bytes,[...instruction.discriminator]);
    }
    assert.equal(idl.address,'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN');
  });
  it('matches the complete config layout and value-sensitive offsets', () => {
    const coder=new BorshAccountsCoder(idl as unknown as Idl);
    const layout=(coder as any).accountLayouts.get('PoolConfig').layout;
    assert.equal(layout.span,1040);
    for(const [field,offset] of Object.entries({quote_mint:0,pool_fees:96,migration_option:225,
      token_type:229,quote_token_flag:230,token_decimal:227,token_update_authority:238,
      migration_quote_threshold:256,enable_first_swap_with_min_fee:357}))assert.equal(layout.offsetOf(field),offset);
    assert.deepEqual([...idl.accounts.find(x=>x.name==='PoolConfig')!.discriminator],[26,108,14,123,116,230,129,43]);
  });
});

import { AnchorProvider } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient, DYNAMIC_BONDING_CURVE_PROGRAM_ID, type PoolConfig } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { assertSupportedDbcProfile } from './dbc-policy';
import { type LaunchWallet } from './launch';
import { creatorCurve, type CreatorCurveInput } from './dbc-config';

export const CREATOR_CONFIG_DRAFT_KEY='teek-creator-config-v1';
type RecordState={fingerprint:string;address:string;secret?:number[]};
type Store={version:1;records:RecordState[]};

export function creatorConfigFingerprint(creator:PublicKey,quote:PublicKey,input:CreatorCurveInput):string {
  return JSON.stringify({creator:creator.toBase58(),quote:quote.toBase58(),...input});
}
function records(storage:Storage):RecordState[] {
  try{const v=JSON.parse(storage.getItem(CREATOR_CONFIG_DRAFT_KEY)??'null') as Store|null;
    if(v?.version===1&&Array.isArray(v.records))return v.records.filter(r=>typeof r.fingerprint==='string'&&typeof r.address==='string'&&(!r.secret||Array.isArray(r.secret)));
  }catch{/* A corrupt draft is ignored. */}
  return [];
}
function save(storage:Storage,all:RecordState[]) {
  storage.setItem(CREATOR_CONFIG_DRAFT_KEY,JSON.stringify({version:1,records:all} satisfies Store));
}
export function pendingCreatorConfig(storage:Storage,fingerprint:string):{address:PublicKey;signer:Keypair|null} {
  const all=records(storage),record=all.find(r=>r.fingerprint===fingerprint);
  if(record){const address=new PublicKey(record.address);
    const signer=record.secret?Keypair.fromSecretKey(Uint8Array.from(record.secret)):null;
    if(signer&&!signer.publicKey.equals(address))throw Error('Saved curve signer does not match the configuration address.');
    return {address,signer};}
  const signer=Keypair.generate(),address=signer.publicKey;
  save(storage,[...all,{fingerprint,address:address.toBase58(),secret:Array.from(signer.secretKey)}]);
  return {address,signer};
}
function markCreated(storage:Storage,fingerprint:string) {
  const all=records(storage),record=all.find(r=>r.fingerprint===fingerprint);
  if(record){delete record.secret;save(storage,all);}
}

/** One DBC account per economic profile. An interrupted send is recovered by
 * reading the saved address before any retry. Browser storage must work before
 * spending rent, because the one-use account signer is kept there until mined. */
export async function createOrReuseCreatorConfig(input:{connection:Connection;dbc:DynamicBondingCurveClient;wallet:LaunchWallet;quote:PublicKey;profile:CreatorCurveInput;storage:Storage}):Promise<PublicKey> {
  const {connection,dbc,wallet,quote,profile,storage}=input;
  const curve=creatorCurve(profile),fingerprint=creatorConfigFingerprint(wallet.publicKey,quote,profile);
  const pending=pendingCreatorConfig(storage,fingerprint);
  let info=await connection.getAccountInfo(pending.address,'confirmed');
  if(!info){
    if(!pending.signer)throw Error('Saved curve signer is unavailable. The account has not appeared on devnet.');
    const tx=await dbc.partner.createConfig({...curve,config:pending.address,quoteMint:quote,payer:wallet.publicKey,feeClaimer:wallet.publicKey,leftoverReceiver:wallet.publicKey});
    const provider=new AnchorProvider(connection,wallet,{commitment:'confirmed',preflightCommitment:'confirmed'});
    try{await provider.sendAndConfirm(tx,[pending.signer]);}
    catch(error){info=await connection.getAccountInfo(pending.address,'confirmed');if(!info)throw error;}
    info??=await connection.getAccountInfo(pending.address,'confirmed');
  }
  if(!info||!info.owner.equals(DYNAMIC_BONDING_CURVE_PROGRAM_ID))throw Error('Created curve account is missing or has an unexpected owner.');
  assertSupportedDbcProfile(info.data);
  const decoded=dbc.state.program.coder.accounts.decode<PoolConfig>('poolConfig',info.data);
  if(!decoded.quoteMint.equals(quote)||!decoded.feeClaimer.equals(wallet.publicKey)||!decoded.leftoverReceiver.equals(wallet.publicKey)||
    decoded.creatorTradingFeePercentage!==profile.creatorFeePercent||decoded.creatorLiquidityPercentage!==profile.creatorLiquidityPercent||
    decoded.partnerPermanentLockedLiquidityPercentage!==100-profile.creatorLiquidityPercent||
    decoded.migrationQuoteThreshold.toString()!==(BigInt(profile.migrationQuoteThreshold)*10n**BigInt(profile.quoteDecimals)).toString()||
    decoded.poolFees.baseFee.cliffFeeNumerator.toString()!==curve.poolFees.baseFee.cliffFeeNumerator.toString())
    throw Error('Created curve does not match the reviewed economic profile.');
  markCreated(storage,fingerprint);
  return pending.address;
}

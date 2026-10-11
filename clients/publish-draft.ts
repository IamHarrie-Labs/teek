import { PublicKey } from '@solana/web3.js';
import { launchAddress, launchSettlement, type LaunchClient, type LaunchTermsInput, type Units } from './launch';

export const PUBLICATION_DRAFT_KEY='teek-publication-v1';
type RecordState={creator:string;fingerprint:string;id:string};
function records(storage:Storage):RecordState[]{
  try{const v=JSON.parse(storage.getItem(PUBLICATION_DRAFT_KEY)??'null') as {version?:number;records?:RecordState[]}|null;
    if(v?.version===1&&Array.isArray(v.records))return v.records.filter(r=>typeof r.creator==='string'&&typeof r.fingerprint==='string'&&/^\d+$/.test(r.id));
  }catch{/* Corrupt local drafts are ignored. */}return [];
}
export function publicationId(storage:Storage,creator:PublicKey,fingerprint:string):bigint {
  const all=records(storage),prior=all.find(r=>r.creator===creator.toBase58()&&r.fingerprint===fingerprint);
  if(prior)return BigInt(prior.id);
  const random=new Uint32Array(1);crypto.getRandomValues(random);
  const id=BigInt(Date.now())*1_000_000n+BigInt(random[0]%1_000_000);
  storage.setItem(PUBLICATION_DRAFT_KEY,JSON.stringify({version:1,records:[...all,{creator:creator.toBase58(),fingerprint,id:id.toString()}]}));
  return id;
}

/** Use the same launch PDA after an uncertain confirmation. A launched account
 * is accepted only if the public immutable fields equal this reviewed draft. */
export async function publishLaunchOnce(input:{client:LaunchClient;storage:Storage;fingerprint:string;quote:PublicKey;terms:Omit<LaunchTermsInput,'baseMint'>;minimumTokensAtCap:Units;metadata:{name:string;symbol:string;uri:string}}):Promise<PublicKey> {
  const {client,storage,fingerprint,quote,terms,minimumTokensAtCap,metadata}=input;
  const id=publicationId(storage,client.wallet.publicKey,fingerprint),address=launchAddress(client.wallet.publicKey,id);
  const recover=async():Promise<boolean>=>{
    const info=await client.connection.getAccountInfo(address,'confirmed');
    if(!info)return false;
    if(!info.owner.equals(client.base.programId))throw Error('Saved launch address has an unexpected owner.');
    const [launch,settlement]=await Promise.all([client.base.account.launch.fetch(address),client.base.account.settlementState.fetch(launchSettlement(address))]);
    const hash=Array.from(terms.manifestHash);
    if(!launch.creator.equals(client.wallet.publicKey)||!launch.quoteMint.equals(quote)||!launch.terms.dbcConfig.equals(terms.dbcConfig)||
      launch.terms.minRaise.toString()!==terms.minRaise.toString()||launch.terms.maxRaise.toString()!==terms.maxRaise.toString()||
      launch.terms.minBid.toString()!==terms.minBid.toString()||launch.terms.biddingOpensAt.toNumber()!==terms.biddingOpensAt||
      launch.terms.biddingClosesAt.toNumber()!==terms.biddingClosesAt||launch.terms.settlementDeadline.toNumber()!==terms.settlementDeadline||
      hash.some((v,i)=>launch.terms.manifestHash[i]!==v)||settlement.minTokensAtCap.toString()!==minimumTokensAtCap.toString()||
      settlement.metadata.name!==metadata.name||settlement.metadata.symbol!==metadata.symbol||settlement.metadata.uri!==metadata.uri)
      throw Error('Saved launch address exists with different terms. Do not publish this draft again.');
    return true;
  };
  if(await recover())return address;
  try{return await client.initializeVenue(id,quote,terms,minimumTokensAtCap,metadata);}
  catch(error){if(await recover())return address;throw error;}
}

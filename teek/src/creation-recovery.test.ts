import { describe, expect, it } from 'vitest';
import { BN } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import { pendingCreatorConfig } from '../../clients/creator-config';
import { publicationId, publishLaunchOnce } from '../../clients/publish-draft';
import { withPublicationLock } from '../../clients/publication-lock';
import type { LaunchClient } from '../../clients/launch';

function memoryStorage():Storage {
  const values=new Map<string,string>();
  return {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);},clear:()=>values.clear(),key:(index:number)=>Array.from(values.keys())[index]??null,get length(){return values.size;}};
}
describe('Recoverable launch creation',()=>{
  it('keeps the same curve signer and launch id for the same reviewed terms',()=>{
    const storage=memoryStorage(),creator=PublicKey.unique();
    const curve=pendingCreatorConfig(storage,'economics-a');
    expect(pendingCreatorConfig(storage,'economics-a').address.equals(curve.address)).toBe(true);
    expect(pendingCreatorConfig(storage,'economics-b').address.equals(curve.address)).toBe(false);
    const id=publicationId(storage,creator,'draft-a');
    expect(publicationId(storage,creator,'draft-a')).toBe(id);
    expect(publicationId(storage,creator,'draft-b')).not.toBe(id);
    for(let i=0;i<25;i++){pendingCreatorConfig(storage,`other-economics-${i}`);publicationId(storage,creator,`other-draft-${i}`);}
    expect(pendingCreatorConfig(storage,'economics-a').address.equals(curve.address)).toBe(true);
    expect(publicationId(storage,creator,'draft-a')).toBe(id);
  });
  it('recovers a confirmed launch after an RPC confirmation timeout without sending twice',async()=>{
    const storage=memoryStorage(),creator=PublicKey.unique(),quote=PublicKey.unique(),config=PublicKey.unique(),program=PublicKey.unique();
    const terms={dbcConfig:config,biddingOpensAt:100,biddingClosesAt:200,settlementDeadline:300,minRaise:100n,maxRaise:600n,minBid:1n,manifestHash:new Uint8Array(32)};
    const metadata={name:'Recovery',symbol:'REC',uri:''};
    let created=false,sends=0;
    const client={wallet:{publicKey:creator},connection:{getAccountInfo:async()=>created?{owner:program}:null},base:{programId:program,account:{
      launch:{fetch:async()=>({creator,quoteMint:quote,terms:{dbcConfig:config,minRaise:new BN(100),maxRaise:new BN(600),minBid:new BN(1),biddingOpensAt:new BN(100),biddingClosesAt:new BN(200),settlementDeadline:new BN(300),manifestHash:Array(32).fill(0)}})},
      settlementState:{fetch:async()=>({minTokensAtCap:new BN(5),metadata})}}},
      initializeVenue:async()=>{sends++;created=true;throw Error('confirmation timeout');}} as unknown as LaunchClient;
    const input={client,storage,fingerprint:'reviewed',quote,terms,minimumTokensAtCap:5n,metadata};
    let tail=Promise.resolve();
    const locks={request:(_name:string,_options:unknown,task:()=>Promise<PublicKey>)=>{const result=tail.then(task);tail=result.then(()=>undefined,()=>undefined);return result;}} as unknown as LockManager;
    const [first,second]=await Promise.all([withPublicationLock(creator,locks,()=>publishLaunchOnce(input)),withPublicationLock(creator,locks,()=>publishLaunchOnce(input))]);
    expect(first.equals(second)).toBe(true);expect(sends).toBe(1);
    await expect(withPublicationLock(creator,undefined,()=>publishLaunchOnce(input))).rejects.toThrow('cannot safely coordinate');
  });
  it('refuses to reuse a saved launch when public terms differ',async()=>{
    const storage=memoryStorage(),creator=PublicKey.unique(),program=PublicKey.unique(),quote=PublicKey.unique();
    const terms={dbcConfig:PublicKey.unique(),biddingOpensAt:100,biddingClosesAt:200,settlementDeadline:300,minRaise:100n,maxRaise:600n,minBid:1n,manifestHash:new Uint8Array(32)};
    const client={wallet:{publicKey:creator},connection:{getAccountInfo:async()=>({owner:program})},base:{programId:program,account:{launch:{fetch:async()=>({creator,quoteMint:quote,terms:{...terms,minRaise:new BN(101)}})},settlementState:{fetch:async()=>({minTokensAtCap:new BN(5),metadata:{name:'Recovery',symbol:'REC',uri:''}})}}}} as unknown as LaunchClient;
    await expect(publishLaunchOnce({client,storage,fingerprint:'reviewed',quote,terms,minimumTokensAtCap:5n,metadata:{name:'Recovery',symbol:'REC',uri:''}})).rejects.toThrow('different terms');
  });
});

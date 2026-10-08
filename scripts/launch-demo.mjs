// Hosted end-to-end devnet proof. Only real Private ER and production VRF.
// Keep disposable keys in ignored target/ for interruption recovery.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { Wallet, AnchorProvider } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, Transaction, SystemProgram, SYSVAR_CLOCK_PUBKEY } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, getAccount } from '@solana/spl-token';
import { DynamicBondingCurveClient, deriveDbcPoolAddress } from '@meteora-ag/dynamic-bonding-curve-sdk';
import nacl from 'tweetnacl';
const require=createRequire(import.meta.url),L=require('../target/launch-test-js/clients/launch.js'),{demoCurve}=require('../target/launch-test-js/clients/dbc-config.js'),{retryingFetch}=require('../target/launch-test-js/clients/rpc.js');
if(!process.env.ANCHOR_WALLET)throw Error('Set funded devnet authority wallet path');
const connection=new Connection('https://api.devnet.solana.com',{commitment:'confirmed',disableRetryOnRateLimit:true,fetch:retryingFetch});
if(await connection.getGenesisHash()!=='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')throw Error('Devnet only');
const payer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(process.env.ANCHOR_WALLET,'utf8'))));
const wallet=k=>Object.assign(new Wallet(k),{signMessage:async m=>nacl.sign.detached(m,k.secretKey)}),owner=new L.LaunchClient(connection,wallet(payer));
const root='target/launch-demo';mkdirSync(root,{recursive:true});
const path=`${root}/context.json`,save=()=>writeFileSync(path,JSON.stringify(context,null,2),{mode:0o600});
let context=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):null;
async function time(conn=connection){const a=await conn.getAccountInfo(SYSVAR_CLOCK_PUBKEY);return Number(a.data.readBigInt64LE(32));}
async function wait(check,label,timeout=180000){const end=Date.now()+timeout;while(!await check()){if(Date.now()>end)throw Error(`Timed out: ${label}. Rerun the demo to resume.`);await new Promise(r=>setTimeout(r,1000));}}
async function retry(fn){for(let n=0;;n++){try{return await fn();}catch(e){if(n>=3||!/429|fetch failed|blockhash|expired|timeout/i.test(String(e)))throw e;await new Promise(r=>setTimeout(r,2500));}}}
if(!context){
  const bidders=[Keypair.generate(),Keypair.generate()],quote=await createMint(connection,payer,payer.publicKey,null,6),config=Keypair.generate();
  const dbc=new DynamicBondingCurveClient(connection,'confirmed');
  const tx=await dbc.partner.createConfig({...demoCurve(),config:config.publicKey,quoteMint:quote,payer:payer.publicKey,feeClaimer:payer.publicKey,leftoverReceiver:payer.publicKey});
  await (owner.base.provider).sendAndConfirm(tx,[config]);
  context={quote:quote.toBase58(),config:config.publicKey.toBase58(),bidders:bidders.map(k=>Array.from(k.secretKey)),sources:[],setup:'funding',launches:[]};save();
}
const bidders=context.bidders.map(data=>Keypair.fromSecretKey(Uint8Array.from(data))),clients=bidders.map(k=>new L.LaunchClient(connection,wallet(k)));
if(context.setup==='funding'){
  for(let i=0;i<bidders.length;i++){
    const balance=await connection.getBalance(bidders[i].publicKey);
    if(balance<30_000_000)await owner.base.provider.sendAndConfirm(new Transaction().add(SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:bidders[i].publicKey,lamports:30_000_000-balance})));
    const ata=await getOrCreateAssociatedTokenAccount(connection,payer,new PublicKey(context.quote),bidders[i].publicKey);
    if(ata.amount<4_000_000n)await mintTo(connection,payer,new PublicKey(context.quote),ata.address,payer,4_000_000n-ata.amount);
    context.sources[i]=ata.address.toBase58();save();
  }
  context.setup='ready';save();
}
if(process.argv.includes('--setup-only')){console.log('Devnet demo mint, config and disposable bidder funding are ready; no launch window opened.');process.exit(0);}
const proof={network:'devnet',quoteToken:'synthetic SPL test token; not USDC',privacy:'bid amounts confidential during bidding; bids and earlier edit history public after close',oracle:'production MagicBlock scoped VRF',launches:[]};
function publish(){mkdirSync('teek/evidence',{recursive:true});writeFileSync('teek/evidence/launch-demo-devnet.json',JSON.stringify(proof,null,2));}
for(let n=0;n<2;n++){
  if(!context.launches[n]){
    const opens=await time()+100,closes=opens+50,deadline=closes+300;
    const launch=await owner.initializeVenue(String(Date.now()),new PublicKey(context.quote),{dbcConfig:new PublicKey(context.config),biddingOpensAt:opens,biddingClosesAt:closes,settlementDeadline:deadline,
      minRaise:n===0?'100000':'1000000',maxRaise:n===0?'600000':'1200000',minBid:'1000',manifestHash:new Uint8Array(32)},'1000000',{name:n===0?'Teek Opening':'Teek Refund',symbol:n===0?'OPEN':'BACK',uri:''});
    context.launches[n]={address:launch.toBase58(),opens,closes,deadline,stage:'created',signatures:[]};save();
  }
  const entry=context.launches[n],launch=new PublicKey(entry.address);
  console.log(`Launch ${n+1}: ${launch} (${entry.stage})`);
  if(entry.stage==='created'){
    for(let i=0;i<2;i++){
      const c=clients[i],address=L.launchBidAddress(launch,c.wallet.publicKey),info=await connection.getAccountInfo(address);
      if(!info)await retry(()=>c.register(launch,new PublicKey(context.sources[i]),i===0?'800000':'700000'));
      const current=await connection.getAccountInfo(address);if(current?.owner.equals(L.LAUNCH_PROGRAM_ID))await retry(()=>c.delegate(launch));
      await c.authenticate();await wait(async()=>!!await c.private.provider.connection.getAccountInfo(address),'private bid propagation',60000);
      const bid=await c.readOwnBid(launch);if(!bid.privacyReady)await c.activate(launch);
    }
    entry.stage='private';save();
  }
  if(entry.stage==='private'){
    for(const c of clients)await c.authenticate();await owner.authenticate();
    await wait(async()=>await time(clients[0].private.provider.connection)>=entry.opens,'bid opening',120000);
    for(let i=0;i<2;i++)entry.signatures.push(await clients[i].edit(launch,i===0?'333111':'456234'));
    const address=L.launchBidAddress(launch,clients[0].wallet.publicKey);assert.equal((await clients[0].readOwnBid(launch)).amount.toString(),'333111');
    const outsider=await clients[1].private.provider.connection.getAccountInfo(address);assert.equal(outsider,null,'Other bidder read a private bid');
    entry.privacyVerifiedAt=await time(clients[0].private.provider.connection);assert(entry.privacyVerifiedAt<entry.closes);entry.stage='bid';save();
  }
  if(entry.stage==='bid'){
    await owner.authenticate();await wait(async()=>await time(owner.private.provider.connection)>=entry.closes+2,'auction close',65000);
    for(const c of clients){const bid=L.launchBidAddress(launch,c.wallet.publicKey),info=await connection.getAccountInfo(bid);if(!info?.owner.equals(L.LAUNCH_PROGRAM_ID))entry.signatures.push(await owner.commitBid(launch,bid));}
    await wait(async()=>{const infos=await connection.getMultipleAccountsInfo(clients.map(c=>L.launchBidAddress(launch,c.wallet.publicKey)));return infos.every(info=>info?.owner.equals(L.LAUNCH_PROGRAM_ID));},'L1 returned bids',90000);
    const state=await owner.base.account.launch.fetch(launch);if('funding'in state.status)entry.signatures.push(await owner.close(launch));entry.stage='closed';save();
  }
  if(n===0&&entry.stage==='closed'){
    let state=await owner.base.account.settlementState.fetch(L.launchSettlement(launch));
    if(state.phase===0){entry.signatures.push(await owner.requestRandomness(launch));save();}
    await wait(async()=>{state=await owner.base.account.settlementState.fetch(L.launchSettlement(launch));return state.phase>=2;},'production VRF callback',120000);
    if(state.phase===2){entry.signatures.push(await owner.settle(launch));save();}
    entry.stage='settled';save();
  }
  if(n===0&&entry.stage==='settled'){
    const settlement=await owner.base.account.settlementState.fetch(L.launchSettlement(launch)),state=await owner.base.account.launch.fetch(launch);
    for(let i=0;i<2;i++){
      const destination=await getOrCreateAssociatedTokenAccount(connection,payer,state.terms.baseMint,clients[i].wallet.publicKey);
      if(!(settlement.claimed&(1<<i)))entry.signatures.push(await clients[i].claim(launch,new PublicKey(context.sources[i]),destination.address));
      assert.equal((await getAccount(connection,destination.address)).amount,BigInt(settlement.tokens[i].toString()));
    }
    assert.equal((await getAccount(connection,L.launchQuoteVault(launch))).amount,0n);assert.equal((await getAccount(connection,L.launchBaseVault(launch))).amount,0n);entry.stage='claimed';save();
  }
  if(n===1&&entry.stage==='closed'){
    const state=await owner.base.account.launch.fetch(launch);assert('refunds'in state.status);
    entry.fullRefunds??=[];
    for(let i=0;i<2;i++){
      const source=new PublicKey(context.sources[i]),bid=await owner.base.account.launchBid.fetch(L.launchBidAddress(launch,clients[i].wallet.publicKey));
      if(!bid.funded.isZero()){
        const before=(await getAccount(connection,source)).amount;
        entry.signatures.push(await clients[i].withdraw(launch,source,bid.funded));
        assert.equal((await getAccount(connection,source)).amount-before,BigInt(bid.funded.toString()));
        entry.fullRefunds[i]=bid.funded.toString();save();
      }
    }
    assert.equal((await getAccount(connection,L.launchQuoteVault(launch))).amount,0n);entry.stage='refunded';save();
  }
  const state=await owner.base.account.launch.fetch(launch),settlement=await owner.base.account.settlementState.fetch(L.launchSettlement(launch));
  const pool=deriveDbcPoolAddress(state.quoteMint,state.terms.baseMint,state.terms.dbcConfig);
  if(n===1)assert.equal(await connection.getAccountInfo(pool),null,'Failed launch created a pool');
  proof.launches.push({launch:launch.toBase58(),name:settlement.metadata.name,outcome:entry.stage,quoteMint:context.quote,config:context.config,pool:n===0?pool.toBase58():null,
    totalBids:state.totalBid.toString(),accepted:settlement.quoteSpent.toString(),quoteSpent:settlement.quoteSpent.toString(),baseReceived:settlement.baseReceived.toString(),allocations:settlement.tokens.slice(0,2).map(String),refunds:n===0?settlement.refunds.slice(0,2).map(String):entry.fullRefunds,privateReadDeniedDuringWindow:true,signatures:entry.signatures});publish();
  console.log(`PASS ${entry.stage}: ${launch}`);
}
console.log('Two real hosted launch demos completed. Public evidence contains no keys or auth tokens.');

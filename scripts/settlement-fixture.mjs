// Local-only chain integration. DBC and Metaplex are real cluster binaries;
// returned private bids are explicit genesis fixtures, and VRF is controlled.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import BN from 'bn.js';
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram,
  AddressLookupTableProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import { createMint, createAccount, mintTo, getAccount, getMint, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { DynamicBondingCurveClient, buildCurve, deriveDbcPoolAddress } from '@meteora-ag/dynamic-bonding-curve-sdk';
const require=createRequire(import.meta.url);
const {LaunchClient,launchAddress,launchToken,launchSettlement,launchBidAddress,launchQuoteVault,launchBaseVault,LAUNCH_PROGRAM_ID}=require('../target/launch-test-js/clients/launch.js');
const root='target/settlement-fixture'; mkdirSync(root,{recursive:true});
const connection=new Connection('http://127.0.0.1:8899','confirmed');
const rejectionChecks=[];
const key=data=>Keypair.fromSecretKey(Uint8Array.from(data));
const client=k=>new LaunchClient(connection,Object.assign(new Wallet(k),{signMessage:async()=>{throw Error('No private RPC in local fixture');}}));
async function clock(){const a=await connection.getAccountInfo(new PublicKey('SysvarC1ock11111111111111111111111111111111'));return Number(a.data.readBigInt64LE(32));}
async function reject(p,label){
  const expected={ 'unconfigured venue registration':'SettlementNotReady',
    'settlement before oracle request':'SettlementNotReady','duplicate randomness request':'RandomnessAlreadyRequested',
    'mismatched scoped callback commitment':'RandomnessAlreadyRequested','duplicate scoped callback':'RandomnessAlreadyRequested',
    'minimum-output rollback':'Slippage','unauthorized cancellation':'ConstraintSeeds',
    'callback after cancellation':'SettlementNotReady','duplicate settlement':'ConstraintOwner',
    'cancellation after settlement':'AlreadyClosed','duplicate claim':'AlreadyClaimed' }[label];
  let failed=false;try{await p;}catch(e){
    const detail=[String(e),...(e.logs??[]),e.error?.errorCode?.code??''].join('\n');
    assert(expected&&detail.includes(expected),`Unexpected rejection for ${label}: ${detail}`);
    failed=true;rejectionChecks.push({label,expectedCode:expected,passed:true});console.log(`PASS rejects ${label} (${expected})`);
  }assert(failed,`Expected rejection: ${label}`);
}
async function save(address,data){const a=await connection.getAccountInfo(address);assert(a);writeFileSync(`${root}/accounts/${address}.json`,JSON.stringify({pubkey:address.toBase58(),account:{lamports:a.lamports,data:[(data??a.data).toString('base64'),'base64'],owner:a.owner.toBase58(),executable:a.executable,rentEpoch:0}}));}
function encode(program,name,state){const record=program.coder.accounts.accountLayouts.get(name),buffer=Buffer.alloc(4096);const length=record.layout.encode(state,buffer);return Buffer.concat([Buffer.from(record.discriminator),buffer.subarray(0,length)]);}
if(process.argv[2]==='prepare'){
  mkdirSync(`${root}/accounts`,{recursive:true});
  const creator=Keypair.generate(),owner=client(creator), bidders=Array.from({length:24},()=>Keypair.generate());
  await connection.confirmTransaction(await connection.requestAirdrop(creator.publicKey,50e9),'confirmed');
  for(const bidder of bidders) await sendAndConfirmTransaction(connection,new Transaction().add(SystemProgram.transfer({fromPubkey:creator.publicKey,toPubkey:bidder.publicKey,lamports:100_000_000})),[creator]);
  const quote=await createMint(connection,creator,creator.publicKey,null,6);
  const config=Keypair.generate(),dbc=new DynamicBondingCurveClient(connection,'confirmed');
  const params=buildCurve({token:{tokenType:0,tokenBaseDecimal:6,tokenQuoteDecimal:6,tokenAuthorityOption:1,totalTokenSupply:1_000_000_000,leftover:0},
    fee:{baseFeeParams:{baseFeeMode:0,feeSchedulerParam:{startingFeeBps:100,endingFeeBps:100,numberOfPeriod:0,totalDuration:0}},dynamicFeeEnabled:false,collectFeeMode:0,creatorTradingFeePercentage:10,poolCreationFee:0,enableFirstSwapWithMinFee:false},
    migration:{migrationOption:1,migrationFeeOption:0,migrationFee:{feePercentage:0,creatorFeePercentage:0}},
    liquidityDistribution:{partnerPermanentLockedLiquidityPercentage:100,partnerLiquidityPercentage:0,creatorPermanentLockedLiquidityPercentage:0,creatorLiquidityPercentage:0},
    lockedVesting:{totalLockedVestingAmount:0,numberOfVestingPeriod:0,cliffUnlockAmount:0,totalVestingDuration:0,cliffDurationFromMigrationTime:0},
    activationType:0,percentageSupplyOnMigration:20,migrationQuoteThreshold:1000});
  const tx=await dbc.partner.createConfig({...params,config:config.publicKey,feeClaimer:creator.publicKey,leftoverReceiver:creator.publicKey,quoteMint:quote,payer:creator.publicKey});
  await sendAndConfirmTransaction(connection,tx,[creator,config]); console.log('PASS real DBC configuration creation');
  const sources=[];for(const bidder of bidders){const source=await createAccount(connection,creator,quote,bidder.publicKey);await mintTo(connection,creator,quote,source,creator,2_000_000);sources.push(source);}
  // Program-level race test: a planned PDA mint cannot accept deposits without binding.
  const start=await clock()+5000; const race=launchAddress(creator.publicKey,'99');
  const terms={dbcConfig:config.publicKey,biddingOpensAt:start,biddingClosesAt:start+5000,settlementDeadline:start+20000,minRaise:'100',maxRaise:'600000',minBid:'1',manifestHash:new Uint8Array(32)};
  await owner.initialize('99',quote,{...terms,baseMint:launchToken(race)});
  await reject(client(bidders[0]).register(race,sources[0],'1'),'unconfigured venue registration');
  const launches=[];
  for(const [id,count,min]of [['1',2,'1'],['2',2,'18446744073709551615'],['3',24,'1']]){
    const launch=await owner.initializeVenue(id,quote,terms,min,{name:id==='3'?'x'.repeat(32):id==='1'?'Teek Opening':'Teek Fixture',symbol:id==='3'?'x'.repeat(10):'TICK',uri:id==='3'?'x'.repeat(200):''});
    const state=await owner.base.account.launch.fetch(launch); const addresses=[];let total=0n,funded=0n;
    for(let i=0;i<count;i++){
      const address=launchBidAddress(launch,bidders[i].publicKey),amount=BigInt(333111+i*123123),funding=amount+100000n;
      const bump=PublicKey.findProgramAddressSync([Buffer.from('launch_bid'),launch.toBuffer(),bidders[i].publicKey.toBuffer()],LAUNCH_PROGRAM_ID)[1];
      const data=encode(owner.base,'launchBid',{launch,bidder:bidders[i].publicKey,funded:new BN(funding.toString()),amount:new BN(amount.toString()),privacyReady:false,closed:true,bump});
      writeFileSync(`${root}/accounts/${address}.json`,JSON.stringify({pubkey:address.toBase58(),account:{lamports:await connection.getMinimumBalanceForRentExemption(data.length),data:[data.toString('base64'),'base64'],owner:LAUNCH_PROGRAM_ID.toBase58(),executable:false,rentEpoch:0}}));
      addresses.push(address);total+=amount;funded+=funding;
    }
    await mintTo(connection,creator,quote,launchQuoteVault(launch),creator,funded);
    state.status={ready:{}};state.terms.biddingOpensAt=new BN(1);state.terms.biddingClosesAt=new BN(2);
    state.bidCount=count;state.bids=[...addresses,...Array(24-count).fill(PublicKey.default)];state.totalBid=new BN(total.toString());state.acceptedTotal=new BN('600000');
    await save(launch,encode(owner.base,'launch',state)); await save(launchSettlement(launch));await save(launchQuoteVault(launch));
    // Prove pre-funded PDA rent cannot prevent atomic mint/vault creation.
    for(const p of [launchToken(launch),launchBaseVault(launch)]){await sendAndConfirmTransaction(connection,new Transaction().add(SystemProgram.transfer({fromPubkey:creator.publicKey,toPubkey:p,lamports:1_000_000})),[creator]);await save(p);}
    launches.push({address:launch.toBase58(),count,funded:funded.toString()});
  }
  for(const address of [creator.publicKey,quote,config.publicKey,...bidders.map(k=>k.publicKey),...sources])await save(address);
  writeFileSync(`${root}/context.json`,JSON.stringify({creator:Array.from(creator.secretKey),bidders:bidders.map(k=>Array.from(k.secretKey)),sources:sources.map(String),quote:quote.toBase58(),config:config.publicKey.toBase58(),launches}),{mode:0o600});
  console.log('Prepared closed-bid genesis fixtures (no private-RPC or VRF proof claim).');
}else if(process.argv[2]==='verify'){
  const context=JSON.parse(readFileSync(`${root}/context.json`,'utf8')),creator=key(context.creator),owner=client(creator),dbc=new DynamicBondingCurveClient(connection,'confirmed');
  const config=new PublicKey(context.config),quote=new PublicKey(context.quote),vrf=new PublicKey('Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz');
  const identity=PublicKey.findProgramAddressSync([Buffer.from('identity'),LAUNCH_PROGRAM_ID.toBuffer()],vrf)[0];
  const evidence={network:'local',oracle:'controlled scoped oracle fixture, not production VRF',privateBids:'closed bid genesis fixtures; live privacy tested separately',programHash:createHash('sha256').update(readFileSync('target/deploy/teek.so')).digest('hex'),dbcMainnetHash:createHash('sha256').update(readFileSync('target/deploy/dbc-mainnet.so')).digest('hex'),metadataMainnetHash:createHash('sha256').update(readFileSync('target/deploy/metadata-mainnet.so')).digest('hex'),launches:[],checks:rejectionChecks};
  for(let n=0;n<context.launches.length;n++){
    const entry=context.launches[n],launch=new PublicKey(entry.address),settlement=launchSettlement(launch),pool=deriveDbcPoolAddress(quote,launchToken(launch),config);
    let tables=[];
    if(entry.count===24){
      const state=await owner.base.account.launch.fetch(launch);const [create,address]=AddressLookupTableProgram.createLookupTable({authority:creator.publicKey,payer:creator.publicKey,recentSlot:await connection.getSlot('finalized')});
      await sendAndConfirmTransaction(connection,new Transaction().add(create),[creator]);
      for(let i=0;i<24;i+=12)await sendAndConfirmTransaction(connection,new Transaction().add(AddressLookupTableProgram.extendLookupTable({payer:creator.publicKey,authority:creator.publicKey,lookupTable:address,addresses:state.bids.slice(i,i+12)})),[creator]);
      await new Promise(r=>setTimeout(r,1500));tables=[(await connection.getAddressLookupTable(address)).value];
    }
    await reject(owner.settle(launch,tables),'settlement before oracle request');
    const request=await owner.requestRandomness(launch,tables),state=await owner.base.account.settlementState.fetch(settlement);
    await reject(owner.requestRandomness(launch,tables),'duplicate randomness request');
    const fulfill=async commitment=>sendAndConfirmTransaction(connection,new Transaction().add(new TransactionInstruction({programId:vrf,keys:[{pubkey:identity,isSigner:false,isWritable:false},{pubkey:launch,isSigner:false,isWritable:false},{pubkey:settlement,isSigner:false,isWritable:true},{pubkey:LAUNCH_PROGRAM_ID,isSigner:false,isWritable:false}],data:Buffer.from([255,...Array.from({length:32},(_,i)=>i+1),...commitment])})),[creator]);
    await reject(fulfill(new Uint8Array(32)),'mismatched scoped callback commitment');
    const callback=await fulfill(state.commitment);await reject(fulfill(state.commitment),'duplicate scoped callback');
    if(n===1){
      const before=await getAccount(connection,launchQuoteVault(launch));await reject(owner.settle(launch,tables),'minimum-output rollback');
      assert.equal((await getAccount(connection,launchQuoteVault(launch))).amount,before.amount);
      assert.equal(await connection.getAccountInfo(pool),null);assert.equal((await owner.base.account.settlementState.fetch(settlement)).phase,2);
      assert.equal((await connection.getAccountInfo(launchToken(launch))).data.length,0);
      await reject(client(key(context.bidders[0])).cancel(launch),'unauthorized cancellation');
      await owner.cancel(launch);await reject(fulfill(state.commitment),'callback after cancellation');
      for(let i=0;i<entry.count;i++){const bidder=key(context.bidders[i]),c=client(bidder),bid=await c.base.account.launchBid.fetch(launchBidAddress(launch,bidder.publicKey));await c.withdraw(launch,new PublicKey(context.sources[i]),bid.funded);}
      assert.equal((await getAccount(connection,launchQuoteVault(launch))).amount,0n);
      evidence.launches.push({launch:launch.toBase58(),outcome:'swap rolled back; unauthorized cancel rejected; creator cancelled and all deposits refunded'});continue;
    }
    const signature=await owner.settle(launch,tables),settled=await owner.base.account.settlementState.fetch(settlement),poolState=await dbc.state.getPool(pool);
    assert(poolState.poolState.creator.equals(creator.publicKey));assert.equal((await getMint(connection,launchToken(launch))).mintAuthority,null);
    assert.equal(settled.accepted.reduce((a,b)=>a+BigInt(b.toString()),0n),600000n);
    assert.equal(settled.tokens.reduce((a,b)=>a+BigInt(b.toString()),0n),BigInt(settled.baseReceived.toString()));
    assert.equal(settled.refunds.reduce((a,b)=>a+BigInt(b.toString()),0n)+600000n,BigInt(entry.funded));
    await reject(owner.settle(launch,tables),'duplicate settlement');
    await reject(owner.cancel(launch),'cancellation after settlement');
    for(let i=0;i<entry.count;i++){
      const bidder=key(context.bidders[i]),source=new PublicKey(context.sources[i]),destination=await createAccount(connection,creator,launchToken(launch),bidder.publicKey);
      const before=(await getAccount(connection,source)).amount;await client(bidder).claim(launch,source,destination);
      assert.equal((await getAccount(connection,destination)).amount,BigInt(settled.tokens[i].toString()));
      assert.equal((await getAccount(connection,source)).amount-before,BigInt(settled.refunds[i].toString()));
      await reject(client(bidder).claim(launch,source,destination),'duplicate claim');
    }
    assert.equal((await getAccount(connection,launchQuoteVault(launch))).amount,0n);assert.equal((await getAccount(connection,launchBaseVault(launch))).amount,0n);
    const transaction=await connection.getTransaction(signature,{maxSupportedTransactionVersion:0,commitment:'confirmed'});
    evidence.launches.push({launch:launch.toBase58(),pool:pool.toBase58(),outcome:'settled and all allocations/refunds claimed',bidders:entry.count,quoteSpent:settled.quoteSpent.toString(),baseReceived:settled.baseReceived.toString(),computeUnits:transaction?.meta?.computeUnitsConsumed,signature,request,callback});
    console.log(`PASS atomic real DBC settlement + ${entry.count} conserved claims (${transaction?.meta?.computeUnitsConsumed} CU)`);
  }
  mkdirSync('teek/evidence',{recursive:true});writeFileSync('teek/evidence/settlement-local.json',JSON.stringify(evidence,null,2));
}else throw Error('Use prepare or verify on isolated loopback validator');

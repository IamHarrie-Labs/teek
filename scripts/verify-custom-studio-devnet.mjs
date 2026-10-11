// Exercises the same creator-config and publication helpers as Launch Studio.
// Uses only the existing disposable devnet demo wallet; private keys stay in ignored target/.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { Wallet } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';
import nacl from 'tweetnacl';

const require=createRequire(import.meta.url);
const { LaunchClient, launchAddress, launchSettlement }=require('../target/launch-test-js/clients/launch.js');
const { createOrReuseCreatorConfig }=require('../target/launch-test-js/clients/creator-config.js');
const { publishLaunchOnce, publicationId }=require('../target/launch-test-js/clients/publish-draft.js');
const { creatorCurve }=require('../target/launch-test-js/clients/dbc-config.js');
const { retryingFetch }=require('../target/launch-test-js/clients/rpc.js');
const root='target/launch-demo';
const context=JSON.parse(readFileSync(`${root}/context.json`,'utf8'));
const key=Keypair.fromSecretKey(Uint8Array.from(context.bidders[0]));
const wallet=Object.assign(new Wallet(key),{signMessage:async message=>nacl.sign.detached(message,key.secretKey)});
const connection=new Connection('https://api.devnet.solana.com',{commitment:'confirmed',disableRetryOnRateLimit:true,fetch:retryingFetch});
assert.equal(await connection.getGenesisHash(),'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG','Devnet only');
const quote=new PublicKey(context.quote);
const dbc=new DynamicBondingCurveClient(connection,'confirmed');
const client=new LaunchClient(connection,wallet);
const statePath=`${root}/custom-studio-state.json`;
const data=existsSync(statePath)?JSON.parse(readFileSync(statePath,'utf8')):{};
const storage={
  getItem:name=>data[name]??null,
  setItem:(name,value)=>{data[name]=value;writeFileSync(statePath,JSON.stringify(data),{mode:0o600});},
};
const profile={totalSupply:1_000_000_000,quoteDecimals:6,tradingFeeBps:100,creatorFeePercent:10,creatorLiquidityPercent:0,migrationQuoteThreshold:1000};
creatorCurve(profile);
const balance=await connection.getBalance(key.publicKey);
const configRent=await connection.getMinimumBalanceForRentExemption(1048);
if(balance<=configRent+12_000_000)console.log('Wallet balance is below the fresh-publish reserve; retry will only read existing accounts.');
console.log(`Devnet creator ${key.publicKey}; balance ${balance} lamports; config rent ${configRent} lamports.`);
const config=await createOrReuseCreatorConfig({connection,dbc,wallet,quote,profile,storage});
console.log(`Custom DBC configuration confirmed: ${config}`);
// Persist the dates before signing so a rerun has the same terms and launch PDA.
const launchPath=`${root}/custom-studio-launch.json`;
const existing=existsSync(launchPath)?JSON.parse(readFileSync(launchPath,'utf8')):null;
const now=Math.floor(Date.now()/1000);
const dates=existing??{opens:now+3600,closes:now+7200,deadline:now+10800};
if(!existing)writeFileSync(launchPath,JSON.stringify(dates),{mode:0o600});
const terms={dbcConfig:config,biddingOpensAt:dates.opens,biddingClosesAt:dates.closes,settlementDeadline:dates.deadline,minRaise:100_000n,maxRaise:600_000n,minBid:1_000n,manifestHash:new Uint8Array(32)};
const metadata={name:'Teek Custom Curve',symbol:'TCC',uri:''};
const fingerprint=JSON.stringify({creator:key.publicKey.toBase58(),quote:quote.toBase58(),config:config.toBase58(),...dates});
const manifest=JSON.stringify({version:1,quote:quote.toBase58(),config:config.toBase58(),minimumTokensAtCap:'1000000',dates});
terms.manifestHash=new Uint8Array(createHash('sha256').update(manifest).digest());
const expected=launchAddress(key.publicKey,publicationId(storage,key.publicKey,fingerprint));
const existedBefore=!!await connection.getAccountInfo(expected,'confirmed');
if(!existedBefore)assert((await connection.getBalance(key.publicKey))>12_000_000,'Disposable wallet needs more test SOL before publishing a new launch');
const address=await publishLaunchOnce({client,storage,fingerprint,quote,terms,minimumTokensAtCap:1_000_000n,metadata});
const [launch,settlement]=await Promise.all([client.base.account.launch.fetch(address),client.base.account.settlementState.fetch(launchSettlement(address))]);
assert(launch.creator.equals(key.publicKey)&&launch.terms.dbcConfig.equals(config)&&launch.quoteMint.equals(quote));
assert.equal(launch.terms.maxRaise.toString(),'600000');
assert.equal(settlement.minTokensAtCap.toString(),'1000000');
assert.equal(settlement.metadata.name,metadata.name);
const afterBalance=await connection.getBalance(key.publicKey);
if(existedBefore)assert.equal(afterBalance,balance,'Retry unexpectedly spent test SOL');
const [configHistory,launchHistory]=await Promise.all([connection.getSignaturesForAddress(config,{limit:3}),connection.getSignaturesForAddress(address,{limit:3})]);
const launchTransaction=launchHistory.find(tx=>!tx.err)?.signature??null;
const configTransaction=configHistory.find(tx=>!tx.err&&tx.signature!==launchTransaction)?.signature??null;
const evidence={network:'devnet',creator:key.publicKey.toBase58(),quoteMint:quote.toBase58(),dbcConfig:config.toBase58(),launch:address.toBase58(),launchPdaVerified:address.equals(expected),termsReadBack:true,minimumTokensAtCap:settlement.minTokensAtCap.toString(),configTransaction,launchTransaction,retryRecoveredExistingLaunch:existedBefore,retrySpentNoAdditionalSol:existedBefore?afterBalance===balance:null,observedAt:new Date().toISOString()};
assert(evidence.configTransaction&&evidence.launchTransaction,'Could not find successful devnet creation signatures');
mkdirSync('teek/evidence',{recursive:true});
writeFileSync('teek/evidence/custom-studio-devnet.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence));

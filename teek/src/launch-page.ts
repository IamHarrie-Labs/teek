import './polyfills';
import './launch-style.css';
import './brand.css';
import { brandHeader } from './brand';
import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction, SYSVAR_CLOCK_PUBKEY } from '@solana/web3.js';
import { getMint, unpackMint, getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction } from '@solana/spl-token';
import { AnchorProvider } from '@coral-xyz/anchor';
import nacl from 'tweetnacl';
import { LaunchClient, type LaunchWallet, launchBidAddress, launchSettlement } from '../../clients/launch';
import { parseAmount, formatAmount, averagePrice, escapeHtml as h, launchStage } from './launch-ui';
import { retryingFetch } from '../../clients/rpc';
import { DynamicBondingCurveClient, DYNAMIC_BONDING_CURVE_PROGRAM_ID, feeNumeratorToBps, type PoolConfig } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { buildLaunchReceipt, type LaunchReceipt, type CurvePolicy, type RefundProof } from '../../clients/launch-read';
import { verifyRefundHistory } from '../../clients/refund-history';
import { passportHtml, receiptCard, downloadReceipt, refundProofHtml } from './launch-passport';
import { installLaunchStudio, draftFingerprint, studioReviewHtml } from './launch-studio';
import { assertSupportedDbcProfile, configDigest } from '../../clients/dbc-policy';
import { rehearseLaunch } from '../../clients/launch-rehearsal';
import { creatorCurve, type CreatorCurveInput } from '../../clients/dbc-config';
import { createOrReuseCreatorConfig } from '../../clients/creator-config';
import { publishLaunchOnce } from '../../clients/publish-draft';
import { withPublicationLock } from '../../clients/publication-lock';

const connection = new Connection('https://api.devnet.solana.com', {commitment:'confirmed', disableRetryOnRateLimit:true, fetch:retryingFetch});
const dbc = new DynamicBondingCurveClient(connection, 'confirmed');
const app = document.querySelector<HTMLDivElement>('#app')!;
const storage = 'teek-launch-devnet-demo-wallet';
let wallet: LaunchWallet | undefined, client: LaunchClient | undefined, selected: PublicKey | undefined;
let generation = 0;
let chainOffset = 0;
let loading = false;
let reloadQueued = false;
let detailGeneration = 0;
let discoverAll = false;
// Retain explicit payment audits across account refreshes, with their own timestamp.
const refundProofs=new Map<string,RefundProof>();
type Venue = {publicKey:PublicKey; account:Awaited<ReturnType<LaunchClient['base']['account']['launch']['fetch']>>;
  settlement:Awaited<ReturnType<LaunchClient['base']['account']['settlementState']['fetch']>>; decimals:number; baseDecimals:number; receipt:LaunchReceipt};
let venues:Venue[] = [];
app.innerHTML = `${brandHeader('launch','<button id="wallet">Connect wallet</button><button id="demo" class="quiet">Use demo wallet</button>')}
<main id="main-content"><section class="intro"><div class="eyebrow">PRIVATE BIDS · PUBLIC TRADING</div><h1>One opening.<br>On your terms.</h1><div class="intro-aside"><p>Set your launch terms, take bids privately, then open trading on Meteora.</p><button id="create" class="primary">Create a launch <span aria-hidden="true">↗</span></button></div></section>
<div class="notice">Devnet test assets. Deposits are public. Bids and edits become public after bidding closes.</div>
<section class="demo-guide" aria-label="Start here"><div><h3>See a finished launch</h3><p>These two examples have closed. You can inspect them without a wallet.</p></div><div class="demo-links"><a href="?launch=4orftfqsHc92GJVrFSuvqZKab3LsL4txyNm7BjUYWuwY">Opening purchase ↗</a><a href="?launch=B2PstiXkcw81SDafJrzQ8eB4YbcG3eYS33hH1Jjq1Y4X">Full refund ↗</a></div></section>
<section class="launches"><div class="section-title"><h2 id="list-title">Featured launches</h2><div><button id="browse" class="quiet">Browse all</button> <button id="refresh" class="quiet">Refresh</button></div></div><div id="list" aria-live="polite"><div class="skeleton">Loading launch terms…</div></div></section>
<section id="detail" hidden aria-label="Launch details"></section>
<section class="explain"><article><span>01</span><h3>Check the terms</h3><p>See the raise limits, token minimum and curve before you deposit.</p></article><article><span>02</span><h3>Place your bid</h3><p>Fund your wallet, then choose how much to bid. You can change it until bidding closes.</p></article><article><span>03</span><h3>Open or refund</h3><p>If the launch meets its terms, everyone shares one purchase. Otherwise, deposits can be claimed back.</p></article></section>
<footer class="page-footer"><span>Teek · Solana devnet</span><a href="/evidence.html">How it works and proof ↗</a></footer></main>
<div id="status" role="status" aria-live="polite" hidden></div>
<dialog id="create-dialog"><form id="create-form"><div class="section-title"><h2>Launch Studio</h2><button type="button" id="dismiss" aria-label="Close create launch">×</button></div><ol class="studio-steps" aria-label="Creation progress"><li data-step-label>01 · Identity</li><li data-step-label>02 · Launch terms</li><li data-step-label>03 · Review</li></ol>
<section data-studio-step><h3>Name your token.</h3><p class="muted">Your draft stays in this browser until you publish.</p><div class="form-grid">${field('name','Token name','text','Teek Opening',true)}${field('symbol','Symbol','text','DEMO',true)}${field('uri','Metadata URL (optional)','url','',false)}</div><p class="muted">Teek does not upload artwork yet. If you use your own metadata URL, you control the content behind it.</p></section>
<section data-studio-step hidden><h3>Choose the opening terms.</h3><div class="notice">Devnet · synthetic quote tokens, not USDC. The curve and its fee and liquidity policies are locked before participants fund.</div><div class="form-grid">${field('minimum','Minimum raise (quote tokens)','text','0.1',true,'decimal')}${field('maximum','Raise cap (quote tokens)','text','0.6',true,'decimal')}${field('minbid','Minimum bid (quote tokens)','text','0.001',true,'decimal')}${field('minout','Minimum tokens received at cap','text','1',true,'decimal')}${field('opens','Funding closes / bids open','datetime-local','',true)}${field('closes','Bids close','datetime-local','',true)}${field('deadline','Settlement deadline','datetime-local','',true)}${field('quote','Quote mint address','text','GR5J9vsRr4WauZMaj6NvqYJHxRQjVjzcsTuwv2LgADPj',true)}</div><label for="curve-mode">Curve source<select id="curve-mode" name="curve-mode"><option value="existing">Use an existing supported curve</option><option value="custom">Create my own supported curve</option></select></label><div id="custom-fields" class="studio-advanced" hidden><p class="muted">Your wallet receives the partner fee and leftover rights. Unlocked creator LP and permanently locked partner LP add to 100%.</p><div class="form-grid">${field('curve-supply','Total token supply','text','1000000000',false,'numeric')}${field('curve-fee','Flat trading fee (basis points)','text','100',false,'numeric')}${field('curve-creator-fee','Creator share of native fee portion (%)','text','10',false,'numeric')}${field('curve-creator-lp','Unlocked creator migrated LP (%)','text','0',false,'numeric')}${field('curve-threshold','Curve migration threshold (quote tokens)','text','1000',false,'numeric')}</div><p class="muted">A new curve requires one devnet configuration transaction before Teek can publish immutable launch terms. The browser saves the one-use signer until the curve is confirmed.</p></div><details id="existing-curve-details" class="studio-advanced"><summary>Advanced: use another supported devnet configuration</summary>${field('config','DBC configuration address','text','BbfNG9UKRkbKnrv17BBUVXZASFUuSpt1CnEDNWukhDiy',true)}<p class="muted">Use standard SPL assets, DAMM v2 migration, flat fees and immutable token metadata.</p></details><details class="studio-advanced"><summary>Rehearse hypothetical total bids</summary>${field('scenario','Example total bids (quote tokens)','text','0.9',true,'decimal')}<p class="muted">This is only an example. It is never read from live private demand and does not become a launch term.</p></details></section>
<section data-studio-step hidden><h3>Review your launch.</h3><div id="studio-review"></div><p class="muted">If less than the cap is accepted, the token minimum scales with it. Participants share the actual opening price, including curve fees.</p></section><p id="studio-draft-note" class="muted"></p><p id="create-error" role="alert"></p><div class="studio-controls"><button id="studio-back" type="button" class="quiet" hidden>Back</button><button id="studio-next" type="button" class="primary">Continue to launch terms</button><button class="primary" type="submit" hidden>Publish launch</button></div></form></dialog>`;
function field(id:string,label:string,type:string,value:string,required:boolean,mode?:string) {return `<label for="${id}">${label}${required?' *':''}<input id="${id}" name="${id}" type="${type}" value="${value}" ${required?'required':''} ${mode?`inputmode="${mode}"`:''} autocomplete="off" spellcheck="false"></label>`;}
const el = <T extends HTMLElement=HTMLElement>(id:string) => document.getElementById(id) as T;
function status(message:string,error=false){const box=el('status');box.hidden=false;box.className=error?'error':'';box.textContent=message;}
function short(key:PublicKey){const s=key.toBase58();return `${s.slice(0,4)}…${s.slice(-4)}`;}
function requireClient(){if(!client)throw Error('Connect a wallet or use a disposable devnet demo wallet first.');return client;}
async function getTestFunds(quote:PublicKey){const c=requireClient(),local=['127.0.0.1','localhost'].includes(location.hostname);
  const response=await fetch(local?'http://127.0.0.1:8790/fund':'/api/fund',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({wallet:c.wallet.publicKey.toBase58(),quoteMint:quote.toBase58()})});
  const result=await response.json().catch(()=>({}));if(!response.ok)throw Error(result.error??(local?'Test funding unavailable. Start the local demo funding server.':'Test funding is unavailable right now.'));
  return result.signature??{message:'This wallet already has test funds.'};}
function errorText(error:unknown){const e=error as {error?:{errorMessage?:string};message?:string};const message=e.error?.errorMessage??e.message??'Request failed. Try again.';if(/429|rate limit/i.test(message))return 'Solana devnet is busy. Wait a moment and try again. Recorded launch receipts remain available on the Evidence page.';if(/failed to fetch|network error/i.test(message))return 'Could not reach Solana devnet. Check your connection and try again.';if(/insufficient funds for rent|insufficient lamports|no record of a prior credit|insufficient funds for fee/i.test(message))return 'Your wallet is out of test SOL, which pays the small network fee. Press “Get test funds” and try again.';return message.replace(/https?:\/\/\S*token=\S*/g,'[private session]');}
async function action(button:HTMLButtonElement,label:string,fn:()=>Promise<unknown>,refresh=true){if(button.disabled)return;const old=button.textContent;button.disabled=true;button.setAttribute('aria-busy','true');button.textContent=label;status(label);try{const result=await fn();status(result&&typeof result==='object'&&'message'in result?String(result.message):typeof result==='string'?'Confirmed on devnet.':'Done.');if(typeof result==='string'&& /^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(result)){const link=document.createElement('a');link.href=`https://explorer.solana.com/tx/${result}?cluster=devnet`;link.textContent=' View transaction ↗';link.target='_blank';link.rel='noreferrer';el('status').append(link);}if(refresh){await load(true);for(const delay of [2500,6000])setTimeout(()=>void load(true),delay);}}catch(error){status(errorText(error),true);const inline=button.closest('form')?.querySelector('[role=alert]');if(inline)inline.textContent=errorText(error);}finally{button.disabled=false;button.removeAttribute('aria-busy');button.textContent=button.id==='wallet'&&wallet?short(wallet.publicKey):old;}}
function useWallet(w:LaunchWallet){wallet=w;client=new LaunchClient(connection,w);el('wallet').textContent=short(w.publicKey);el('demo').hidden=true;void load();}
el<HTMLButtonElement>('demo').onclick=()=>{
  try{const stored=localStorage.getItem(storage),key=stored?Keypair.fromSecretKey(Uint8Array.from(JSON.parse(stored))):Keypair.generate();if(!stored)localStorage.setItem(storage,JSON.stringify(Array.from(key.secretKey)));
    const sign=async<T extends Transaction|VersionedTransaction>(tx:T):Promise<T>=>{if('version' in tx)(tx as VersionedTransaction).sign([key]);else (tx as Transaction).partialSign(key);return tx;};
    useWallet({publicKey:key.publicKey,signTransaction:sign,signAllTransactions:async txs=>Promise.all(txs.map(sign)),signMessage:async message=>nacl.sign.detached(message,key.secretKey)} as LaunchWallet);
    status('Disposable devnet wallet ready. Use “Get test funds” in a launch. This wallet is stored only in this browser.');
  }catch(error){status(errorText(error),true);}
};
el<HTMLButtonElement>('wallet').onclick=async()=>{
  if(wallet){await navigator.clipboard.writeText(wallet.publicKey.toBase58());status('Wallet address copied.');return;}
  const injected=(window as unknown as {solana?:LaunchWallet&{connect():Promise<unknown>};phantom?:{solana:LaunchWallet&{connect():Promise<unknown>}}});
  const adapter=injected.phantom?.solana??injected.solana;
  if(!adapter){status('No Solana wallet found. Use the disposable demo wallet or install a Solana wallet.',true);return;}
  await action(el('wallet'),'Connecting…',async()=>{await adapter.connect();useWallet(adapter);});
};
el<HTMLButtonElement>('refresh').onclick=()=>void load();
el<HTMLButtonElement>('browse').onclick=()=>{discoverAll=!discoverAll;el('browse').textContent=discoverAll?'Show featured':'Browse all';el('list-title').textContent=discoverAll?'All launches':'Featured launches';void load();};
function readLaunchLink(){const query=new URLSearchParams(location.search).get('launch');if(!query)return;try{selected=new PublicKey(query);}catch{history.replaceState(null,'',location.pathname);status('This launch link is invalid. Choose a launch below.',true);}}
async function load(quiet=false){
  // A refresh asked for mid-load runs once that load ends, so post-action checks are never dropped.
  if(loading){reloadQueued=true;return;}loading=true;reloadQueued=false;
  const ticket=++generation;if(!quiet)el('list').innerHTML='<div class="skeleton">Loading launch terms…</div>';
  try{
    const reader=client??new LaunchClient(connection,{publicKey:PublicKey.default,signTransaction:async()=>{throw Error('Connect wallet');},signAllTransactions:async()=>{throw Error('Connect wallet');},signMessage:async()=>{throw Error('Connect wallet');}} as LaunchWallet);
    if(!selected)readLaunchLink();
    const featured=[...new Map(['4orftfqsHc92GJVrFSuvqZKab3LsL4txyNm7BjUYWuwY','B2PstiXkcw81SDafJrzQ8eB4YbcG3eYS33hH1Jjq1Y4X',...(selected?[selected.toBase58()]:[])].map(address=>[address,new PublicKey(address)])).values()];
    // Direct linked/featured reads keep judging independent of expensive program scans.
    const launchRead=discoverAll?reader.base.account.launch.all():reader.base.account.launch.fetchMultiple(featured).then(accounts=>accounts.flatMap((account,i)=>account?[{publicKey:featured[i],account}]:[]));
    const stateRead=discoverAll?reader.base.account.settlementState.all():reader.base.account.settlementState.fetchMultiple(featured.map(launchSettlement)).then(accounts=>accounts.flatMap((account,i)=>account?[{publicKey:launchSettlement(featured[i]),account}]:[]));
    const [launches,states,clock]=await Promise.all([launchRead,stateRead,connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY)]);
    if(clock)chainOffset=Number(clock.data.readBigInt64LE(32))-Math.floor(Date.now()/1000);
    const map=new Map(states.map(x=>[x.account.launch.toBase58(),x.account]));const result:Venue[]=[];
    // Batch and deduplicate shared mint/config reads instead of two RPCs per venue.
    const keys=[...new Map(launches.filter(x=>map.has(x.publicKey.toBase58())).flatMap(x=>[x.account.quoteMint,x.account.terms.dbcConfig]).map(key=>[key.toBase58(),key])).values()];
    const infos=new Map<string,Awaited<ReturnType<Connection['getAccountInfo']>>>();
    for(let i=0;i<keys.length;i+=100){const chunk=keys.slice(i,i+100),accounts=await connection.getMultipleAccountsInfo(chunk);chunk.forEach((key,j)=>infos.set(key.toBase58(),accounts[j]));}
    for(const launch of launches){const settlement=map.get(launch.publicKey.toBase58());if(!settlement)continue;
      const mintInfo=infos.get(launch.account.quoteMint.toBase58()),config=infos.get(launch.account.terms.dbcConfig.toBase58());
      if(!config||!mintInfo)continue;
      if(!config.owner.equals(DYNAMIC_BONDING_CURVE_PROGRAM_ID))throw Error('Curve configuration has an unexpected owner.');
      const mint=unpackMint(launch.account.quoteMint,mintInfo),decoded=dbc.state.program.coder.accounts.decode<PoolConfig>('poolConfig',config.data);
      const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(config.data)));
      const policy:CurvePolicy={creatorTradingFeePercentage:decoded.creatorTradingFeePercentage,feeClaimer:decoded.feeClaimer.toBase58(),leftoverReceiver:decoded.leftoverReceiver.toBase58(),creatorLiquidityPercentage:decoded.creatorLiquidityPercentage,creatorLockedLpPercentage:decoded.creatorPermanentLockedLiquidityPercentage,partnerLiquidityPercentage:decoded.partnerLiquidityPercentage,partnerLockedLpPercentage:decoded.partnerPermanentLockedLiquidityPercentage,migrationQuoteThreshold:decoded.migrationQuoteThreshold.toString()};
      const receipt=buildLaunchReceipt({launch:launch.publicKey.toBase58(),program:reader.base.programId.toBase58(),account:launch.account,settlement,quoteDecimals:mint.decimals,baseDecimals:decoded.tokenDecimal,policy,configHashMatches:digest.every((byte,i)=>byte===settlement.configHash[i]),observedAt:new Date().toISOString()});
      if(receipt.status==='Refunds available')receipt.refundHistory=refundProofs.get(receipt.launch);
      result.push({...launch,settlement,decimals:mint.decimals,baseDecimals:decoded.tokenDecimal,receipt});}
    if(ticket!==generation)return;venues=result.reverse();
    el('list').innerHTML=venues.length?venues.map(v=>`<button class="launch-row" data-launch="${v.publicKey}"><span class="token-symbol">${h(v.settlement.metadata.symbol.slice(0,2))}</span><span><strong>${h(v.settlement.metadata.name)}</strong><small>${h(v.settlement.metadata.symbol)} · ${short(v.publicKey)}</small></span><span class="row-terms"><strong>${formatAmount(v.account.terms.maxRaise.toString(),v.decimals)} quote tokens</strong><small>Raise cap</small></span><span class="badge">${stage(v)}</span><span aria-hidden="true">↗</span></button>`).join(''):'<div class="empty"><h3>No launch venues yet</h3><p>Create a launch with immutable terms, then invite bidders to fund before opening.</p><button id="first-create" class="primary">Create the first launch</button></div>';
    document.querySelectorAll<HTMLButtonElement>('[data-launch]').forEach(button=>button.onclick=()=>{selected=new PublicKey(button.dataset.launch!);history.replaceState(null,'',`?launch=${selected}`);void detail().catch(error=>status(errorText(error),true));});
    const first=el<HTMLButtonElement>('first-create');if(first)first.onclick=openCreate;
    if(!selected)readLaunchLink();
    if(selected)await detail();
  }catch(error){if(ticket!==generation)return;if(quiet){status(`Could not refresh launch state. ${errorText(error)}`,true);return;}el('list').innerHTML=`<div class="error"><h3>Couldn’t load launches</h3><p>${h(errorText(error))}</p><button id="retry">Try again</button></div>`;el<HTMLButtonElement>('retry').onclick=()=>void load();}finally{loading=false;if(reloadQueued)void load(true);}
}
function stage(v:Venue){const t=v.account.terms;return launchStage(v.account.status,Math.floor(Date.now()/1000)+chainOffset,t.biddingOpensAt.toNumber(),t.biddingClosesAt.toNumber(),t.settlementDeadline.toNumber());}
async function detail(){
  const detailTicket=++detailGeneration;
  const v=venues.find(x=>x.publicKey.equals(selected!)),panel=el('detail');panel.hidden=false;
  document.querySelectorAll<HTMLButtonElement>('[data-launch]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.launch===selected?.toBase58())));
  if(!v){panel.innerHTML='<div class="empty">This address is not a configured launch venue.</div>';return;}
  const t=v.account.terms,s=stage(v),count=v.account.bidCount;let own:Awaited<ReturnType<LaunchClient['readOwnBid']>>|undefined;
  // Own private state is read only after an explicit authentication action.
  if(client){const info=await connection.getAccountInfo(launchBidAddress(v.publicKey,client.wallet.publicKey));if(info?.owner.equals(client.base.programId))own=await client.base.account.launchBid.fetch(launchBidAddress(v.publicKey,client.wallet.publicKey));}
  if(detailTicket!==detailGeneration)return;
  const previousAmount=panel.dataset.launch===v.publicKey.toBase58()?el<HTMLInputElement>('bid-amount')?.value:'';panel.dataset.launch=v.publicKey.toBase58();
  const index=wallet?v.account.bids.slice(0,count).findIndex(k=>k.equals(launchBidAddress(v.publicKey,wallet!.publicKey))):-1;
  const claimed=index>=0&&(v.settlement.claimed&(1<<index))!==0;
  const amount=(n:string)=>formatAmount(n,v.decimals);
  const active=['Funding open','Private bidding'].includes(s);
  const depositNote=wallet&&active&&index>=0?`<p class="muted">${own?`You deposited ${amount(own.funded.toString())} quote tokens.`:'Your deposit is in the private bidding window.'}</p>`:'';
  let participation='';
  if(active&&!wallet)participation='<p>Connect a wallet or use a demo wallet to join this launch.</p>';
  else if(s==='Funding open'&&wallet&&index>=0)participation=own?'<button id="finish-private" class="primary">Prepare private bid</button>':`<p>Your private bid is set up. Bidding opens ${new Date(t.biddingOpensAt.toNumber()*1000).toLocaleString()}.</p><button id="finish-private" class="quiet">Re-check my setup</button>`;
  else if(s==='Funding open'&&wallet)participation=`<button id="test-funds" class="quiet">Get test funds</button><form id="bid-form">${field('bid-amount','Deposit (quote tokens)','text','',true,'decimal')}<button class="primary" type="submit">Deposit and prepare to bid</button><p id="bid-error" role="alert"></p></form>`;
  else if(s==='Private bidding'&&wallet&&index>=0)participation=`<form id="bid-form">${field('bid-amount','Your bid (quote tokens)','text','',true,'decimal')}<button class="primary" type="submit">Save bid</button><p id="bid-error" role="alert"></p></form><button id="read-bid" class="quiet">Check my bid</button>`;
  else if(s==='Private bidding'&&wallet)participation='<p>Deposits closed before bidding began. This wallet did not join this launch.</p>';
  else if(s==='Settled'&&wallet&&index>=0)participation=`<p>Your share: ${formatAmount(v.settlement.tokens[index].toString(),v.baseDecimals)} ${h(v.settlement.metadata.symbol)} · ${amount(v.settlement.refunds[index].toString())} quote to return</p><button id="claim" class="primary" ${claimed?'disabled':''}>${claimed?'Already claimed':'Claim tokens and refund'}</button>${claimed?'':'<button id="test-funds" class="quiet">Get test funds</button>'}`;
  else if(['Refunds available','Refund deadline reached'].includes(s)&&wallet&&index>=0)participation=own?.funded.isZero()?'<p>Your refund has been claimed.</p>':'<button id="refund" class="primary">Claim your refund</button><button id="test-funds" class="quiet">Get test funds</button>';
  else if(s==='Ready to close'&&wallet)participation='<button id="close" class="primary">Close bidding</button>';
  else if(s==='Ready to settle'&&wallet)participation=v.settlement.phase===1?'<p>Waiting for the randomness result. Refresh shortly.</p>':`<button id="settle" class="primary">${v.settlement.phase===0?'Request randomness':'Complete opening purchase'}</button>`;
  panel.innerHTML=`<div class="section-title"><div><div class="eyebrow">LAUNCH TERMS</div><h2>${h(v.settlement.metadata.name)}</h2></div><span class="badge">${s}</span></div><div class="detail-grid${participation?'':' solo'}"><div><dl class="terms"><div><dt>Minimum raise</dt><dd>${amount(t.minRaise.toString())}</dd></div><div><dt>Raise cap</dt><dd>${amount(t.maxRaise.toString())}</dd></div><div><dt>Minimum output at cap</dt><dd>${formatAmount(v.settlement.minTokensAtCap.toString(),v.baseDecimals)} ${h(v.settlement.metadata.symbol)}</dd></div><div><dt>Funding closes</dt><dd>${new Date(t.biddingOpensAt.toNumber()*1000).toLocaleString()}</dd></div><div><dt>Bids close</dt><dd>${new Date(t.biddingClosesAt.toNumber()*1000).toLocaleString()}</dd></div><div><dt>Settlement deadline</dt><dd>${new Date(t.settlementDeadline.toNumber()*1000).toLocaleString()}</dd></div><div><dt>Registered wallets</dt><dd>${count} / 24</dd></div><div><dt>Creator</dt><dd><button id="copy-creator" class="quiet">${short(v.account.creator)} · Copy</button></dd></div></dl><p class="muted">Quote mint: <a target="_blank" rel="noreferrer" href="https://explorer.solana.com/address/${v.account.quoteMint}?cluster=devnet">${short(v.account.quoteMint)} ↗</a> · <a target="_blank" rel="noreferrer" href="https://explorer.solana.com/address/${t.dbcConfig}?cluster=devnet">View curve ↗</a></p>${depositNote}</div>${participation?`<div class="participate"><h3>${active?'Join this launch':'Your next step'}</h3>${participation}</div>`:''}</div>`;
  if(s==='Settled'){
    const spent=BigInt(v.settlement.quoteSpent.toString()),cap=BigInt(t.maxRaise.toString());
    const floor=(BigInt(v.settlement.minTokensAtCap.toString())*spent+cap-1n)/cap;
    panel.insertAdjacentHTML('beforeend',`<section class="outcome"><h3>What happened</h3><table><thead><tr><th scope="col">Measure</th><th scope="col">Launch terms</th><th scope="col">Result on Solana</th></tr></thead><tbody><tr><th scope="row">Opening spend</th><td>Up to ${amount(t.maxRaise.toString())} quote</td><td>${amount(v.settlement.quoteSpent.toString())} quote</td></tr><tr><th scope="row">Tokens received</th><td>At least ${formatAmount(floor,v.baseDecimals)} ${h(v.settlement.metadata.symbol)} at this spend</td><td>${formatAmount(v.settlement.baseReceived.toString(),v.baseDecimals)} ${h(v.settlement.metadata.symbol)}</td></tr><tr><th scope="row">Average price</th><td>Same for all participants</td><td>${h(averagePrice(v.settlement.quoteSpent.toString(),v.settlement.baseReceived.toString(),v.decimals,v.baseDecimals))} quote per token, including fees</td></tr></tbody></table></section>`);
  }
  if(s==='Refunds available'){
    panel.insertAdjacentHTML('beforeend',`<section class="outcome"><h3>What happened</h3><table><thead><tr><th scope="col">Measure</th><th scope="col">Launch terms</th><th scope="col">Result on Solana</th></tr></thead><tbody><tr><th scope="row">Minimum raise</th><td>${amount(t.minRaise.toString())} quote</td><td>Not met</td></tr><tr><th scope="row">Opening spend</th><td>Only if the terms are met</td><td>${amount(v.settlement.quoteSpent.toString())} quote</td></tr><tr><th scope="row">Deposits</th><td>Refundable</td><td>Withdrawals enabled</td></tr></tbody></table><p class="muted">A launch can also enter refunds after cancellation or expiry. Each participant claims their own deposit.</p></section>`);
  }
  panel.insertAdjacentHTML('beforeend',passportHtml(v.receipt,s==="Refund deadline reached"));
  bind('share-receipt','Copying link…',async()=>{const url=new URL(location.href);url.search='';url.searchParams.set('launch',v.publicKey.toBase58());url.hash='passport';await navigator.clipboard.writeText(url.toString());return {message:'Launch receipt link copied. Anyone can inspect it without connecting a wallet.'};},false);
  bind('download-receipt','Preparing JSON…',async()=>{downloadReceipt(JSON.stringify(v.receipt,null,2),`teek-receipt-${v.publicKey}.json`,'application/json');return {message:'Receipt snapshot downloaded.'};},false);
  bind('download-receipt-card','Preparing card…',async()=>{downloadReceipt(receiptCard(v.receipt),`teek-receipt-${v.publicKey}.svg`,'image/svg+xml');return {message:'Share card downloaded. It includes the observation time and devnet label.'};},false);
  bind('verify-refund-history','Checking payments…',async()=>{
    const reader=client??new LaunchClient(connection,{publicKey:PublicKey.default,signTransaction:async()=>{throw Error('Read only');},signAllTransactions:async()=>{throw Error('Read only');},signMessage:async()=>{throw Error('Read only');}} as LaunchWallet);
    const proof=await verifyRefundHistory(connection,v.publicKey,v.account.bids.slice(0,count),v.account.totalBid.lt(t.minRaise),async()=>{
      const addresses=v.account.bids.slice(0,count),bids=await reader.base.account.launchBid.fetchMultiple(addresses);
      if(bids.some(b=>!b))throw Error('A bid has not returned to Solana. Refund verification remains pending.');
      return new Map(addresses.map((address,i)=>[address.toBase58(),BigInt(bids[i]!.funded.toString())]));
    });
    if(detailTicket!==detailGeneration)return {message:'Launch view changed. Run verification on the selected launch.'};
    v.receipt.refundHistory=proof;
    refundProofs.set(v.receipt.launch,proof);
    el('refund-history-result').innerHTML=refundProofHtml(v.receipt);
    return {message:proof.coverage==='complete'?'Refund payments reconcile with the available launch history.':'Available history is partial; full refund completion is not certified.'};
  },false);
  if(wallet?.publicKey.equals(v.account.creator)&&!['Settled','Refunds available','Refund deadline reached'].includes(s)){
    panel.insertAdjacentHTML('beforeend','<div class="cancel"><button id="cancel" class="quiet">Cancel launch & enable refunds</button><p class="muted">Cancellation is permanent. Delegated bids must return before deposits can be claimed.</p></div>');
    el<HTMLButtonElement>('cancel').onclick=()=>{const button=el<HTMLButtonElement>('cancel');if(button.dataset.confirm!=='yes'){button.dataset.confirm='yes';button.textContent='Confirm permanent cancellation';return;}void action(button,'Enabling refunds…',()=>requireClient().cancel(v.publicKey));};
  }
  el<HTMLButtonElement>('copy-creator').onclick=()=>void navigator.clipboard.writeText(v.account.creator.toBase58()).then(()=>status('Creator address copied.')).catch(()=>status('Could not copy the address.',true));
  const preparePrivateBid=async(c:LaunchClient)=>{const address=launchBidAddress(v.publicKey,c.wallet.publicKey),info=await connection.getAccountInfo(address);
    if(info?.owner.equals(c.base.programId))await c.delegate(v.publicKey);
    await c.authenticate();await poll(async()=>!!(await c.private.provider.connection.getAccountInfo(address)),'private account availability');
    const bid=await c.readOwnBid(v.publicKey);if(!bid.privacyReady)await c.activate(v.publicKey);
  };
  bind('finish-private','Preparing private bid…',async()=>{await preparePrivateBid(requireClient());return {message:'Private bid ready. Bidding opens when funding closes.'};});
  const bidForm=el<HTMLFormElement>('bid-form');if(bidForm){el<HTMLInputElement>('bid-amount').value=previousAmount??'';bidForm.onsubmit=event=>{event.preventDefault();void action(bidForm.querySelector('button')!,s==='Funding open'?'Funding and enabling privacy…':'Saving private bid…',async()=>{
    const c=requireClient(),value=parseAmount(el<HTMLInputElement>('bid-amount').value,v.decimals);if(value===0n&&s==='Funding open')throw Error('Fund an amount greater than zero.');
    const source=getAssociatedTokenAddressSync(v.account.quoteMint,c.wallet.publicKey);
    if(s==='Funding open'){
      if(index<0)await c.register(v.publicKey,source,value);
      await preparePrivateBid(c);
    }else{await preparePrivateBid(c);await c.edit(v.publicKey,value);}return {message:s==="Funding open"?"Deposit saved and your private bid is set up. Choose your bid once bidding opens.":"Bid saved privately. Only you can read it until bidding closes."};
  });};}
  bind('read-bid','Checking bid…',async()=>{const c=requireClient();await c.authenticate();const bid=await c.readOwnBid(v.publicKey);return {message:`Your bid is ${amount(bid.amount.toString())} quote tokens.`};},false);
  bind('test-funds','Getting devnet test funds…',()=>getTestFunds(v.account.quoteMint));
  bind('refund','Claiming refund…',async()=>{const c=requireClient();if(s==='Refund deadline reached')await c.expire(v.publicKey);const address=launchBidAddress(v.publicKey,c.wallet.publicKey),info=await connection.getAccountInfo(address);
    if(!info?.owner.equals(c.base.programId)){await c.authenticate();await c.commitBid(v.publicKey,address);await poll(async()=>!!(await connection.getAccountInfo(address))?.owner.equals(c.base.programId),'bid return for refund');}
    const bid=await c.base.account.launchBid.fetch(address);if(bid.funded.isZero())return {message:'Your deposit has already been refunded.'};const destination=await ata(v.account.quoteMint);return c.withdraw(v.publicKey,destination,bid.funded);});
  bind('claim','Claiming tokens and refund…',async()=>{const c=requireClient();return c.claim(v.publicKey,await ata(v.account.quoteMint),await ata(t.baseMint));});
  bind('close','Returning bids and closing…',async()=>{const c=requireClient();await c.authenticate();for(const bidder of v.account.bids.slice(0,count)){const info=await connection.getAccountInfo(bidder);if(!info?.owner.equals(c.base.programId))await c.commitBid(v.publicKey,bidder);}
    await poll(async()=>{const infos=await connection.getMultipleAccountsInfo(v.account.bids.slice(0,count));return infos.every(info=>info?.owner.equals(c.base.programId));},'bids returned to Solana');return c.close(v.publicKey);});
  bind('settle','Settling launch…',async()=>{const c=requireClient();if(v.settlement.phase===0)return c.requestRandomness(v.publicKey);if(v.settlement.phase===1)throw Error('The oracle callback has not arrived. Refresh shortly.');return c.settle(v.publicKey);});
}
function bind(id:string,label:string,fn:()=>Promise<unknown>,refresh=true){const button=el<HTMLButtonElement>(id);if(button)button.onclick=()=>void action(button,label,fn,refresh);}
async function poll(check:()=>Promise<boolean>,label:string){const end=Date.now()+45_000;while(!await check()){if(Date.now()>end)throw Error(`Timed out waiting for ${label}. Refresh to resume.`);await new Promise(r=>setTimeout(r,800));}}
async function ata(mint:PublicKey){const c=requireClient(),address=getAssociatedTokenAddressSync(mint,c.wallet.publicKey);await (c.base.provider as AnchorProvider).sendAndConfirm(new Transaction().add(createAssociatedTokenAccountIdempotentInstruction(c.wallet.publicKey,address,c.wallet.publicKey,mint)));return address;}
function openCreate(){if(!wallet){status('Connect a wallet or use a demo wallet before creating a launch.',true);return;}const now=Date.now();for(const [id,offset]of [['opens',10],['closes',20],['deadline',40]] as const){if(el<HTMLInputElement>(id).value)continue;const d=new Date(now+offset*60_000);el<HTMLInputElement>(id).value=new Date(d.getTime()-d.getTimezoneOffset()*60_000).toISOString().slice(0,16);}studio.show();el<HTMLDialogElement>('create-dialog').showModal();}
const customCurveMode=()=>el<HTMLSelectElement>('curve-mode').value==='custom';
el('quote').parentElement!.insertAdjacentHTML('afterend','<button id="studio-funds" type="button" class="quiet studio-funds">Get devnet test funds</button>');
el<HTMLButtonElement>('studio-funds').onclick=()=>void action(el<HTMLButtonElement>('studio-funds'),'Getting devnet test funds…',()=>getTestFunds(new PublicKey(el<HTMLInputElement>('quote').value.trim())),false);
function creatorCurveFromForm(quoteDecimals:number):CreatorCurveInput {
  const read=(id:string)=>{const raw=el<HTMLInputElement>(id).value.trim();if(!/^\d+$/.test(raw))throw Error('Custom curve settings must be whole positive numbers.');return Number(raw);};
  return {totalSupply:read('curve-supply'),quoteDecimals,tradingFeeBps:read('curve-fee'),creatorFeePercent:read('curve-creator-fee'),creatorLiquidityPercent:read('curve-creator-lp'),migrationQuoteThreshold:read('curve-threshold')};
}
function applyCurveMode(){const custom=customCurveMode();el('custom-fields').hidden=!custom;el('existing-curve-details').hidden=custom;el<HTMLInputElement>('config').disabled=custom;}
const studio=installLaunchStudio(el<HTMLFormElement>('create-form'),async()=>{
  const value=(id:string)=>el<HTMLInputElement>(id).value.trim(),quote=new PublicKey(value('quote')),custom=customCurveMode(),mint=await getMint(connection,quote);
  let config:PoolConfig|ReturnType<typeof creatorCurve>,configLabel:string,feeClaimer:PublicKey,leftoverReceiver:PublicKey,creationInfo:string|undefined;
  if(custom){if(!wallet)throw Error('Connect a wallet before reviewing your curve.');
    config=creatorCurve(creatorCurveFromForm(mint.decimals));configLabel='A new configuration will be created for this curve';feeClaimer=wallet.publicKey;leftoverReceiver=wallet.publicKey;
    const rent=await connection.getMinimumBalanceForRentExemption(1048);
    creationInfo=`You'll sign twice: first to create the curve (about ${formatAmount(rent.toString(),9)} test SOL in account rent, plus fees), then to publish the launch. If the second step fails, you can retry with the same curve.`;
    el<HTMLFormElement>('create-form').dataset.reviewConfigHash='';
  }else{const configAddress=new PublicKey(value('config')),info=await connection.getAccountInfo(configAddress);
    if(!info||!info.owner.equals(DYNAMIC_BONDING_CURVE_PROGRAM_ID))throw Error('Supported DBC configuration not found on devnet.');
    config=dbc.state.program.coder.accounts.decode<PoolConfig>('poolConfig',info.data);assertSupportedDbcProfile(info.data);
    if(!config.quoteMint.equals(quote))throw Error('The quote mint does not match this curve configuration.');
    configLabel=configAddress.toBase58();feeClaimer=config.feeClaimer;leftoverReceiver=config.leftoverReceiver;
    el<HTMLFormElement>('create-form').dataset.reviewConfigHash=await configDigest(info.data);
  }
  const minimum=parseAmount(value('minimum'),mint.decimals),cap=parseAmount(value('maximum'),mint.decimals),minBid=parseAmount(value('minbid'),mint.decimals),minOut=parseAmount(value('minout'),config.tokenDecimal),scenario=parseAmount(value('scenario'),mint.decimals);
  if(minimum<=0n||cap<minimum||minBid<=0n||minBid>cap||minOut<=0n)throw Error('Use positive amounts, a cap at least equal to the minimum, and a minimum bid no greater than the cap.');
  if(cap>BigInt(config.migrationQuoteThreshold.toString()))throw Error('The opening cap exceeds the selected curve’s migration threshold.');
  const opens=new Date(value('opens')).getTime(),closes=new Date(value('closes')).getTime(),deadline=new Date(value('deadline')).getTime();
  if(!Number.isFinite(opens)||!Number.isFinite(closes)||!Number.isFinite(deadline)||opens<=(Date.now()+chainOffset*1000)||closes<=opens||deadline<=closes)throw Error('Choose a future funding deadline, then a later bidding close and settlement deadline.');
  if(new TextEncoder().encode(value('name')).length>32||new TextEncoder().encode(value('symbol')).length>10||new TextEncoder().encode(value('uri')).length>200)throw Error('Use at most 32 bytes for the name, 10 for the symbol and 200 for the metadata URL.');
  const rehearsals=[minimum-1n,minimum,scenario,cap].filter((n,i,a)=>a.indexOf(n)===i).map(demand=>rehearseLaunch({dbc,config,demand,minimum,cap,minimumTokensAtCap:minOut}));
  return studioReviewHtml({name:value('name'),symbol:value('symbol'),supply:custom?Number(value('curve-supply')).toLocaleString('en-US'):undefined,minimum:formatAmount(minimum,mint.decimals),cap:formatAmount(cap,mint.decimals),minBid:formatAmount(minBid,mint.decimals),minOutput:formatAmount(minOut,config.tokenDecimal),opens:new Date(opens).toLocaleString(),closes:new Date(closes).toLocaleString(),deadline:new Date(deadline).toLocaleString(),creatorFee:config.creatorTradingFeePercentage,baseFeeBps:feeNumeratorToBps(config.poolFees.baseFee.cliffFeeNumerator),creatorLp:config.creatorLiquidityPercentage+config.creatorPermanentLockedLiquidityPercentage,creatorLockedLp:config.creatorPermanentLockedLiquidityPercentage,partnerLp:config.partnerLiquidityPercentage+config.partnerPermanentLockedLiquidityPercentage,partnerLockedLp:config.partnerPermanentLockedLiquidityPercentage,feeClaimer:feeClaimer.toBase58(),leftoverReceiver:leftoverReceiver.toBase58(),quote:quote.toBase58(),config:configLabel,threshold:formatAmount(config.migrationQuoteThreshold.toString(),mint.decimals),rehearsals,quoteDecimals:mint.decimals,baseDecimals:config.tokenDecimal,creationInfo});
});
el<HTMLSelectElement>('curve-mode').addEventListener('change',applyCurveMode);applyCurveMode();
el<HTMLButtonElement>('create').onclick=openCreate;el<HTMLButtonElement>('dismiss').onclick=()=>el<HTMLDialogElement>('create-dialog').close();
el<HTMLFormElement>('create-form').onsubmit=event=>{event.preventDefault();const form=el<HTMLFormElement>('create-form');
  const editable=Array.from(form.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input,select'));
  editable.forEach(input=>input.disabled=true);
  void action(form.querySelector<HTMLButtonElement>('button[type=submit]')!,'Publishing launch terms…',async()=>{
  const c=requireClient();return withPublicationLock(c.wallet.publicKey,navigator.locks,async()=>{
  const value=(id:string)=>el<HTMLInputElement>(id).value.trim(),quote=new PublicKey(value('quote')),custom=customCurveMode();
  const reviewedFingerprint=el<HTMLFormElement>('create-form').dataset.reviewFingerprint;
  if(reviewedFingerprint!==draftFingerprint(el<HTMLFormElement>('create-form')))throw Error('Review the updated draft before publishing.');
  const mint=await getMint(connection,quote);
  if(reviewedFingerprint!==draftFingerprint(form))throw Error('The draft changed during preparation. Review it again.');
  let config:PublicKey;
  if(custom){const profile=creatorCurveFromForm(mint.decimals);creatorCurve(profile);
    const closesAt=Math.floor(new Date(value('closes')).getTime()/1000),opensAt=Math.floor(new Date(value('opens')).getTime()/1000);
    if(opensAt<=Math.floor(Date.now()/1000)+chainOffset||closesAt<=opensAt)throw Error('The funding window has expired. Set fresh dates and review again before spending curve rent.');
    if(parseAmount(value('maximum'),mint.decimals)>BigInt(profile.migrationQuoteThreshold)*10n**BigInt(mint.decimals))throw Error('The opening cap exceeds the new curve’s migration threshold.');
    config=await createOrReuseCreatorConfig({connection,dbc,wallet:c.wallet,quote,profile,storage:localStorage});
  }else config=new PublicKey(value('config'));
  const configInfo=await connection.getAccountInfo(config);if(!configInfo||!configInfo.owner.equals(DYNAMIC_BONDING_CURVE_PROGRAM_ID))throw Error('DBC configuration not found on devnet.');
  assertSupportedDbcProfile(configInfo.data);
  const hash=await configDigest(configInfo.data);
  if(!custom&&hash!==el<HTMLFormElement>('create-form').dataset.reviewConfigHash)throw Error('The curve configuration changed. Review the launch again.');
  if(reviewedFingerprint!==draftFingerprint(el<HTMLFormElement>('create-form')))throw Error('The draft changed during preparation. Review it again before publishing.');
  const terms={dbcConfig:config,biddingOpensAt:Math.floor(new Date(value('opens')).getTime()/1000),biddingClosesAt:Math.floor(new Date(value('closes')).getTime()/1000),settlementDeadline:Math.floor(new Date(value('deadline')).getTime()/1000),minRaise:parseAmount(value('minimum'),mint.decimals),maxRaise:parseAmount(value('maximum'),mint.decimals),minBid:parseAmount(value('minbid'),mint.decimals),manifestHash:new Uint8Array(32)};
  const metadata={name:value('name'),symbol:value('symbol'),uri:value('uri')};
  const curve=dbc.state.program.coder.accounts.decode<PoolConfig>('poolConfig',configInfo.data);
  const minimumTokensAtCap=parseAmount(value('minout'),curve.tokenDecimal);
  const manifest=JSON.stringify({version:1,quote:quote.toBase58(),config:config.toBase58(),configHash:hash,minimumTokensAtCap:minimumTokensAtCap.toString(),terms:{...terms,minRaise:terms.minRaise.toString(),maxRaise:terms.maxRaise.toString(),minBid:terms.minBid.toString()},metadata});terms.manifestHash=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(manifest)));
  if(reviewedFingerprint!==draftFingerprint(el<HTMLFormElement>('create-form')))throw Error('The draft changed during preparation. Review it again before publishing.');
  try{selected=await publishLaunchOnce({client:c,storage:localStorage,fingerprint:reviewedFingerprint!,quote,terms,minimumTokensAtCap,metadata});}
  catch(error){if(custom)throw Error(`Curve ${config.toBase58()} is saved on devnet. Launch publication failed: ${errorText(error)} Retry this draft to reuse the same curve and launch address.`);throw error;}
  history.replaceState(null,'',`?launch=${selected}`);studio.resetAfterPublish();el<HTMLDialogElement>('create-dialog').close();return {message:"Your launch is live on devnet. Share this page so people can join."};
  });
}).finally(()=>{editable.forEach(input=>input.disabled=false);applyCurveMode();});};
// Reconnect a demo wallet this browser already made, so a reload does not look like being signed out.
// useWallet() loads the page itself, so only load here when no wallet was restored.
let restored=false;
try{if(localStorage.getItem(storage)){el<HTMLButtonElement>('demo').click();restored=true;}}catch{/* storage blocked: stay signed out */}
if(!restored)void load();
// The 30 second refresh pauses in hidden tabs, so catch up as soon as someone comes back.
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!loading&&!document.querySelector('dialog[open]')&&!document.querySelector('[aria-busy="true"]'))void load(true);});
setInterval(()=>{if(!document.hidden&&!loading&&!document.querySelector('dialog[open]')&&!document.querySelector('[aria-busy="true"]'))void load(true);},30_000);

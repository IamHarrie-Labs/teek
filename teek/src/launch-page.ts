import './polyfills';
import './launch-style.css';
import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction, SYSVAR_CLOCK_PUBKEY } from '@solana/web3.js';
import { getMint, getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction } from '@solana/spl-token';
import { AnchorProvider } from '@coral-xyz/anchor';
import nacl from 'tweetnacl';
import { LaunchClient, type LaunchWallet, launchBidAddress } from '../../clients/launch';
import { parseAmount, formatAmount, averagePrice, escapeHtml as h, launchStage } from './launch-ui';
import { retryingFetch } from '../../clients/rpc';

const connection = new Connection('https://api.devnet.solana.com', {commitment:'confirmed', disableRetryOnRateLimit:true, fetch:retryingFetch});
const app = document.querySelector<HTMLDivElement>('#app')!;
const storage = 'teek-launch-devnet-demo-wallet';
let wallet: LaunchWallet | undefined, client: LaunchClient | undefined, selected: PublicKey | undefined;
let generation = 0;
let chainOffset = 0;
let loading = false;
let detailGeneration = 0;
type Venue = {publicKey:PublicKey; account:Awaited<ReturnType<LaunchClient['base']['account']['launch']['fetch']>>;
  settlement:Awaited<ReturnType<LaunchClient['base']['account']['settlementState']['fetch']>>; decimals:number; baseDecimals:number};
let venues:Venue[] = [];
app.innerHTML = `<header><a href="/" class="wordmark">teek<span> / launch</span></a><nav><span class="network">Solana devnet</span><button id="wallet">Connect wallet</button><button id="demo" class="quiet">Use demo wallet</button></nav></header>
<main><section class="intro"><div class="eyebrow">PRIVATE BIDS · PUBLIC TRADING</div><h1>One opening.<br>Shared on your terms.</h1><div class="intro-aside"><p>Bid privately. Share one opening purchase.<br>Trade publicly on Meteora.</p><p class="muted">If the launch misses its terms, claim your refund.</p><button id="create" class="primary">Create a launch <span aria-hidden="true">↗</span></button></div></section>
<div class="notice">Devnet prototype · test tokens only. Funding is public. Bid amounts and edit history become public after close.</div>
<section class="launches"><div class="section-title"><h2>Launches</h2><button id="refresh" class="quiet">Refresh</button></div><div id="list" aria-live="polite"><div class="skeleton">Loading launch terms…</div></div></section>
<section id="detail" hidden aria-label="Launch details"></section>
<section class="explain"><article><span>01</span><h3>Accept the terms</h3><p>The raise cap, minimum output, curve configuration and creator are fixed before funding.</p></article><article><span>02</span><h3>Bid in private</h3><p>Fund before bidding opens. Edit your bid until close. Other bidders cannot read your bid during the window.</p></article><article><span>03</span><h3>Settle or refund</h3><p>The pool and opening purchase happen together. Winners share the actual output; unused funding is refunded.</p></article></section>
<footer><span>Built with MagicBlock & Meteora</span><a href="/market.html">Explore the original market simulator ↗</a></footer></main>
<div id="status" role="status" aria-live="polite" hidden></div>
<dialog id="create-dialog"><form id="create-form"><div class="section-title"><h2>Create a launch</h2><button type="button" id="dismiss" aria-label="Close create launch">×</button></div><p class="muted">Terms are immutable after creation. Use a supported SPL / DAMM v2 curve with flat fees and immutable token metadata.</p>
<div class="form-grid">${field('name','Token name','text','Teek Opening',true)}${field('symbol','Symbol','text','DEMO',true)}${field('quote','Quote mint address','text','',true)}${field('config','DBC configuration address','text','',true)}${field('minimum','Minimum raise (quote tokens)','text','0.1',true,'decimal')}${field('maximum','Raise cap (quote tokens)','text','0.6',true,'decimal')}${field('minbid','Minimum bid (quote tokens)','text','0.001',true,'decimal')}${field('minout','Minimum tokens received at cap','text','1',true,'decimal')}${field('opens','Funding closes / bids open','datetime-local','',true)}${field('closes','Bids close','datetime-local','',true)}${field('deadline','Settlement deadline','datetime-local','',true)}${field('uri','Metadata URL (optional)','url','',false)}</div>
<p class="muted">At smaller raises the output floor scales proportionally. All winners share the same average opening price, including curve fees. Maximum 24 registered wallets.</p><p id="create-error" role="alert"></p><button class="primary" type="submit">Publish immutable terms</button></form></dialog>`;
function field(id:string,label:string,type:string,value:string,required:boolean,mode?:string) {return `<label for="${id}">${label}${required?' *':''}<input id="${id}" name="${id}" type="${type}" value="${value}" ${required?'required':''} ${mode?`inputmode="${mode}"`:''} autocomplete="off" spellcheck="false"></label>`;}
const el = <T extends HTMLElement=HTMLElement>(id:string) => document.getElementById(id) as T;
function status(message:string,error=false){const box=el('status');box.hidden=false;box.className=error?'error':'';box.textContent=message;}
function short(key:PublicKey){const s=key.toBase58();return `${s.slice(0,4)}…${s.slice(-4)}`;}
function requireClient(){if(!client)throw Error('Connect a wallet or use a disposable devnet demo wallet first.');return client;}
function errorText(error:unknown){const e=error as {error?:{errorMessage?:string};message?:string};return (e.error?.errorMessage??e.message??'Request failed. Try again.').replace(/https?:\/\/\S*token=\S*/g,'[private session]');}
async function action(button:HTMLButtonElement,label:string,fn:()=>Promise<unknown>,refresh=true){if(button.disabled)return;const old=button.textContent;button.disabled=true;button.setAttribute('aria-busy','true');button.textContent=label;status(label);try{const result=await fn();status(result&&typeof result==='object'&&'message'in result?String(result.message):'Confirmed. Your launch state is up to date.');if(typeof result==='string'&& /^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(result)){const link=document.createElement('a');link.href=`https://explorer.solana.com/tx/${result}?cluster=devnet`;link.textContent=' View transaction ↗';link.target='_blank';link.rel='noreferrer';el('status').append(link);}if(refresh)await load();}catch(error){status(errorText(error),true);const inline=button.closest('form')?.querySelector('[role=alert]');if(inline)inline.textContent=errorText(error);}finally{button.disabled=false;button.removeAttribute('aria-busy');button.textContent=button.id==='wallet'&&wallet?short(wallet.publicKey):old;}}
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
async function load(quiet=false){
  if(loading)return;loading=true;
  const ticket=++generation;if(!quiet)el('list').innerHTML='<div class="skeleton">Loading launch terms…</div>';
  try{
    const reader=client??new LaunchClient(connection,{publicKey:PublicKey.default,signTransaction:async()=>{throw Error('Connect wallet');},signAllTransactions:async()=>{throw Error('Connect wallet');},signMessage:async()=>{throw Error('Connect wallet');}} as LaunchWallet);
    const [launches,states,clock]=await Promise.all([reader.base.account.launch.all(),reader.base.account.settlementState.all(),connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY)]);
    if(clock)chainOffset=Number(clock.data.readBigInt64LE(32))-Math.floor(Date.now()/1000);
    const map=new Map(states.map(x=>[x.account.launch.toBase58(),x.account]));const result:Venue[]=[];
    for(const launch of launches){const settlement=map.get(launch.publicKey.toBase58());if(!settlement)continue;
      const [mint,config]=await Promise.all([getMint(connection,launch.account.quoteMint),connection.getAccountInfo(launch.account.terms.dbcConfig)]);
      if(!config)continue;result.push({...launch,settlement,decimals:mint.decimals,baseDecimals:config.data[8+227]});}
    if(ticket!==generation)return;venues=result.reverse();
    el('list').innerHTML=venues.length?venues.map(v=>`<button class="launch-row" data-launch="${v.publicKey}"><span class="token-symbol">${h(v.settlement.metadata.symbol.slice(0,2))}</span><span><strong>${h(v.settlement.metadata.name)}</strong><small>${h(v.settlement.metadata.symbol)} · ${short(v.publicKey)}</small></span><span class="row-terms"><strong>${formatAmount(v.account.terms.maxRaise.toString(),v.decimals)} quote tokens</strong><small>Raise cap</small></span><span class="badge">${stage(v)}</span><span aria-hidden="true">↗</span></button>`).join(''):'<div class="empty"><h3>No launch venues yet</h3><p>Create a launch with immutable terms, then invite bidders to fund before opening.</p><button id="first-create" class="primary">Create the first launch</button></div>';
    document.querySelectorAll<HTMLButtonElement>('[data-launch]').forEach(button=>button.onclick=()=>{selected=new PublicKey(button.dataset.launch!);history.replaceState(null,'',`?launch=${selected}`);void detail();});
    const first=el<HTMLButtonElement>('first-create');if(first)first.onclick=openCreate;
    if(!selected){const query=new URLSearchParams(location.search).get('launch');if(query)selected=new PublicKey(query);}
    if(selected)await detail();
  }catch(error){if(ticket!==generation)return;if(quiet){status(`Could not refresh launch state. ${errorText(error)}`,true);return;}el('list').innerHTML=`<div class="error"><h3>Couldn’t load launches</h3><p>${h(errorText(error))}</p><button id="retry">Try again</button></div>`;el<HTMLButtonElement>('retry').onclick=()=>void load();}finally{loading=false;}
}
function stage(v:Venue){const t=v.account.terms;return launchStage(v.account.status,Math.floor(Date.now()/1000)+chainOffset,t.biddingOpensAt.toNumber(),t.biddingClosesAt.toNumber(),t.settlementDeadline.toNumber());}
async function detail(){
  const detailTicket=++detailGeneration;
  const v=venues.find(x=>x.publicKey.equals(selected!)),panel=el('detail');panel.hidden=false;
  if(!v){panel.innerHTML='<div class="empty">This address is not a configured launch venue.</div>';return;}
  const t=v.account.terms,s=stage(v),count=v.account.bidCount;let own:Awaited<ReturnType<LaunchClient['readOwnBid']>>|undefined;
  // Own private state is read only after an explicit authentication action.
  if(client){const info=await connection.getAccountInfo(launchBidAddress(v.publicKey,client.wallet.publicKey));if(info?.owner.equals(client.base.programId))own=await client.base.account.launchBid.fetch(launchBidAddress(v.publicKey,client.wallet.publicKey));}
  if(detailTicket!==detailGeneration)return;
  const previousAmount=panel.dataset.launch===v.publicKey.toBase58()?el<HTMLInputElement>('bid-amount')?.value:'';panel.dataset.launch=v.publicKey.toBase58();
  const index=wallet?v.account.bids.slice(0,count).findIndex(k=>k.equals(launchBidAddress(v.publicKey,wallet!.publicKey))):-1;
  const claimed=index>=0&&(v.settlement.claimed&(1<<index))!==0;
  const amount=(n:string)=>formatAmount(n,v.decimals);
  panel.innerHTML=`<div class="section-title"><div><div class="eyebrow">LAUNCH TERMS</div><h2>${h(v.settlement.metadata.name)}</h2></div><span class="badge">${s}</span></div><div class="detail-grid"><div><dl class="terms"><div><dt>Minimum raise</dt><dd>${amount(t.minRaise.toString())}</dd></div><div><dt>Raise cap</dt><dd>${amount(t.maxRaise.toString())}</dd></div><div><dt>Minimum output at cap</dt><dd>${formatAmount(v.settlement.minTokensAtCap.toString(),v.baseDecimals)} ${h(v.settlement.metadata.symbol)}</dd></div><div><dt>Funding closes</dt><dd>${new Date(t.biddingOpensAt.toNumber()*1000).toLocaleString()}</dd></div><div><dt>Bids close</dt><dd>${new Date(t.biddingClosesAt.toNumber()*1000).toLocaleString()}</dd></div><div><dt>Settlement deadline</dt><dd>${new Date(t.settlementDeadline.toNumber()*1000).toLocaleString()}</dd></div><div><dt>Registered wallets</dt><dd>${count} / 24</dd></div><div><dt>Creator</dt><dd><button id="copy-creator" class="quiet">${short(v.account.creator)} · Copy</button></dd></div></dl><p class="muted">Quote mint: <a target="_blank" rel="noreferrer" href="https://explorer.solana.com/address/${v.account.quoteMint}?cluster=devnet">${short(v.account.quoteMint)} ↗</a> · <a target="_blank" rel="noreferrer" href="https://explorer.solana.com/address/${t.dbcConfig}?cluster=devnet">View fixed curve ↗</a></p><p class="muted">Your public funding: ${own?amount(own.funded.toString()):index>=0?'Delegated for private bidding':'No funding yet'}. Bid amounts remain hidden until close; public funding does not equal a bid.</p></div><div class="participate"><h3>Your participation</h3>${!wallet?'<p>Connect a wallet or use the demo wallet to participate.</p>':`<button id="test-funds" class="quiet">Get test funds</button><form id="bid-form">${field('bid-amount',s==='Funding open'?'Fund quote tokens':'Your private bid (quote tokens)','text','',true,'decimal')}<button class="primary" type="submit" ${['Funding open','Private bidding'].includes(s)?'':'disabled'}>${s==='Funding open'?'Fund and enable private bidding':'Save private bid'}</button><p id="bid-error" role="alert"></p></form><button id="read-bid" class="quiet" ${s==='Private bidding'?'':'disabled'}>Read my private bid</button><p id="own-bid" aria-live="polite"></p>`}
${s==='Settled'?`<p>Opening purchase: ${amount(v.settlement.quoteSpent.toString())} quote tokens for ${formatAmount(v.settlement.baseReceived.toString(),v.baseDecimals)} ${h(v.settlement.metadata.symbol)}. Tokens are shared pro rata; indivisible units use VRF rounding.</p>${index>=0?`<p>Your allocation: ${formatAmount(v.settlement.tokens[index].toString(),v.baseDecimals)} tokens · refund ${amount(v.settlement.refunds[index].toString())}</p><button id="claim" class="primary" ${claimed?'disabled':''}>${claimed?'Allocation claimed':'Claim tokens & refund'}</button>`:''}`:''}
${['Refunds available','Refund deadline reached'].includes(s)&&index>=0?'<button id="refund" class="primary">Claim full refund</button>':''}
${s==='Ready to close'?'<button id="close" class="primary">Return bids & close auction</button>':''}
${s==='Ready to settle'?`<button id="settle" class="primary">${v.settlement.phase===0?'Request allocation randomness':v.settlement.phase===1?'Waiting for randomness':'Settle opening purchase'}</button>`:''}</div></div>`;
  if(s==='Settled'){
    const spent=BigInt(v.settlement.quoteSpent.toString()),cap=BigInt(t.maxRaise.toString());
    const floor=(BigInt(v.settlement.minTokensAtCap.toString())*spent+cap-1n)/cap;
    panel.insertAdjacentHTML('beforeend',`<section class="outcome"><h3>Terms → outcome</h3><table><thead><tr><th scope="col">Condition</th><th scope="col">Accepted terms</th><th scope="col">Observed on Solana</th></tr></thead><tbody><tr><th scope="row">Quote purchase</th><td>Cap ${amount(t.maxRaise.toString())}</td><td>${amount(v.settlement.quoteSpent.toString())} spent</td></tr><tr><th scope="row">Tokens received</th><td>At least ${formatAmount(floor,v.baseDecimals)} at this raise</td><td>${formatAmount(v.settlement.baseReceived.toString(),v.baseDecimals)}</td></tr><tr><th scope="row">Purchase price</th><td>Shared average; native fees included</td><td>${h(averagePrice(v.settlement.quoteSpent.toString(),v.settlement.baseReceived.toString(),v.decimals,v.baseDecimals))} quote per token</td></tr></tbody></table></section>`);
  }
  if(s==='Refunds available'){
    panel.insertAdjacentHTML('beforeend',`<section class="outcome"><h3>Terms → outcome</h3><table><thead><tr><th scope="col">Condition</th><th scope="col">Accepted terms</th><th scope="col">Observed on Solana</th></tr></thead><tbody><tr><th scope="row">Minimum raise</th><td>${amount(t.minRaise.toString())}</td><td>Launch entered refunds</td></tr><tr><th scope="row">Opening purchase</th><td>Only when launch terms pass</td><td>${amount(v.settlement.quoteSpent.toString())} spent</td></tr><tr><th scope="row">Deposits</th><td>Full refunds on failure or cancellation</td><td>Refund withdrawals enabled</td></tr></tbody></table><p class="muted">Refund status can also follow cancellation or expiry. Each funded wallet claims its own deposit after its bid returns to Solana.</p></section>`);
  }
  if(wallet?.publicKey.equals(v.account.creator)&&!['Settled','Refunds available'].includes(s)){
    panel.insertAdjacentHTML('beforeend','<div class="cancel"><button id="cancel" class="quiet">Cancel launch & enable refunds</button><p class="muted">Cancellation is permanent. Delegated bids must return before deposits can be claimed.</p></div>');
    el<HTMLButtonElement>('cancel').onclick=()=>{const button=el<HTMLButtonElement>('cancel');if(button.dataset.confirm!=='yes'){button.dataset.confirm='yes';button.textContent='Confirm permanent cancellation';return;}void action(button,'Enabling refunds…',()=>requireClient().cancel(v.publicKey));};
  }
  el<HTMLButtonElement>('copy-creator').onclick=()=>void navigator.clipboard.writeText(v.account.creator.toBase58());
  const bidForm=el<HTMLFormElement>('bid-form');if(bidForm){el<HTMLInputElement>('bid-amount').value=previousAmount??'';bidForm.onsubmit=event=>{event.preventDefault();void action(bidForm.querySelector('button')!,s==='Funding open'?'Funding and enabling privacy…':'Saving private bid…',async()=>{
    const c=requireClient(),value=parseAmount(el<HTMLInputElement>('bid-amount').value,v.decimals);if(value===0n&&s==='Funding open')throw Error('Fund an amount greater than zero.');
    const source=getAssociatedTokenAddressSync(v.account.quoteMint,c.wallet.publicKey);
    if(s==='Funding open'){
      if(index<0)await c.register(v.publicKey,source,value);
      const address=launchBidAddress(v.publicKey,c.wallet.publicKey),info=await connection.getAccountInfo(address);
      if(info?.owner.equals(c.base.programId))await c.delegate(v.publicKey);
      await c.authenticate();await poll(async()=>!!(await c.private.provider.connection.getAccountInfo(address)),'private account availability');
      const bid=await c.readOwnBid(v.publicKey);if(!bid.privacyReady)await c.activate(v.publicKey);
    }else{await c.authenticate();await c.edit(v.publicKey,value);}return undefined;
  });};}
  bind('read-bid','Authenticating…',async()=>{const c=requireClient();await c.authenticate();const bid=await c.readOwnBid(v.publicKey);return {message:`Your private bid: ${amount(bid.amount.toString())} quote tokens.`};},false);
  bind('test-funds','Getting devnet test funds…',async()=>{const c=requireClient();const response=await fetch('http://127.0.0.1:8790/fund',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({wallet:c.wallet.publicKey.toBase58(),quoteMint:v.account.quoteMint.toBase58()})});const result=await response.json();if(!response.ok)throw Error(result.error??'Test funding unavailable. Start the local demo funding server.');return result.signature;});
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
function openCreate(){if(!wallet){status('Connect a wallet or use a demo wallet before creating a launch.',true);return;}const now=Date.now();for(const [id,offset]of [['opens',10],['closes',20],['deadline',40]] as const){const d=new Date(now+offset*60_000);el<HTMLInputElement>(id).value=new Date(d.getTime()-d.getTimezoneOffset()*60_000).toISOString().slice(0,16);}el<HTMLDialogElement>('create-dialog').showModal();}
el<HTMLButtonElement>('create').onclick=openCreate;el<HTMLButtonElement>('dismiss').onclick=()=>el<HTMLDialogElement>('create-dialog').close();
el<HTMLFormElement>('create-form').onsubmit=event=>{event.preventDefault();const form=el<HTMLFormElement>('create-form');void action(form.querySelector<HTMLButtonElement>('button[type=submit]')!,'Publishing launch terms…',async()=>{
  const c=requireClient(),value=(id:string)=>el<HTMLInputElement>(id).value.trim(),quote=new PublicKey(value('quote')),config=new PublicKey(value('config'));
  const [mint,configInfo]=await Promise.all([getMint(connection,quote),connection.getAccountInfo(config)]);if(!configInfo)throw Error('DBC configuration not found on devnet.');
  const terms={dbcConfig:config,biddingOpensAt:Math.floor(new Date(value('opens')).getTime()/1000),biddingClosesAt:Math.floor(new Date(value('closes')).getTime()/1000),settlementDeadline:Math.floor(new Date(value('deadline')).getTime()/1000),minRaise:parseAmount(value('minimum'),mint.decimals),maxRaise:parseAmount(value('maximum'),mint.decimals),minBid:parseAmount(value('minbid'),mint.decimals),manifestHash:new Uint8Array(32)};
  const metadata={name:value('name'),symbol:value('symbol'),uri:value('uri')};
  const manifest=JSON.stringify({quote:quote.toBase58(),config:config.toBase58(),terms:{...terms,minRaise:terms.minRaise.toString(),maxRaise:terms.maxRaise.toString(),minBid:terms.minBid.toString()},metadata});terms.manifestHash=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(manifest)));
  selected=await c.initializeVenue(BigInt(Date.now()),quote,terms,parseAmount(value('minout'),configInfo.data[8+227]),metadata);history.replaceState(null,'',`?launch=${selected}`);el<HTMLDialogElement>('create-dialog').close();return undefined;
});};
void load();
setInterval(()=>{if(!loading&&!document.querySelector('dialog[open]')&&!document.querySelector('[aria-busy="true"]'))void load(true);},15_000);

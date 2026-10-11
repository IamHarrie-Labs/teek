import { escapeHtml as h, formatAmount } from './launch-ui';
import type { Rehearsal } from '../../clients/launch-rehearsal';

export const STUDIO_DRAFT_KEY = 'teek-launch-studio-draft-v1';
export function draftFields(form: HTMLFormElement): Record<string,string> {
  return Object.fromEntries(Array.from(form.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input[name],select[name]')).map(input=>[input.name,input.value]));
}
export function draftFingerprint(form: HTMLFormElement) { return JSON.stringify(draftFields(form)); }
export function restoreDraftFields(raw: string): Record<string,string> {
  const parsed=JSON.parse(raw);
  if(parsed.version!==1||typeof parsed.fields!=='object'||!parsed.fields||Array.isArray(parsed.fields))throw Error('Unrecognised draft');
  return Object.fromEntries(Object.entries(parsed.fields).filter((entry):entry is [string,string]=>typeof entry[1]==='string'&&entry[1].length<=2048));
}

export function installLaunchStudio(form: HTMLFormElement, review: ()=>Promise<string>) {
  let step=0,reviewing=false;
  const sections=Array.from(form.querySelectorAll<HTMLElement>('[data-studio-step]'));
  const back=form.querySelector<HTMLButtonElement>('#studio-back')!,next=form.querySelector<HTMLButtonElement>('#studio-next')!,publish=form.querySelector<HTMLButtonElement>('button[type=submit]')!;
  const error=form.querySelector<HTMLElement>('#create-error')!,note=form.querySelector<HTMLElement>('#studio-draft-note')!;
  function save(){try{localStorage.setItem(STUDIO_DRAFT_KEY,JSON.stringify({version:1,fields:draftFields(form)}));note.textContent='Saved in this browser.';}catch{note.textContent='Draft saving is unavailable. Keep this tab open.';}}
  function render(){sections.forEach((s,i)=>s.hidden=i!==step);back.hidden=step===0;next.hidden=step===2;publish.hidden=step!==2;next.textContent=step===0?'Continue to launch terms':'Review launch';publish.textContent=form.querySelector<HTMLSelectElement>('#curve-mode')?.value==='custom'?'Create curve and launch':'Publish launch';form.querySelectorAll<HTMLElement>('[data-step-label]').forEach((label,i)=>{label.setAttribute('aria-current',i===step?'step':'false');});}
  try{const raw=localStorage.getItem(STUDIO_DRAFT_KEY);if(raw){for(const [name,value]of Object.entries(restoreDraftFields(raw))){const input=Array.from(form.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input[name],select[name]')).find(i=>i.name===name);if(input)input.value=value;}note.textContent='Saved draft restored. Check the funding and bidding dates before publishing.';}}catch{note.textContent='Could not restore this browser’s draft. Start a new draft below.';}
  form.addEventListener('input',()=>{delete form.dataset.reviewFingerprint;save();});
  form.addEventListener('change',()=>{delete form.dataset.reviewFingerprint;save();render();});
  back.onclick=()=>{if(reviewing)return;step--;error.textContent='';render();};
  next.onclick=async()=>{
    if(reviewing)return;
    const invalid=Array.from(sections[step].querySelectorAll<HTMLInputElement>('input')).find(input=>!input.checkValidity());
    if(invalid){invalid.closest('details')?.setAttribute('open','');invalid.reportValidity();return;}
    error.textContent='';
    if(step===0){step=1;save();render();return;}
    reviewing=true;next.disabled=true;next.setAttribute('aria-busy','true');next.textContent='Checking terms…';
    try{const fingerprint=draftFingerprint(form),html=await review();if(fingerprint!==draftFingerprint(form))throw Error('Your draft changed. Review the updated terms again.');form.querySelector<HTMLElement>('#studio-review')!.innerHTML=html;form.dataset.reviewFingerprint=fingerprint;step=2;save();render();}
    catch(e){error.textContent=e instanceof Error?e.message:'Could not preview launch terms.';}
    finally{reviewing=false;next.disabled=false;next.removeAttribute('aria-busy');if(step!==2)next.textContent='Review launch';}
  };
  form.addEventListener('submit',event=>{if(step!==2||form.dataset.reviewFingerprint!==draftFingerprint(form)){event.preventDefault();event.stopImmediatePropagation();error.textContent='Review the current draft before publishing.';}},true);
  render();
  return {resetAfterPublish(){try{localStorage.removeItem(STUDIO_DRAFT_KEY);}catch{/* Publishing must not depend on browser storage. */}step=0;delete form.dataset.reviewFingerprint;note.textContent='Launch published.';render();},show(){render();}};
}

export function studioReviewHtml(input:{name:string;symbol:string;supply?:string;minimum:string;cap:string;minBid:string;minOutput:string;opens:string;closes:string;deadline:string;creatorFee:number;baseFeeBps?:number;creatorLp:number;creatorLockedLp?:number;partnerLp:number;partnerLockedLp?:number;feeClaimer?:string;leftoverReceiver?:string;quote:string;config:string;threshold:string;rehearsals?:Rehearsal[];quoteDecimals?:number;baseDecimals?:number;creationInfo?:string}){
  const rows=[...(input.supply?[['Total token supply',input.supply]]:[]),['Minimum raise',input.minimum],['Raise cap',input.cap],['Minimum bid',input.minBid],['Minimum tokens at cap',`${input.minOutput} ${input.symbol}`],['Deposits close / bidding begins',input.opens],['Bidding ends',input.closes],['Settlement deadline',input.deadline],['Flat curve fee',input.baseFeeBps===undefined?'Unavailable':`${input.baseFeeBps} basis points`],['Creator share of native fee portion',`${input.creatorFee}%`],['Creator / partner LP after migration',`${input.creatorLp}% / ${input.partnerLp}%`],['Creator / partner permanently locked LP',`${input.creatorLockedLp??0}% / ${input.partnerLockedLp??0}%`],['Migration threshold',input.threshold]];
  const rehearsal=input.rehearsals?.length&&input.quoteDecimals!==undefined&&input.baseDecimals!==undefined?`<section class="studio-rehearsal"><h4>Example outcomes</h4><p class="muted">These examples use your curve settings, not live bids.</p>${input.rehearsals.map(r=>{const quote=(n:string)=>formatAmount(n,input.quoteDecimals!),base=(n:string)=>formatAmount(n,input.baseDecimals!);return `<article><strong>${quote(r.demand)} quote in example bids</strong><span class="badge">${r.case==='opening'?'Opens':r.case==='below-minimum'?'Refunds':'Token minimum missed'}</span><p>${r.case==='below-minimum'?'No purchase.':`${quote(r.accepted)} quote accepted · ${base(r.quotedOutput!)} ${h(input.symbol)} estimated · ${base(r.requiredOutput)} ${h(input.symbol)} required.`}</p>${r.case==='opening'?`<p class="muted">${BigInt(r.unacceptedDemand)>0n?`${quote(r.unacceptedDemand)} quote is over the cap. `:''}Estimated fees: ${quote(r.tradingFee!)} quote to creator/partner and ${quote(r.protocolFee!)} quote to the protocol.</p>`:''}${r.case==='output-floor-failure'?'<p class="muted">Settlement would fail at this output. The creator could cancel or wait for the deadline.</p>':''}</article>`;}).join('')}<p class="muted">These are estimates. Your transaction and personal allocation are only known after settlement.</p></section>`:'';
  return `<h3>${h(input.name)} <span class="muted">${h(input.symbol)}</span></h3><dl class="terms">${rows.map(([label,value])=>`<div><dt>${h(label)}</dt><dd>${h(value)}</dd></div>`).join('')}</dl>${input.creationInfo?`<div class="notice">${h(input.creationInfo)}</div>`:''}${rehearsal}<p>Publishing fixes these terms and creates the escrow on devnet. The token and Meteora pool are created later, only if settlement succeeds.</p><p class="muted">Network costs in test SOL, measured on devnet. Publishing takes about 0.013, or a little more with a custom curve. If the launch opens, whoever completes the opening purchase pays about 0.022 more to create the pool. Each buyer pays about 0.005 to join. Keep some spare SOL in this wallet so you can finish the launch.</p><p class="muted">Up to 24 wallets can join. Deposits are public; bids stay private until close. If the minimum is missed, the creator cancels, or settlement expires, participants can claim deposits after bids return to Solana.</p><details><summary>Addresses and fee details</summary><p>Quote mint: ${h(input.quote)}<br>DBC configuration: ${h(input.config)}<br>Partner fee recipient: ${h(input.feeClaimer??'Unavailable')}<br>Leftover token recipient: ${h(input.leftoverReceiver??'Unavailable')}</p><p>LP percentages apply after migration, which is not guaranteed. The creator fee share is a percentage of the native fee portion, not of each trade.</p></details>`;
}

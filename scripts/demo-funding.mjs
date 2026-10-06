// Local-only, budgeted faucet for the published synthetic devnet quote mint.
// Authority keys never reach the browser. Do not expose this server publicly.
import http from 'node:http';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {Connection,Keypair,PublicKey,Transaction,SystemProgram,sendAndConfirmTransaction} from '@solana/web3.js';
import {getMint,getOrCreateAssociatedTokenAccount,mintTo} from '@solana/spl-token';
if(!process.env.ANCHOR_WALLET)throw Error('Set ANCHOR_WALLET to the demo devnet payer');
const payer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(process.env.ANCHOR_WALLET,'utf8'))));
const c=new Connection('https://api.devnet.solana.com',{commitment:'confirmed',disableRetryOnRateLimit:true});
if(await c.getGenesisHash()!=='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')throw Error('Devnet only');
const context=JSON.parse(readFileSync('target/launch-demo/context.json','utf8')),allowedMint=new PublicKey(context.quote);
if(!(await getMint(c,allowedMint)).mintAuthority?.equals(payer.publicKey))throw Error('Demo mint authority mismatch');
const receiptsFile='target/launch-demo/funding-receipts.json';
const receipts=existsSync(receiptsFile)?JSON.parse(readFileSync(receiptsFile,'utf8')):{};
const origins=new Set(['http://127.0.0.1:5173','http://localhost:5173','http://127.0.0.1:4173','http://localhost:4173']);
let pending=Promise.resolve();
const server=http.createServer(async(req,res)=>{
  const origin=req.headers.origin;
  if(!origin||!origins.has(origin)){res.writeHead(403);res.end();return;}
  res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Content-Type','application/json');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  if(req.method!=='POST'||req.url!=='/fund'){res.writeHead(404);res.end('{}');return;}
  let body='';for await(const chunk of req){body+=chunk;if(body.length>2048){res.writeHead(413);res.end('{}');return;}}
  const task=async()=>{try{
    const data=JSON.parse(body),owner=new PublicKey(data.wallet),mint=new PublicKey(data.quoteMint);
    if(!mint.equals(allowedMint))throw Error('Only the published synthetic demo token is supported.');
    const id=owner.toBase58();if(receipts[id]){if(receipts[id].pending)throw Error('A previous funding attempt needs operator recovery. Check balances before retrying.');res.end(JSON.stringify(receipts[id]));return;}
    if(Object.keys(receipts).length>=10)throw Error('This local demo funding budget is exhausted.');
    if(await c.getBalance(payer.publicKey)<100_000_000)throw Error('The devnet demo payer needs more test SOL.');
    // Reserve before signing, so interruptions do not cause repeated payments.
    receipts[id]={pending:true};writeFileSync(receiptsFile,JSON.stringify(receipts));
    let signature;
    if(await c.getBalance(owner)<20_000_000)signature=await sendAndConfirmTransaction(c,new Transaction().add(SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:owner,lamports:50_000_000})),[payer]);
    const ata=await getOrCreateAssociatedTokenAccount(c,payer,mint,owner);
    signature=await mintTo(c,payer,mint,ata.address,payer,100_000_000);
    receipts[id]={signature,quoteAccount:ata.address.toBase58(),testQuoteAmount:'100000000'};writeFileSync(receiptsFile,JSON.stringify(receipts));res.end(JSON.stringify(receipts[id]));
  }catch(error){res.writeHead(400);res.end(JSON.stringify({error:error.message}));}};
  pending=pending.then(task,task);await pending;
});
server.listen(8790,'127.0.0.1',()=>console.log('Demo funding server: http://127.0.0.1:8790 (devnet only; 10 wallets maximum)'));

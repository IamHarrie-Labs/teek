// Recover excess test SOL from this project's disposable privacy-test wallets.
// Leave 0.002 SOL in each wallet for follow-up recovery transactions.
import {readFileSync,readdirSync} from 'node:fs';
import {Connection,Keypair,Transaction,SystemProgram,sendAndConfirmTransaction} from '@solana/web3.js';
if(!process.env.ANCHOR_WALLET)throw Error('Set original devnet payer wallet');
const payer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(process.env.ANCHOR_WALLET,'utf8'))));
if(payer.publicKey.toBase58()!=='BtiHqodafgFR34jUhTMRgdgRnEcGvYjHARYPFq5GzeG2')throw Error('Original test payer mismatch');
const c=new Connection('https://api.devnet.solana.com',{commitment:'confirmed',disableRetryOnRateLimit:true});
if(await c.getGenesisHash()!=='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')throw Error('Devnet only');
const keys=readdirSync('target/private-proof').filter(f=>/^(alice|bob)-\d+-keypair\.json$/.test(f)).map(f=>Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(`target/private-proof/${f}`,'utf8')))));
const infos=await c.getMultipleAccountsInfo(keys.map(k=>k.publicKey));
let total=0;
for(let start=0;start<keys.length;start+=4){const tx=new Transaction(),signers=[payer];
  for(let i=start;i<Math.min(start+4,keys.length);i++){const balance=infos[i]?.lamports??0;if(balance>100_000_000)throw Error('Unexpected disposable wallet balance');const amount=balance-2_000_000;if(amount<=0)continue;
    tx.add(SystemProgram.transfer({fromPubkey:keys[i].publicKey,toPubkey:payer.publicKey,lamports:amount}));signers.push(keys[i]);total+=amount;}
  if(signers.length>1)console.log('Devnet recovery signature',await sendAndConfirmTransaction(c,tx,signers));
}
console.log(`Recovered ${total} test lamports to the original payer.`);

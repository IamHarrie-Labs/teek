// Resumable upgrade of the existing reviewed devnet program. No mainnet path.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Connection,Keypair,PublicKey,Transaction,TransactionInstruction,SystemProgram,SYSVAR_RENT_PUBKEY,SYSVAR_CLOCK_PUBKEY,sendAndConfirmTransaction} from '@solana/web3.js';
const c=new Connection('https://api.devnet.solana.com',{commitment:'confirmed',disableRetryOnRateLimit:true});
if(await c.getGenesisHash()!=='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')throw Error('Devnet only');
if(!process.env.ANCHOR_WALLET)throw Error('Set devnet upgrade authority wallet');
const signer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(process.env.ANCHOR_WALLET,'utf8'))));
if(signer.publicKey.toBase58()!=='BtiHqodafgFR34jUhTMRgdgRnEcGvYjHARYPFq5GzeG2')throw Error('Unexpected authority');
const program=new PublicKey('B6eqSCBhokuZLKqBrzwhquUho183P3Fvu8pgC4a9PFkY'),loader=new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111'),programData=PublicKey.findProgramAddressSync([program.toBuffer()],loader)[0];
const binary=readFileSync('target/deploy/tick.so'),hash=createHash('sha256').update(binary).digest('hex');
const evidence=JSON.parse(readFileSync('tick/evidence/settlement-local.json','utf8'));
if(evidence.programHash!==hash||!evidence.launches.some(x=>x.bidders===24&&x.outcome.includes('all allocations'))||!evidence.launches.some(x=>x.outcome.includes('rolled back')||x.outcome.includes('rolled')))throw Error('Exact-binary full-capacity/rollback evidence missing');
if(!readFileSync('tick/SETTLEMENT_REVIEW.md','utf8').includes(`Reviewed binary SHA256: ${hash}`))throw Error('Exact artifact review record missing');
const current=await c.getAccountInfo(programData);
if(!current?.owner.equals(loader)||current.data.readUInt32LE(0)!==3||current.data[12]!==1||!new PublicKey(current.data.subarray(13,45)).equals(signer.publicKey))throw Error('ProgramData authority mismatch');
if(binary.length>current.data.length-45)throw Error('This helper requires existing ProgramData capacity; no automatic rent extension');
if(current.data.subarray(45,45+binary.length).equals(binary)){console.log('Exact reviewed binary already deployed.');process.exit(0);}
const backup='target/deploy/tick-before-settlement.so';if(!existsSync(backup))writeFileSync(backup,current.data.subarray(45));
const bufferFile='target/deploy/launch-settlement-buffer-keypair.json';
const buffer=existsSync(bufferFile)?Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(bufferFile,'utf8')))):Keypair.generate();
if(!existsSync(bufferFile))writeFileSync(bufferFile,JSON.stringify(Array.from(buffer.secretKey)),{mode:0o600});
let info=await c.getAccountInfo(buffer.publicKey);
if(!info){const rent=await c.getMinimumBalanceForRentExemption(binary.length+37);if(await c.getBalance(signer.publicKey)<rent+20_000_000)throw Error('Not enough devnet SOL for staging rent + fee reserve');
  const initialize=new TransactionInstruction({programId:loader,keys:[{pubkey:buffer.publicKey,isWritable:true,isSigner:false},{pubkey:signer.publicKey,isWritable:false,isSigner:false}],data:Buffer.alloc(4)});
  console.log('Created devnet staging buffer',await sendAndConfirmTransaction(c,new Transaction().add(SystemProgram.createAccount({fromPubkey:signer.publicKey,newAccountPubkey:buffer.publicKey,lamports:rent,space:binary.length+37,programId:loader}),initialize),[signer,buffer]));info=await c.getAccountInfo(buffer.publicKey);}
if(!info.owner.equals(loader)||info.data.readUInt32LE(0)!==1||info.data[4]!==1||!new PublicKey(info.data.subarray(5,37)).equals(signer.publicKey)||info.data.length!==binary.length+37)throw Error('Staging buffer mismatch');
const chunks=[];for(let offset=0;offset<binary.length;offset+=976){const data=binary.subarray(offset,Math.min(offset+976,binary.length));if(!info.data.subarray(37+offset,37+offset+data.length).equals(data))chunks.push({offset,data});}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));console.log(`Uploading ${chunks.length} missing chunks for ${hash}`);
for(let start=0;start<chunks.length;start+=4){let done=false;for(let attempt=0;attempt<5&&!done;attempt++)try{
  const block=await c.getLatestBlockhash('confirmed'),signatures=[];
  for(const chunk of chunks.slice(start,start+4)){const header=Buffer.alloc(16);header.writeUInt32LE(1);header.writeUInt32LE(chunk.offset,4);header.writeBigUInt64LE(BigInt(chunk.data.length),8);
    const tx=new Transaction({feePayer:signer.publicKey,recentBlockhash:block.blockhash}).add(new TransactionInstruction({programId:loader,keys:[{pubkey:buffer.publicKey,isSigner:false,isWritable:true},{pubkey:signer.publicKey,isSigner:true,isWritable:false}],data:Buffer.concat([header,chunk.data])}));tx.sign(signer);
    signatures.push(await c.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:20}));await sleep(500);}
  for(let poll=0;poll<35;poll++){const statuses=(await c.getSignatureStatuses(signatures)).value;if(statuses.some(x=>x?.err))throw Error('Staging transaction failed');if(statuses.every(x=>x&&['confirmed','finalized'].includes(x.confirmationStatus))){done=true;break;}await sleep(800);}
  if(!done)throw Error('Staging confirmation timeout');
}catch(error){if(attempt===4)throw error;await sleep(5000);}if(start%40===0||start+4>=chunks.length)console.log(`Confirmed ${Math.min(start+4,chunks.length)}/${chunks.length} chunks`);}
info=await c.getAccountInfo(buffer.publicKey);if(!info.data.subarray(37).equals(binary))throw Error('Staged binary differs');
const ix=new TransactionInstruction({programId:loader,keys:[{pubkey:programData,isSigner:false,isWritable:true},{pubkey:program,isSigner:false,isWritable:true},{pubkey:buffer.publicKey,isSigner:false,isWritable:true},{pubkey:signer.publicKey,isSigner:false,isWritable:true},{pubkey:SYSVAR_RENT_PUBKEY,isSigner:false,isWritable:false},{pubkey:SYSVAR_CLOCK_PUBKEY,isSigner:false,isWritable:false},{pubkey:signer.publicKey,isSigner:true,isWritable:false}],data:Buffer.from([3,0,0,0])});
const signature=await sendAndConfirmTransaction(c,new Transaction().add(ix),[signer],{commitment:'confirmed',maxRetries:20});
const deployed=await c.getAccountInfo(programData);if(!deployed.data.subarray(45,45+binary.length).equals(binary))throw Error('Deployed binary comparison failed');
writeFileSync('tick/evidence/settlement-upgrade-devnet.json',JSON.stringify({network:'devnet',program:program.toBase58(),programData:programData.toBase58(),signature,sha256:hash,bytes:binary.length,slot:deployed.data.readBigUInt64LE(4).toString(),verifiedByteEquality:true},null,2));
console.log('Reviewed devnet upgrade verified',signature);

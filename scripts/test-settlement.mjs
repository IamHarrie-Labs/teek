// Fully isolated two-stage real-DBC integration runner. WSL only on Windows.
import {spawn,spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..'),run=(args)=>new Promise((done,reject)=>{const child=spawn(process.execPath,args,{cwd:root,stdio:'inherit'});child.on('exit',code=>code===0?done():reject(Error(`Test subprocess exit ${code}`)));});
const build=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','-p','tsconfig.json','--outDir','target/launch-test-js'],{cwd:root,stdio:'inherit'});if(build.status)process.exit(build.status);
const session=`target/settlement-run-${Date.now()}`;mkdirSync(resolve(root,session),{recursive:true});
const shellQuote=s=>"'"+s.replaceAll("'","'\\''")+"'";
const linuxRoot=root.replaceAll('\\','/').replace(/^([A-Z]):/,(_,drive)=>`/mnt/${drive.toLowerCase()}`);
function validator(ledger,fixtures){
 const command=['solana-test-validator','--ledger',ledger,'--rpc-port','8899','--gossip-port','12000','--dynamic-port-range','12000-13000','--quiet',
  '--bpf-program','B6eqSCBhokuZLKqBrzwhquUho183P3Fvu8pgC4a9PFkY','target/deploy/teek.so',
  '--bpf-program','dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN','target/deploy/dbc-mainnet.so',
  '--bpf-program','metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s','target/deploy/metadata-mainnet.so',
  '--bpf-program','Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz','target/deploy/tick_vrf_fixture.so',
  ...(fixtures?['--account-dir','target/settlement-fixture/accounts']:[])].map(shellQuote).join(' ');
 const child=spawn('wsl.exe',['-d','Ubuntu','--cd',linuxRoot,'--exec','bash','-lc',`${command} & echo $! > ${shellQuote(`${ledger}.pid`)}; wait $!`],{cwd:root,stdio:'inherit'});
 child.taskPidFile=resolve(root,`${ledger}.pid`);return child;
}
function stop(child){if(!child)return;const pid=readFileSync(child.taskPidFile,'utf8').trim();if(!/^\d+$/.test(pid))throw Error('Invalid validator PID');spawnSync('wsl.exe',['-d','Ubuntu','--exec','bash','-lc',`kill -TERM -- ${pid}`],{stdio:'inherit'});}
async function ready(){const end=Date.now()+45000;while(Date.now()<end){try{const response=await fetch('http://127.0.0.1:8899',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getHealth'})});if((await response.json()).result==='ok'){await new Promise(r=>setTimeout(r,5000));return;}}catch{}await new Promise(r=>setTimeout(r,500));}throw Error('Local validator did not start');}
// Avoid killing/replacing an unrelated validator.
try{await fetch('http://127.0.0.1:8899');throw Error('Port 8899 is occupied; stop your local validator before running this isolated suite.');}catch(error){if(error.message.startsWith('Port'))throw error;}
let child;
try{
 if(!process.argv.includes('--prepared')){child=validator(`${session}/prepare`,false);await ready();await run(['scripts/settlement-fixture.mjs','prepare']);stop(child);child=undefined;await new Promise(r=>setTimeout(r,4000));}
 child=validator(`${session}/verify`,true);await ready();await run(['scripts/settlement-fixture.mjs','verify']);
}finally{stop(child);}

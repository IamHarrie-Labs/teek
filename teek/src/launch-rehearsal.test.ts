import { describe, expect, it } from 'vitest';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { demoCurve, creatorCurve } from '../../clients/dbc-config';
import { rehearseLaunch } from '../../clients/launch-rehearsal';

const dbc=new DynamicBondingCurveClient(new Connection('http://127.0.0.1:8899'),'confirmed');
const config=demoCurve();
const run=(demand:bigint,minimumTokensAtCap=1_000_000n)=>rehearseLaunch({dbc,config,demand,minimum:100_000n,cap:600_000n,minimumTokensAtCap});
describe('Launch rehearsal using pinned Meteora curve',()=>{
  it('reproduces the recorded 0.6 quote opening and exact fee split',()=>{
    const r=run(900_000n);
    expect(r.case).toBe('opening');expect(r.accepted).toBe('600000');expect(r.unacceptedDemand).toBe('300000');
    expect(r.quotedOutput).toBe('1897418306355');expect(r.tradingFee).toBe('4800');expect(r.protocolFee).toBe('1200');
  });
  it('models below-minimum and output-floor failure without inventing a purchase',()=>{
    expect(run(99_999n)).toMatchObject({case:'below-minimum',accepted:'0',quotedOutput:null});
    expect(run(600_000n,2_000_000_000_000n)).toMatchObject({case:'output-floor-failure',requiredOutput:'2000000000000'});
  });
  it('uses the program’s ceiling rule at token precision',()=>{
    const r=run(100_000n,7n);
    expect(r.requiredOutput).toBe('2');
    expect(r.quotedOutput).not.toBeNull();
  });
  it('builds a restricted creator curve and quotes it before pool creation',()=>{
    const custom=creatorCurve({totalSupply:100_000_000,quoteDecimals:6,tradingFeeBps:150,creatorFeePercent:25,creatorLiquidityPercent:20,migrationQuoteThreshold:200});
    const rehearsal=rehearseLaunch({dbc,config:custom,demand:900_000n,minimum:100_000n,cap:600_000n,minimumTokensAtCap:1n});
    expect(rehearsal.case).toBe('opening');expect(BigInt(rehearsal.quotedOutput!)).toBeGreaterThan(0n);
    expect(custom.creatorTradingFeePercentage).toBe(25);
    expect(custom.migrationQuoteThreshold.toString()).toBe('200000000');
    expect(custom.creatorLiquidityPercentage).toBe(20);
    expect(custom.partnerPermanentLockedLiquidityPercentage).toBe(80);
    expect(()=>creatorCurve({totalSupply:100_000_000,quoteDecimals:6,tradingFeeBps:100,creatorFeePercent:25,creatorLiquidityPercent:60,migrationQuoteThreshold:200})).toThrow();
  });
  it('constructs a signed-config instruction for a creator without fetching chain state',async()=>{
    const creator=Keypair.generate().publicKey,configKey=Keypair.generate().publicKey;
    const params=creatorCurve({totalSupply:100_000_000,quoteDecimals:6,tradingFeeBps:150,creatorFeePercent:25,creatorLiquidityPercent:20,migrationQuoteThreshold:200});
    const tx=await dbc.partner.createConfig({...params,config:configKey,quoteMint:new PublicKey('GR5J9vsRr4WauZMaj6NvqYJHxRQjVjzcsTuwv2LgADPj'),payer:creator,feeClaimer:creator,leftoverReceiver:creator});
    expect(tx.instructions.length).toBeGreaterThan(0);
    expect(tx.instructions.some(ix=>ix.keys.some(key=>key.pubkey.equals(configKey)&&key.isSigner))).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { buildLaunchReceipt } from '../../clients/launch-read';
import { reconcileRefundEvents, decodeRefundEvents } from '../../clients/refund-history';
import { receiptCard, passportHtml } from './launch-passport';
import { PublicKey, type ParsedTransactionWithMeta } from '@solana/web3.js';
import { BorshInstructionCoder, BN, type Idl } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import idl from './idl/teek.json';
import { LAUNCH_PROGRAM_ID, launchBidAddress, launchQuoteVault } from '../../clients/launch';

const key = { toBase58: () => 'public-address' };
function fixture() {
  return {
    launch:'public-address',program:'program',quoteDecimals:6,baseDecimals:6,configHashMatches:true,observedAt:'2026-10-08T12:00:00.000Z',
    policy:{creatorTradingFeePercentage:10,feeClaimer:'partner',leftoverReceiver:'leftover',creatorLiquidityPercentage:0,creatorLockedLpPercentage:0,partnerLiquidityPercentage:0,partnerLockedLpPercentage:100,migrationQuoteThreshold:'1000000000'},
    account:{creator:key,quoteMint:key,bidCount:2,status:{settled:{}},terms:{baseMint:key,dbcConfig:key,minRaise:new BN(100),maxRaise:new BN(600000),biddingOpensAt:new BN(1),biddingClosesAt:new BN(2),settlementDeadline:new BN(3)}},
    settlement:{phase:3,configHash:Array(32).fill(0),metadata:{name:'<script>bad</script>',symbol:'OPEN'},minTokensAtCap:new BN(1),quoteSpent:new BN(600000),baseReceived:new BN('1897418306355'),accepted:[new BN(200000),new BN(400000)],tokens:[new BN('800729499464'),new BN('1096688806891')],refunds:[new BN(546794),new BN(353206)],claimed:1},
  } as unknown as Parameters<typeof buildLaunchReceipt>[0];
}
describe('Verified launch receipts',()=>{
  it('reports only paid claims, keeping unclaimed refunds separate',()=>{
    const receipt=buildLaunchReceipt(fixture());
    expect(receipt.outcome.refundsAllocated).toBe('900000');
    expect(receipt.outcome.refundsPaid).toBe('546794');
    expect(receipt.outcome.refundsRemaining).toBe('353206');
    expect(receipt.outcome.claimsCompleted).toBe(1);
    expect(JSON.parse(JSON.stringify(receipt)).outcome.tokensReceived).toBe('1897418306355');
  });
  it('fails closed on inconsistent totals or a claim outside the registry',()=>{
    const input=fixture();input.settlement.baseReceived=new BN(1);expect(()=>buildLaunchReceipt(input)).toThrow('reconcile');
    const other=fixture();other.settlement.claimed=4;expect(()=>buildLaunchReceipt(other)).toThrow('bitmap');
  });
  it('does not invent a refund total from failed-launch account state',()=>{
    const input=fixture();input.account.status={refunds:{}};input.settlement.phase=0;input.settlement.quoteSpent=new BN(0);input.settlement.baseReceived=new BN(0);
    const r=buildLaunchReceipt(input);expect(r.outcome.refundsPaid).toBeNull();expect(r.outcome.refundsAllocated).toBeNull();
    expect(passportHtml(r)).toContain('Check the payment history');
    expect(passportHtml(r)).not.toContain('quote paid');
    expect(passportHtml(r)).not.toContain('All refunds paid');expect(passportHtml(r,false,true)).toContain('All refunds paid');
  });
  it('says a pending launch can only refund once its deadline has passed',()=>{
    const input=fixture();input.account.status={ready:{}};input.settlement.phase=0;input.settlement.quoteSpent=new BN(0);input.settlement.baseReceived=new BN(0);
    const r=buildLaunchReceipt(input);
    expect(passportHtml(r)).toContain('has not settled yet');
    expect(passportHtml(r,true)).toContain('can only refund');expect(passportHtml(r,true)).toContain('Deadline passed');
  });
  it('escapes creator metadata in both the Passport and share card',()=>{
    const r=buildLaunchReceipt(fixture());expect(receiptCard(r)).not.toContain('<script>');expect(receiptCard(r)).toContain('&lt;script&gt;');
    expect(passportHtml(r)).toContain('SOLANA DEVNET');expect(receiptCard(r)).toContain(r.observedAt);
  });
  it('keeps a dated refund snapshot readable on refresh and in exports',()=>{
    const input=fixture();input.account.status={refunds:{}};const r=buildLaunchReceipt(input);
    r.refundHistory={coverage:'complete',observedAt:'2026-10-08T12:00:00.000Z',originalLiability:'1500000',paid:'1500000',remaining:'0',payments:[],note:'Historical evidence $& <script>.'};
    expect(passportHtml(r)).toContain('Refund payments checked');
    expect(passportHtml(r)).toContain('All recorded deposits have been returned.');
    expect(passportHtml(r)).toContain('Historical evidence $&amp; &lt;script&gt;.');
    expect(receiptCard(r)).toContain('1.5 quote refunds paid');
    expect(JSON.parse(JSON.stringify(r)).refundHistory.remaining).toBe('0');
  });
});
describe('Refund history reconciliation',()=>{
  const start={kind:'initialize' as const,signature:'init'},refund={kind:'refund' as const,signature:'close'};
  it('subtracts pre-opening withdrawals from the refund liability and supports partial refunds',()=>{
    const proof=reconcileRefundEvents([start,{kind:'deposit',bid:'a',amount:100n,signature:'fund'},{kind:'withdraw',bid:'a',amount:20n,signature:'before'},refund,{kind:'withdraw',bid:'a',amount:30n,signature:'after'}],new Map([['a',50n]]),true);
    expect(proof.coverage).toBe('complete');expect(proof.originalLiability).toBe('80');expect(proof.paid).toBe('30');expect(proof.remaining).toBe('50');
    expect(proof.payments.map(p=>p.signature)).toEqual(['after']);
  });
  it('requires initialization, complete history and balance reconciliation before certifying completion',()=>{
    const events=[refund,{kind:'withdraw' as const,bid:'a',amount:80n,signature:'payment'}];
    const proof=reconcileRefundEvents(events,new Map([['a',0n]]),true);expect(proof.coverage).toBe('partial');expect(proof.originalLiability).toBeNull();
    const valid=[start,{kind:'deposit' as const,bid:'a',amount:80n,signature:'fund'},...events];
    expect(reconcileRefundEvents(valid,new Map([['a',0n]]),false).coverage).toBe('partial');
    expect(reconcileRefundEvents(valid,new Map([['a',1n]]),true).coverage).toBe('partial');
    expect(reconcileRefundEvents(valid,new Map([['a',0n]]),true).coverage).toBe('complete');
  });
  it('keeps amounts above Number.MAX_SAFE_INTEGER exact',()=>{
    const large=18446744073709551615n;
    const proof=reconcileRefundEvents([start,{kind:'deposit',bid:'a',amount:large,signature:'fund'},refund,{kind:'withdraw',bid:'a',amount:large,signature:'paid'}],new Map([['a',0n]]),true);
    expect(proof.paid).toBe(large.toString());
  });
  it('requires a successful canonical instruction and matching SPL transfer',()=>{
    const launch=new PublicKey('B2PstiXkcw81SDafJrzQ8eB4YbcG3eYS33hH1Jjq1Y4X'),bidder=PublicKey.default,bid=launchBidAddress(launch,bidder),destination=PublicKey.unique(),vault=launchQuoteVault(launch);
    const coder=new BorshInstructionCoder(idl as Idl);
    const data=coder.encode('withdraw_launch_funding',{amount:new BN(80)});
    // web3 parsed instruction data is base58; encode through a public transaction helper's dependency.
    const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=BigInt('0x'+data.toString('hex')),encoded='';while(n){encoded=alphabet[Number(n%58n)]+encoded;n/=58n;}
    const tx={meta:{err:null,innerInstructions:[{index:0,instructions:[{programId:TOKEN_PROGRAM_ID,parsed:{type:'transfer',info:{source:vault.toBase58(),destination:destination.toBase58(),amount:'80'}}}]}]},transaction:{signatures:['paid'],message:{instructions:[{programId:LAUNCH_PROGRAM_ID,accounts:[bidder,launch,bid,destination,vault,TOKEN_PROGRAM_ID],data:encoded}]}}} as unknown as ParsedTransactionWithMeta;
    expect(decodeRefundEvents(tx,launch,new Set([bid.toBase58()]),true)[0].amount).toBe(80n);
    tx.meta!.err={InstructionError:[0,'InvalidArgument']};expect(decodeRefundEvents(tx,launch,new Set([bid.toBase58()]),true)).toEqual([]);
    tx.meta!.err=null;(tx.meta!.innerInstructions![0].instructions[0] as any).parsed.info.amount='79';
    expect(()=>decodeRefundEvents(tx,launch,new Set([bid.toBase58()]),true)).toThrow('unique SPL');
  });
});

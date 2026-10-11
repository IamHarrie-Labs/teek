import BN from 'bn.js';
import { DynamicBondingCurveClient, type SwapQuoteConfig } from '@meteora-ag/dynamic-bonding-curve-sdk';

const U64_MAX=(1n<<64n)-1n;
export type Rehearsal={
  case:'below-minimum'|'opening'|'output-floor-failure';
  demand:string;accepted:string;unacceptedDemand:string;requiredOutput:string;
  quotedOutput:string|null;tradingFee:string|null;protocolFee:string|null;
  note:string;
};

/** An exact hypothetical first purchase on the selected immutable DBC config.
 * Allocation by wallet requires the later VRF value, so this only models totals. */
export function rehearseLaunch(input:{dbc:DynamicBondingCurveClient;config:SwapQuoteConfig;demand:bigint;minimum:bigint;cap:bigint;minimumTokensAtCap:bigint}):Rehearsal {
  const {dbc,config,demand,minimum,cap,minimumTokensAtCap}=input;
  if([demand,minimum,cap,minimumTokensAtCap].some(n=>n<0n||n>U64_MAX)||minimum===0n||cap<minimum||minimumTokensAtCap===0n)throw Error('Invalid rehearsal amounts.');
  if(demand<minimum)return {case:'below-minimum',demand:demand.toString(),accepted:'0',unacceptedDemand:demand.toString(),requiredOutput:'0',quotedOutput:null,tradingFee:null,protocolFee:null,note:'Below the minimum. No opening purchase; funded wallets can withdraw after bids return to Solana.'};
  const accepted=demand<cap?demand:cap;
  // Mirrors programs/teek/src/launch_allocation.rs::minimum_output: ceil.
  const floor=(minimumTokensAtCap*accepted+cap-1n)/cap;
  const quote=dbc.pool.getQuoteFromInputAmount({config,swapBaseForQuote:false,
    amountIn:new BN(accepted.toString()),slippageBps:0,hasReferral:false,
    eligibleForFirstSwapWithMinFee:false,currentPoint:new BN(0)});
  const output=BigInt(quote.outputAmount.toString());
  if(BigInt(quote.amountLeft.toString())!==0n)throw Error('The curve cannot fill the entire opening purchase. Choose a lower cap.');
  const failed=output<floor;
  return {case:failed?'output-floor-failure':'opening',demand:demand.toString(),accepted:accepted.toString(),
    unacceptedDemand:(demand-accepted).toString(),requiredOutput:floor.toString(),quotedOutput:output.toString(),
    tradingFee:quote.tradingFee.toString(),protocolFee:quote.protocolFee.toString(),
    note:failed?'Output falls below the signed minimum. Settlement would revert; the creator may need to cancel or let the deadline expire.':'If the pool begins at this unchanged configuration, the opening purchase satisfies the output floor. Final wallet allocations depend on sealed bids and VRF rounding.'};
}

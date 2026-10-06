import { buildCurve } from '@meteora-ag/dynamic-bonding-curve-sdk';

/** Conservative devnet demonstration curve. Quote amounts here assume six
 * decimals. This is a fixture, not a recommendation for a real token launch. */
export function demoCurve() {
  return buildCurve({ token: {tokenType:0,tokenBaseDecimal:6,tokenQuoteDecimal:6,
    tokenAuthorityOption:1,totalTokenSupply:1_000_000_000,leftover:0},
    fee:{baseFeeParams:{baseFeeMode:0,feeSchedulerParam:{startingFeeBps:100,endingFeeBps:100,
      numberOfPeriod:0,totalDuration:0}},dynamicFeeEnabled:false,collectFeeMode:0,
      creatorTradingFeePercentage:10,poolCreationFee:0,enableFirstSwapWithMinFee:false},
    migration:{migrationOption:1,migrationFeeOption:0,migrationFee:{feePercentage:0,creatorFeePercentage:0}},
    liquidityDistribution:{partnerPermanentLockedLiquidityPercentage:100,partnerLiquidityPercentage:0,
      creatorPermanentLockedLiquidityPercentage:0,creatorLiquidityPercentage:0},
    lockedVesting:{totalLockedVestingAmount:0,numberOfVestingPeriod:0,cliffUnlockAmount:0,
      totalVestingDuration:0,cliffDurationFromMigrationTime:0},
    activationType:0,percentageSupplyOnMigration:20,migrationQuoteThreshold:1000 });
}

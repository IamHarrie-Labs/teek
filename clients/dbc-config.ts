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

export type CreatorCurveInput={totalSupply:number;quoteDecimals:number;tradingFeeBps:number;creatorFeePercent:number;creatorLiquidityPercent:number;migrationQuoteThreshold:number};

/** Deliberately narrow creator profile supported by Teek's pinned DBC CPI.
 * The creator controls their fee and unlocked migrated LP allocation. The
 * remainder of migrated LP stays permanently locked to the partner side. */
export function creatorCurve(input:CreatorCurveInput) {
  const whole=(n:number)=>Number.isSafeInteger(n);
  if(!whole(input.totalSupply)||input.totalSupply<1_000_000||input.totalSupply>10_000_000_000||
    !whole(input.quoteDecimals)||input.quoteDecimals<6||input.quoteDecimals>9||
    !whole(input.tradingFeeBps)||input.tradingFeeBps<10||input.tradingFeeBps>500||
    !whole(input.creatorFeePercent)||input.creatorFeePercent<0||input.creatorFeePercent>100||
    !whole(input.creatorLiquidityPercent)||input.creatorLiquidityPercent<0||input.creatorLiquidityPercent>50||
    !whole(input.migrationQuoteThreshold)||input.migrationQuoteThreshold<1||input.migrationQuoteThreshold>1_000_000)
    throw Error('Use a supported whole-number supply, fee, creator share, liquidity allocation and migration threshold.');
  return buildCurve({token:{tokenType:0,tokenBaseDecimal:6,tokenQuoteDecimal:input.quoteDecimals,
    tokenAuthorityOption:1,totalTokenSupply:input.totalSupply,leftover:0},
    fee:{baseFeeParams:{baseFeeMode:0,feeSchedulerParam:{startingFeeBps:input.tradingFeeBps,endingFeeBps:input.tradingFeeBps,
      numberOfPeriod:0,totalDuration:0}},dynamicFeeEnabled:false,collectFeeMode:0,
      creatorTradingFeePercentage:input.creatorFeePercent,poolCreationFee:0,enableFirstSwapWithMinFee:false},
    migration:{migrationOption:1,migrationFeeOption:0,migrationFee:{feePercentage:0,creatorFeePercentage:0}},
    liquidityDistribution:{partnerPermanentLockedLiquidityPercentage:100-input.creatorLiquidityPercent,partnerLiquidityPercentage:0,
      creatorPermanentLockedLiquidityPercentage:0,creatorLiquidityPercentage:input.creatorLiquidityPercent},
    lockedVesting:{totalLockedVestingAmount:0,numberOfVestingPeriod:0,cliffUnlockAmount:0,
      totalVestingDuration:0,cliffDurationFromMigrationTime:0},
    activationType:0,percentageSupplyOnMigration:20,migrationQuoteThreshold:input.migrationQuoteThreshold});
}

import type { LaunchClient } from './launch';

type Launch = Awaited<ReturnType<LaunchClient['base']['account']['launch']['fetch']>>;
type Settlement = Awaited<ReturnType<LaunchClient['base']['account']['settlementState']['fetch']>>;
export interface CurvePolicy {
  creatorTradingFeePercentage: number;
  feeClaimer: string;
  leftoverReceiver: string;
  creatorLiquidityPercentage: number;
  creatorLockedLpPercentage: number;
  partnerLiquidityPercentage: number;
  partnerLockedLpPercentage: number;
  migrationQuoteThreshold: string;
}
export interface RefundProof {
  coverage: 'complete' | 'partial';
  observedAt: string;
  originalLiability: string | null;
  paid: string;
  remaining: string | null;
  payments: { signature: string; bid: string; amount: string }[];
  note: string;
}
export interface LaunchReceipt {
  schema: 'teek.launch-receipt.v1';
  network: 'devnet';
  observedAt: string;
  commitment: 'confirmed';
  launch: string;
  program: string;
  creator: string;
  name: string;
  symbol: string;
  quoteMint: string;
  baseMint: string;
  quoteDecimals: number;
  baseDecimals: number;
  config: string;
  configHash: string;
  configHashMatches: boolean;
  policy: CurvePolicy;
  status: string;
  registeredWallets: number;
  capacity: 24;
  terms: { minimum: string; cap: string; minimumOutputAtCap: string; bidsOpen: number; bidsClose: number; deadline: number };
  outcome: { quoteSpent: string; tokensReceived: string; refundsAllocated: string | null; refundsPaid: string | null; refundsRemaining: string | null; claimsCompleted: number | null };
  refundHistory?: RefundProof;
}
const sum = (values: { toString(): string }[], count: number) => values.slice(0, count).reduce<bigint>((n, v) => n + BigInt(v.toString()), 0n);
export function buildLaunchReceipt(input: {
  launch: string; program: string; account: Launch; settlement: Settlement;
  quoteDecimals: number; baseDecimals: number; policy: CurvePolicy;
  configHashMatches: boolean; observedAt: string;
}): LaunchReceipt {
  const { account: a, settlement: s } = input;
  if (a.bidCount < 0 || a.bidCount > 24 || !Number.isInteger(a.bidCount)) throw Error('Invalid launch capacity');
  const settled = 'settled' in a.status;
  const status = settled ? 'Settled' : 'refunds' in a.status ? 'Refunds available' : 'ready' in a.status ? 'Ready to settle' : 'Opening pending';
  let refundsAllocated: string | null = null, refundsPaid: string | null = null, refundsRemaining: string | null = null, claimsCompleted: number | null = null;
  if (settled) {
    if (s.phase !== 3 || sum(s.accepted, a.bidCount) !== BigInt(s.quoteSpent.toString()) || sum(s.tokens, a.bidCount) !== BigInt(s.baseReceived.toString())) throw Error('Settlement totals do not reconcile');
    if ((BigInt(s.claimed) >> BigInt(a.bidCount)) !== 0n) throw Error('Invalid claim bitmap');
    const total = sum(s.refunds, a.bidCount);
    let paid = 0n; claimsCompleted = 0;
    for (let i = 0; i < a.bidCount; i++) if ((s.claimed & (1 << i)) !== 0) { paid += BigInt(s.refunds[i].toString()); claimsCompleted++; }
    refundsAllocated = total.toString(); refundsPaid = paid.toString(); refundsRemaining = (total - paid).toString();
  }
  return {
    schema: 'teek.launch-receipt.v1', network: 'devnet', commitment: 'confirmed', observedAt: input.observedAt,
    launch: input.launch, program: input.program, creator: a.creator.toBase58(), name: s.metadata.name, symbol: s.metadata.symbol,
    quoteMint: a.quoteMint.toBase58(), baseMint: a.terms.baseMint.toBase58(), quoteDecimals: input.quoteDecimals, baseDecimals: input.baseDecimals,
    config: a.terms.dbcConfig.toBase58(), configHash: s.configHash.map(n => n.toString(16).padStart(2, '0')).join(''), configHashMatches: input.configHashMatches,
    policy: input.policy, status, registeredWallets: a.bidCount, capacity: 24,
    terms: { minimum: a.terms.minRaise.toString(), cap: a.terms.maxRaise.toString(), minimumOutputAtCap: s.minTokensAtCap.toString(), bidsOpen: a.terms.biddingOpensAt.toNumber(), bidsClose: a.terms.biddingClosesAt.toNumber(), deadline: a.terms.settlementDeadline.toNumber() },
    outcome: { quoteSpent: s.quoteSpent.toString(), tokensReceived: s.baseReceived.toString(), refundsAllocated, refundsPaid, refundsRemaining, claimsCompleted },
  };
}

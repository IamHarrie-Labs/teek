import { BorshInstructionCoder, type Idl } from '@coral-xyz/anchor';
import { Connection, PublicKey, type ParsedTransactionWithMeta } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import idl from '../teek/src/idl/teek.json';
import { LAUNCH_PROGRAM_ID, launchBidAddress, launchQuoteVault } from './launch';
import type { RefundProof } from './launch-read';

const coder = new BorshInstructionCoder(idl as Idl);
type MoneyEvent = { kind: 'initialize' | 'deposit' | 'withdraw' | 'refund'; bid?: string; amount?: bigint; signature: string };

/** Only successful direct Teek instructions with a matching SPL transfer count.
 * Unsupported CPI wrappers and missing/pruned transactions cannot certify totals. */
export function decodeRefundEvents(tx: ParsedTransactionWithMeta, launch: PublicKey, registered: Set<string>, belowMinimum: boolean): MoneyEvent[] {
  if (!tx.meta || tx.meta.err) return [];
  const events: MoneyEvent[] = [], vault = launchQuoteVault(launch).toBase58();
  for (const [index, ix] of tx.transaction.message.instructions.entries()) {
    if (!ix.programId.equals(LAUNCH_PROGRAM_ID) || !('data' in ix)) continue;
    const decoded = coder.decode(ix.data, 'base58');
    if (!decoded) throw Error('Unknown Teek instruction in payment history');
    const definition = idl.instructions.find(d => d.name === decoded.name);
    if (!definition) throw Error('Unknown instruction definition');
    const accounts = Object.fromEntries(definition.accounts.map((a, i) => [a.name, ix.accounts[i]?.toBase58()]));
    if (accounts.launch !== launch.toBase58()) continue;
    const signature = tx.transaction.signatures[0];
    if (decoded.name === 'initialize_launch') events.push({ kind: 'initialize', signature });
    if (['cancel_launch', 'expire_launch'].includes(decoded.name) || (decoded.name === 'close_launch' && belowMinimum)) events.push({ kind: 'refund', signature });
    const deposit = ['register_launch_bid', 'fund_launch_bid'].includes(decoded.name), withdraw = decoded.name === 'withdraw_launch_funding';
    if (!deposit && !withdraw) continue;
    if (!accounts.bidder || !accounts.bid || !registered.has(accounts.bid) || launchBidAddress(launch, new PublicKey(accounts.bidder)).toBase58() !== accounts.bid) throw Error('Noncanonical bid in payment history');
    const amount = BigInt((decoded.data as { amount: { toString(): string } }).amount.toString());
    const inner = tx.meta.innerInstructions?.find(group => group.index === index)?.instructions ?? [];
    const matches = inner.filter(i => {
      if (!i.programId.equals(TOKEN_PROGRAM_ID) || !('parsed' in i)) return false;
      const { type, info } = i.parsed;
      return ['transfer', 'transferChecked'].includes(type) && info.source === (deposit ? accounts.source : vault)
        && info.destination === (deposit ? vault : accounts.destination)
        && String(info.amount ?? info.tokenAmount?.amount) === amount.toString();
    });
    if (matches.length !== 1) throw Error('Payment history lacks its unique SPL transfer');
    events.push({ kind: deposit ? 'deposit' : 'withdraw', bid: accounts.bid, amount, signature });
  }
  if (tx.meta.innerInstructions?.some(g => g.instructions.some(i => i.programId.equals(LAUNCH_PROGRAM_ID)))) throw Error('CPI-wrapped history needs separate verification');
  return events;
}

export function reconcileRefundEvents(events: MoneyEvent[], current: Map<string, bigint>, complete: boolean): RefundProof {
  const balances = new Map<string, bigint>();
  let refundMode = false, original: bigint | null = null, initialized = false, valid = complete;
  const payments: RefundProof['payments'] = [];
  for (const e of events) {
    if (e.kind === 'initialize') initialized = true;
    if (e.kind === 'refund') { if (!refundMode) original = [...balances.values()].reduce((a, b) => a + b, 0n); refundMode = true; }
    if (e.kind === 'deposit') { if (refundMode) valid = false; balances.set(e.bid!, (balances.get(e.bid!) ?? 0n) + e.amount!); }
    if (e.kind === 'withdraw') {
      const balance = balances.get(e.bid!) ?? 0n;
      if (balance < e.amount!) valid = false;
      balances.set(e.bid!, balance - e.amount!);
      if (refundMode) payments.push({ signature: e.signature, bid: e.bid!, amount: e.amount!.toString() });
    }
  }
  valid = valid && initialized && refundMode && balances.size === current.size && [...current].every(([bid, value]) => balances.get(bid) === value);
  const paid = payments.reduce((n, p) => n + BigInt(p.amount), 0n), remaining = [...current.values()].reduce((a, b) => a + b, 0n);
  return { coverage: valid ? 'complete' : 'partial', observedAt: new Date().toISOString(), originalLiability: valid ? original!.toString() : null,
    paid: paid.toString(), remaining: valid ? remaining.toString() : null, payments,
    note: valid ? 'Registered deposits match the confirmed payment history on Solana.' : 'Only part of the payment history is available. Full repayment cannot yet be confirmed.' };
}

export async function verifyRefundHistory(connection: Connection, launch: PublicKey, bids: PublicKey[], belowMinimum: boolean, readBalances: () => Promise<Map<string, bigint>>): Promise<RefundProof> {
  const signatures: string[] = []; let before: string | undefined, exhausted = false;
  // Bounded, explicit audit; do not scan program-wide history during normal refresh.
  for (let page = 0; page < 3; page++) {
    const rows = await connection.getSignaturesForAddress(launch, { before, limit: 100 }, 'confirmed');
    signatures.push(...rows.filter(r => !r.err).map(r => r.signature));
    if (rows.length < 100) { exhausted = true; break; }
    before = rows[rows.length - 1].signature;
  }
  const transactions: (ParsedTransactionWithMeta | null)[] = [];
  for (let i = 0; i < signatures.length; i += 3) transactions.push(...await Promise.all(signatures.slice(i, i + 3).map(signature => connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' }))));
  const events: MoneyEvent[] = []; let complete = exhausted;
  for (const tx of transactions.reverse()) {
    if (!tx) { complete = false; continue; }
    try { events.push(...decodeRefundEvents(tx, launch, new Set(bids.map(b => b.toBase58())), belowMinimum)); } catch { complete = false; }
  }
  return reconcileRefundEvents(events, await readBalances(), complete);
}

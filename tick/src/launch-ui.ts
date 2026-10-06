/** Presentation helpers keep base units exact; no Number conversion for funds. */
export function parseAmount(text: string, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) throw new Error('Unsupported token precision');
  if (!/^\d+(\.\d+)?$/.test(text.trim())) throw new Error('Enter a positive decimal amount');
  const [whole, fraction = ''] = text.trim().split('.');
  if (fraction.length > decimals) throw new Error(`Use at most ${decimals} decimal places`);
  const value = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
  if (value > 18446744073709551615n) throw new Error('Amount is too large');
  return value;
}
export function formatAmount(value: string | bigint, decimals: number): string {
  const n = BigInt(value), scale = 10n ** BigInt(decimals);
  const fraction = (n % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${(n / scale).toLocaleString('en-US')}${fraction ? `.${fraction}` : ''}`;
}
export function averagePrice(quote: string, base: string, quoteDecimals: number, baseDecimals: number): string {
  if (BigInt(base) === 0n) return '—';
  const scale = 12;
  const price = BigInt(quote) * 10n ** BigInt(baseDecimals + scale)
    / (BigInt(base) * 10n ** BigInt(quoteDecimals));
  return price === 0n && BigInt(quote) > 0n ? '<0.000000000001' : formatAmount(price, scale);
}
export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
export function launchStage(status: Record<string, unknown>, now: number, open: number, close: number, deadline: number): string {
  if ('settled' in status) return 'Settled';
  if ('refunds' in status) return 'Refunds available';
  if (now >= deadline) return 'Refund deadline reached';
  if ('ready' in status) return 'Ready to settle';
  if (now < open) return 'Funding open';
  return now < close ? 'Private bidding' : 'Ready to close';
}

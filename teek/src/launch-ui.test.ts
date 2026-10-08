import { describe, expect, it } from 'vitest';
import { parseAmount, formatAmount, averagePrice, escapeHtml, launchStage } from './launch-ui';
describe('Launch UI money and lifecycle', () => {
  it('round-trips u64 amounts without floating point', () => {
    const max = parseAmount('18446744073709.551615', 6);
    expect(max).toBe(18446744073709551615n);
    expect(formatAmount(max, 6)).toBe('18,446,744,073,709.551615');
    expect(parseAmount('0.000001', 6)).toBe(1n);
    expect(() => parseAmount('0.0000001', 6)).toThrow('decimal');
    expect(() => parseAmount('1e9', 6)).toThrow();
    expect(() => parseAmount('18446744073709551616', 0)).toThrow();
  });
  it('renders untrusted metadata as text', () => expect(escapeHtml('<img src=x onerror="x">')).toBe('&lt;img src=x onerror=&quot;x&quot;&gt;'));
  it('normalizes quote/base decimals for the observed average price', () => {
    expect(averagePrice('1000000','2000000',6,6)).toBe('0.5');
    expect(averagePrice('1000000','2000000000',6,9)).toBe('0.5');
    expect(averagePrice('1','18446744073709551615',9,6)).toBe('<0.000000000001');
    expect(averagePrice('1000','0',6,6)).toBe('—');
  });
  it('shows terminal state before expiry and exact boundaries', () => {
    expect(launchStage({settled:{}}, 100, 10, 20, 30)).toBe('Settled');
    expect(launchStage({funding:{}}, 10, 10, 20, 30)).toBe('Private bidding');
    expect(launchStage({funding:{}}, 20, 10, 20, 30)).toBe('Ready to close');
    expect(launchStage({ready:{}}, 30, 10, 20, 30)).toBe('Refund deadline reached');
  });
});

import { describe, expect, it } from 'vitest';
import { orderWallets } from './wallets';

describe('wallet picker order', () => {
  it('puts Phantom, Solflare and Backpack first, then the rest alphabetically', () => {
    const names = orderWallets([{ name: 'Zeta' }, { name: 'Backpack' }, { name: 'Alpha' }, { name: 'Phantom' }, { name: 'Solflare' }]).map((w) => w.name);
    expect(names).toEqual(['Phantom', 'Solflare', 'Backpack', 'Alpha', 'Zeta']);
  });
  it('lists a wallet once even if it registers twice', () => {
    expect(orderWallets([{ name: 'Solflare' }, { name: 'Solflare' }])).toHaveLength(1);
  });
});

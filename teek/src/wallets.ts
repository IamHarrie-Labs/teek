import { getWallets } from '@wallet-standard/app';
import { isWalletAdapterCompatibleStandardWallet, type WalletAdapterCompatibleStandardWallet } from '@solana/wallet-adapter-base';
import { StandardWalletAdapter } from '@solana/wallet-standard-wallet-adapter-base';
import type { LaunchWallet } from '../../clients/launch';

// Phantom, Solflare and Backpack all announce themselves through the Wallet Standard,
// so one code path covers them and any other Solana wallet the visitor has installed.
export type StandardWallet = WalletAdapterCompatibleStandardWallet;
export type ConnectedWallet = { wallet: LaunchWallet; name: string; disconnect(): Promise<void> };

const PREFERRED = ['Phantom', 'Solflare', 'Backpack'];
const LAST_WALLET = 'teek-launch-wallet-name';
export const DEMO = 'demo';
export const SIGNED_OUT = 'none';

export const INSTALL_LINKS = [
  { name: 'Phantom', url: 'https://phantom.com/download' },
  { name: 'Solflare', url: 'https://solflare.com/download' },
  { name: 'Backpack', url: 'https://backpack.app/downloads' },
];

/** Known wallets first in a fixed order, then the rest alphabetically, with duplicates removed. */
export function orderWallets<T extends { name: string }>(wallets: T[]): T[] {
  const unique = [...new Map(wallets.map((w) => [w.name, w])).values()];
  const rank = (name: string) => { const i = PREFERRED.indexOf(name); return i < 0 ? PREFERRED.length : i; };
  return unique.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}

export function detectedWallets(): StandardWallet[] {
  return orderWallets(getWallets().get().filter((w) => isWalletAdapterCompatibleStandardWallet(w) && w.chains.some((c) => c.startsWith('solana:'))) as StandardWallet[]);
}

/** Calls back whenever a wallet extension registers or goes away, since extensions can load after the page. */
export function onWalletsChanged(callback: () => void): () => void {
  const api = getWallets();
  const offRegister = api.on('register', callback), offUnregister = api.on('unregister', callback);
  return () => { offRegister(); offUnregister(); };
}

export function lastWallet(): string | null {
  try { return localStorage.getItem(LAST_WALLET); } catch { return null; }
}
export function rememberWallet(name: string) {
  try { localStorage.setItem(LAST_WALLET, name); } catch { /* storage blocked: the visitor just reconnects next time */ }
}

function toLaunchWallet(adapter: StandardWalletAdapter): LaunchWallet {
  const { publicKey, signTransaction, signAllTransactions, signMessage } = adapter;
  if (!publicKey) throw Error(`${adapter.name} didn't share an account. Unlock it and try again.`);
  if (!signTransaction || !signAllTransactions) throw Error(`${adapter.name} can't sign transactions for this site.`);
  if (!signMessage) throw Error(`${adapter.name} can't sign messages, which Teek needs to keep your bid private. Try another wallet.`);
  return { publicKey, signTransaction, signAllTransactions, signMessage } as LaunchWallet;
}

/**
 * Connects to a wallet. With `silent`, it only reconnects if the wallet already trusts this site,
 * so a reload never pops up an approval window. `onChange` hears about account switches and disconnects.
 */
export async function connectWallet(standard: StandardWallet, onChange: (wallet: LaunchWallet | undefined) => void, silent = false): Promise<ConnectedWallet> {
  const adapter = new StandardWalletAdapter({ wallet: standard });
  if (silent) await adapter.autoConnect(); else await adapter.connect();
  const wallet = toLaunchWallet(adapter);
  rememberWallet(adapter.name);
  adapter.on('connect', () => { try { onChange(toLaunchWallet(adapter)); } catch { onChange(undefined); } });
  adapter.on('disconnect', () => onChange(undefined));
  return {
    wallet,
    name: adapter.name,
    async disconnect() {
      rememberWallet(SIGNED_OUT);
      adapter.removeAllListeners();
      await adapter.disconnect().catch(() => undefined);
      adapter.destroy();
    },
  };
}

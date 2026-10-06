import type { ConnectionConfig } from '@solana/web3.js';

/** Retry the same RPC request body; signed transactions retain their signature.
 * Do not rebuild or resign a value-moving operation inside this transport. */
export const retryingFetch: NonNullable<ConnectionConfig['fetch']> = async (input, init) => {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await globalThis.fetch(input as RequestInfo, { ...(init as RequestInit), signal: controller.signal });
      if (![429, 502, 503, 504].includes(response.status) || attempt >= 4) return response;
      await response.body?.cancel();
    } catch (error) {
      if (attempt >= 4) throw error;
    } finally { clearTimeout(timeout); }
    await new Promise(resolve => setTimeout(resolve, Math.min(2_000 * 2 ** attempt, 8_000)));
  }
};

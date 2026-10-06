import assert from "node:assert/strict";

const allowedResultKeys = new Set(["slot", "transaction", "meta", "version", "blockTime", "transactionIndex"]);
const emptyMeta: Record<string, unknown> = {
  err: null, status: { Ok: null }, fee: 0, preBalances: [], postBalances: [],
  innerInstructions: [], logMessages: [], preTokenBalances: [], postTokenBalances: [],
  rewards: [], loadedAddresses: { writable: [], readonly: [] }, returnData: null,
  computeUnitsConsumed: 0, costUnits: 0,
};

/** Signature, slot, time and success may remain public. Every sensitive field
 * must be absent or match the runtime's empty placeholder. Unknown fields fail
 * closed so a future response shape cannot silently weaken this proof. */
export function assertPrivateTransactionHidden(envelope: any, signature: string): void {
  assert(envelope && typeof envelope === "object" && !Array.isArray(envelope), "Missing RPC envelope");
  for (const key of Object.keys(envelope)) {
    assert(["jsonrpc", "id", "result", "error"].includes(key), `Unknown RPC envelope field: ${key}`);
  }
  if (envelope.jsonrpc !== undefined) assert.equal(envelope.jsonrpc, "2.0");
  if (envelope.id !== undefined) assert.equal(envelope.id, 1, "Unexpected response ID");
  if (envelope.error) {
    assert(envelope.result == null, "Access denial included transaction data");
    assert(typeof envelope.error === "object" && !Array.isArray(envelope.error), "Malformed access denial");
    for (const key of Object.keys(envelope.error)) assert(["code", "message"].includes(key), `Unchecked error field: ${key}`);
    if (envelope.error.code !== undefined) assert(Number.isSafeInteger(envelope.error.code));
    assert.match(String(envelope.error.message), /^(permission denied|unauthori[sz]ed|forbidden|access denied)$/i,
      "Only a recognized denial without private text counts");
    return;
  }
  assert(Object.prototype.hasOwnProperty.call(envelope, "result"), "Missing RPC result");
  const result = envelope.result;
  if (result === null) return;
  assert(result && typeof result === "object" && !Array.isArray(result), "Unexpected transaction receipt");
  for (const key of Object.keys(result)) assert(allowedResultKeys.has(key), `Unknown receipt field: ${key}`);
  assert(Number.isSafeInteger(result.slot) && result.slot >= 0, "Invalid public slot");
  assert(result.blockTime === null || Number.isSafeInteger(result.blockTime), "Invalid public time");
  if (result.transactionIndex !== undefined) assert(Number.isSafeInteger(result.transactionIndex) && result.transactionIndex >= 0);
  if (result.version !== undefined) assert(result.version === "legacy" || result.version === 0, "Unexpected version");
  if (result.transaction != null) {
    assert.deepEqual(result.transaction, {
      signatures: [signature], message: {
        header: { numRequiredSignatures: 0, numReadonlySignedAccounts: 0, numReadonlyUnsignedAccounts: 0 },
        accountKeys: [], recentBlockhash: "11111111111111111111111111111111", instructions: [],
      },
    }, "Transaction message contains private data");
  }
  if (result.meta != null) {
    assert(typeof result.meta === "object" && !Array.isArray(result.meta), "Unexpected transaction metadata");
    for (const [key, value] of Object.entries(result.meta)) {
      assert(Object.prototype.hasOwnProperty.call(emptyMeta, key), `Unknown metadata field: ${key}`);
      // Solana may represent omitted collection data as null instead of [].
      if (value === null && Array.isArray(emptyMeta[key])) continue;
      assert.deepEqual(value, emptyMeta[key], `Transaction metadata exposes ${key}`);
    }
  }
}

import assert from "node:assert/strict";
import { assertPrivateTransactionHidden } from "./helpers/private-transaction";

const signature = "synthetic-test-signature";
const receipt = () => ({ result: {
  slot: 448402545, blockTime: 1791237901, transactionIndex: 0,
  transaction: { signatures: [signature], message: {
    header: { numRequiredSignatures: 0, numReadonlySignedAccounts: 0, numReadonlyUnsignedAccounts: 0 },
    accountKeys: [], recentBlockhash: "11111111111111111111111111111111", instructions: [],
  } },
  meta: { err: null, status: { Ok: null }, fee: 0, preBalances: [], postBalances: [],
    innerInstructions: [], logMessages: [], preTokenBalances: [], postTokenBalances: [],
    rewards: [], loadedAddresses: { writable: [], readonly: [] }, returnData: null,
    computeUnitsConsumed: 0, costUnits: 0 },
} });

describe("Private transaction evidence", () => {
  it("accepts the hosted redacted receipt while preserving public timing", () => {
    assertPrivateTransactionHidden(receipt(), signature);
  });
  it("accepts null and explicit authorization denial", () => {
    assertPrivateTransactionHidden({ result: null }, signature);
    assertPrivateTransactionHidden({ error: { message: "permission denied" } }, signature);
  });
  it("rejects exposed instructions or account keys", () => {
    for (const key of ["instructions", "accountKeys"]) {
      const value: any = receipt();
      value.result.transaction.message[key] = key === "instructions" ? [{ data: "secret-bid-bytes" }] : ["private-bid-address"];
      assert.throws(() => assertPrivateTransactionHidden(value, signature));
    }
  });
  it("rejects leaked balances, logs, inner instructions and return data", () => {
    for (const [key, data] of Object.entries({ preBalances: [321123], postTokenBalances: [{ amount: "321123" }],
      logMessages: ["bid=321123"], innerInstructions: [{ instructions: [{ data: "secret" }] }],
      returnData: { data: ["secret", "base64"] }, loadedAddresses: { writable: ["private"], readonly: [] } })) {
      const value: any = receipt(); value.result.meta[key] = data;
      assert.throws(() => assertPrivateTransactionHidden(value, signature));
    }
  });
  it("fails closed on unknown fields rather than ignoring new leak surfaces", () => {
    const value: any = receipt(); value.result.secretBid = "321123";
    assert.throws(() => assertPrivateTransactionHidden(value, signature));
    delete value.result.secretBid; value.result.meta.newPrivateField = "321123";
    assert.throws(() => assertPrivateTransactionHidden(value, signature));
  });
  it("rejects private payloads in the outer envelope and error responses", () => {
    for (const value of [{ ...receipt(), privateData: { amount: "321123" } },
      { error: { message: "permission denied", data: { amount: "321123" } } },
      { error: { message: "permission denied: bid=321123" } }]) {
      assert.throws(() => assertPrivateTransactionHidden(value, signature));
    }
  });
  it("does not count malformed responses or unrelated RPC errors as privacy", () => {
    for (const value of [undefined, {}, { result: undefined }, { error: { message: "service unavailable" } },
      { error: { message: "permission denied" }, result: receipt().result }]) {
      assert.throws(() => assertPrivateTransactionHidden(value, signature));
    }
  });
});

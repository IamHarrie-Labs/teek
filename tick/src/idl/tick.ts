/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/tick.json`.
 */
export type Tick = {
  "address": "B6eqSCBhokuZLKqBrzwhquUho183P3Fvu8pgC4a9PFkY",
  "metadata": {
    "name": "tick",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Tick — a sealed, uniform-price batch auction on MagicBlock Ephemeral Rollups"
  },
  "instructions": [
    {
      "name": "activatePrivateLaunchBid",
      "discriminator": [
        246,
        214,
        33,
        54,
        40,
        44,
        36,
        229
      ],
      "accounts": [
        {
          "name": "bidder",
          "signer": true,
          "relations": [
            "bid"
          ]
        },
        {
          "name": "launch",
          "relations": [
            "bid"
          ]
        },
        {
          "name": "bid",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  95,
                  98,
                  105,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              },
              {
                "kind": "account",
                "path": "bidder"
              }
            ]
          }
        },
        {
          "name": "permission",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  109,
                  105,
                  115,
                  115,
                  105,
                  111,
                  110,
                  58
                ]
              },
              {
                "kind": "account",
                "path": "bid"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                136,
                161,
                10,
                196,
                33,
                152,
                1,
                214,
                246,
                106,
                29,
                60,
                6,
                152,
                192,
                102,
                169,
                175,
                212,
                217,
                180,
                252,
                231,
                71,
                151,
                141,
                209,
                5,
                168,
                212,
                103,
                82
              ]
            }
          }
        },
        {
          "name": "ephemeralVault",
          "writable": true,
          "address": "MagicVau1t999999999999999999999999999999999"
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "permissionProgram",
          "address": "ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1"
        }
      ],
      "args": []
    },
    {
      "name": "cancelLaunch",
      "discriminator": [
        120,
        69,
        17,
        7,
        41,
        48,
        40,
        37
      ],
      "accounts": [
        {
          "name": "creator",
          "signer": true,
          "relations": [
            "launch"
          ]
        },
        {
          "name": "launch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              },
              {
                "kind": "account",
                "path": "launch.launchId",
                "account": "launch"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "claimLaunchAllocation",
      "discriminator": [
        189,
        68,
        72,
        99,
        21,
        97,
        7,
        173
      ],
      "accounts": [
        {
          "name": "bidder",
          "signer": true,
          "relations": [
            "bid"
          ]
        },
        {
          "name": "launch",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "launch.creator",
                "account": "launch"
              },
              {
                "kind": "account",
                "path": "launch.launchId",
                "account": "launch"
              }
            ]
          },
          "relations": [
            "settlement",
            "bid"
          ]
        },
        {
          "name": "settlement",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  95,
                  115,
                  101,
                  116,
                  116,
                  108,
                  101,
                  109,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              }
            ]
          }
        },
        {
          "name": "bid",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  95,
                  98,
                  105,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              },
              {
                "kind": "account",
                "path": "bidder"
              }
            ]
          }
        },
        {
          "name": "quoteVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  95,
                  113,
                  117,
                  111,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              }
            ]
          }
        },
        {
          "name": "allocationVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  95,
                  98,
                  97,
                  115,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              }
            ]
          }
        },
        {
          "name": "quoteDestination",
          "writable": true
        },
        {
          "name": "baseDestination",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "clearBatch",
      "docs": [
        "Seals the current batch and requests real randomness from the",
        "MagicBlock VRF oracle for the marginal-allocation tie-break. This",
        "does NOT clear the batch itself — VRF is asynchronous by nature",
        "(an oracle has to actually respond), so the real clearing happens",
        "in `clear_batch_callback` once that randomness arrives. Meant to",
        "be called by MagicBlock's Automation on a fixed cadence — this is",
        "the \"metronome tick.\""
      ],
      "discriminator": [
        194,
        215,
        191,
        209,
        220,
        20,
        81,
        102
      ],
      "accounts": [
        {
          "name": "cranker",
          "docs": [
            "Anyone can crank this once the window has elapsed — in production",
            "this is called by MagicBlock Automation on a fixed cadence, not by",
            "a privileged party, which is part of why speed within a batch can't",
            "be bought: there's no gatekeeper to bribe or race either."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.baseMint",
                "account": "market"
              },
              {
                "kind": "account",
                "path": "market.quoteMint",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "orderBook",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114,
                  95,
                  98,
                  111,
                  111,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "reveal",
          "docs": [
            "Only read here for its address (passed to the VRF callback via",
            "`accounts_metas`) — `clear_batch_callback` is what actually writes",
            "to it, once real randomness has arrived."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  118,
                  101,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "oracleQueue",
          "writable": true
        },
        {
          "name": "programIdentity",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  100,
                  101,
                  110,
                  116,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "vrfProgram",
          "address": "Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz"
        },
        {
          "name": "slotHashes",
          "address": "SysvarS1otHashes111111111111111111111111111"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "clearBatchCallback",
      "docs": [
        "Invoked by the VRF oracle (never called directly by a client) once",
        "real randomness for the request above is ready. Runs the actual",
        "uniform-price auction over every order submitted this window,",
        "writes the clearing price and every fill to `Reveal`, and opens",
        "the next batch."
      ],
      "discriminator": [
        228,
        162,
        115,
        171,
        229,
        28,
        112,
        248
      ],
      "accounts": [
        {
          "name": "vrfProgramIdentity",
          "docs": [
            "Scoped VRF identity PDA, bound to this program. Its presence as a signer proves",
            "the callback was issued by the VRF program for this program."
          ],
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.baseMint",
                "account": "market"
              },
              {
                "kind": "account",
                "path": "market.quoteMint",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "orderBook",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114,
                  95,
                  98,
                  111,
                  111,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "reveal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  118,
                  101,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "randomness",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "closeLaunch",
      "discriminator": [
        27,
        216,
        111,
        223,
        10,
        230,
        19,
        211
      ],
      "accounts": [
        {
          "name": "launch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "launch.creator",
                "account": "launch"
              },
              {
                "kind": "account",
                "path": "launch.launchId",
                "account": "launch"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "commitAndUndelegate",
      "docs": [
        "Commits the market's settled state back to L1 and undelegates",
        "`market`, `order_book`, and `reveal` from the ER — the point where",
        "a batch's results become durable on mainnet rather than only",
        "existing inside the rollup. In production this is a periodic",
        "checkpoint (every N batches) driven by MagicBlock Automation, not",
        "something that has to happen every single batch."
      ],
      "discriminator": [
        9,
        108,
        132,
        87,
        184,
        76,
        98,
        84
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "orderBook",
          "writable": true
        },
        {
          "name": "reveal",
          "writable": true
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "commitLaunchBid",
      "discriminator": [
        79,
        116,
        117,
        25,
        238,
        184,
        15,
        120
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "launch",
          "relations": [
            "bid"
          ]
        },
        {
          "name": "bid",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  95,
                  98,
                  105,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              },
              {
                "kind": "account",
                "path": "bid.bidder",
                "account": "launchBid"
              }
            ]
          }
        },
        {
          "name": "permission",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  109,
                  105,
                  115,
                  115,
                  105,
                  111,
                  110,
                  58
                ]
              },
              {
                "kind": "account",
                "path": "bid"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                136,
                161,
                10,
                196,
                33,
                152,
                1,
                214,
                246,
                106,
                29,
                60,
                6,
                152,
                192,
                102,
                169,
                175,
                212,
                217,
                180,
                252,
                231,
                71,
                151,
                141,
                209,
                5,
                168,
                212,
                103,
                82
              ]
            }
          }
        },
        {
          "name": "ephemeralVault",
          "writable": true,
          "address": "MagicVau1t999999999999999999999999999999999"
        },
        {
          "name": "permissionProgram",
          "address": "ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1"
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "configureLaunchSettlement",
      "discriminator": [
        149,
        212,
        63,
        22,
        42,
        186,
        224,
        147
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true,
          "relations": [
            "launch"
          ]
        },
        {
          "name": "launch",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              },
              {
                "kind": "account",
                "path": "launch.launchId",
                "account": "launch"
              }
            ]
          }
        },
        {
          "name": "settlement",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  95,
                  115,
                  101,
                  116,
                  116,
                  108,
                  101,
                  109,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              }
            ]
          }
        },
        {
          "name": "dbcConfig"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "minTokensAtCap",
          "type": "u64"
        },
        {
          "name": "metadata",
          "type": {
            "defined": {
              "name": "launchMetadata"
            }
          }
        }
      ]
    },
    {
      "name": "delegateAccounts",
      "docs": [
        "Delegates the market's live-trading accounts — `market`,",
        "`order_book`, and `reveal` — into MagicBlock's Ephemeral Rollup so",
        "`submit_order`/`clear_batch` can run at ER speed there instead of",
        "L1 block time, and (once Private ER is selected as the validator)",
        "so the order book is invisible to the sequencer operator while a",
        "batch is open. All three must be delegated together: any account",
        "an ER instruction writes to has to already be owned by the",
        "delegation program, and both `submit_order` and `clear_batch`",
        "write to all three.",
        "",
        "`validator` pins the delegation to a specific ER validator (pass",
        "`None` to let the network assign one). For local testing against",
        "`@magicblock-labs/ephemeral-validator`, pass that validator's own",
        "identity — otherwise delegation defaults to MagicBlock's hosted",
        "validator, which a local ER instance never sees.",
        "",
        "`base_mint`/`quote_mint` are passed in rather than read off",
        "`ctx.accounts.market` because `market` here is an `UncheckedAccount`,",
        "not the typed `Account<Market>` — deliberately: Anchor",
        "auto-reserializes a `mut` typed `Account<T>` back into its buffer",
        "when the instruction returns, but by then `delegate_market` below",
        "has already handed `market`'s ownership to the delegation program,",
        "so that auto-write fails with \"modified data of an account it does",
        "not own.\" `UncheckedAccount` skips that reserialize entirely — the",
        "same reason the SDK's own generated buffer/record/metadata fields",
        "use it. Confirmed by hitting exactly that error against real devnet."
      ],
      "discriminator": [
        105,
        251,
        107,
        209,
        129,
        29,
        162,
        157
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "bufferMarket",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                150,
                7,
                141,
                182,
                107,
                173,
                54,
                171,
                54,
                143,
                248,
                93,
                176,
                109,
                110,
                200,
                44,
                148,
                90,
                246,
                162,
                93,
                169,
                192,
                196,
                77,
                68,
                87,
                52,
                46,
                114,
                165
              ]
            }
          }
        },
        {
          "name": "delegationRecordMarket",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataMarket",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "market",
          "docs": [
            "`quote_mint` by the seeds below. `UncheckedAccount` rather than",
            "`Account<Market>` on purpose — Anchor auto-reserializes a `mut`",
            "typed account when the instruction returns, which fails once",
            "`delegate_market` (below) has already handed this account's",
            "ownership to the delegation program mid-instruction. Confirmed by",
            "hitting exactly that error (\"modified data of an account it does",
            "not own\") against real devnet."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "baseMint"
              },
              {
                "kind": "arg",
                "path": "quoteMint"
              }
            ]
          }
        },
        {
          "name": "bufferOrderBook",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "orderBook"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                150,
                7,
                141,
                182,
                107,
                173,
                54,
                171,
                54,
                143,
                248,
                93,
                176,
                109,
                110,
                200,
                44,
                148,
                90,
                246,
                162,
                93,
                169,
                192,
                196,
                77,
                68,
                87,
                52,
                46,
                114,
                165
              ]
            }
          }
        },
        {
          "name": "delegationRecordOrderBook",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "orderBook"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataOrderBook",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "orderBook"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "orderBook",
          "docs": [
            "three delegate CPIs (market, order_book, reveal) succeed, and the",
            "failure happens only once the instruction itself returns, i.e.",
            "exactly Anchor's auto-exit-write for whichever `mut` typed",
            "accounts remained. Both had to move to `UncheckedAccount`, not",
            "just `market`."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114,
                  95,
                  98,
                  111,
                  111,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "bufferReveal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "reveal"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                150,
                7,
                141,
                182,
                107,
                173,
                54,
                171,
                54,
                143,
                248,
                93,
                176,
                109,
                110,
                200,
                44,
                148,
                90,
                246,
                162,
                93,
                169,
                192,
                196,
                77,
                68,
                87,
                52,
                46,
                114,
                165
              ]
            }
          }
        },
        {
          "name": "delegationRecordReveal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "reveal"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataReveal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "reveal"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "reveal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  118,
                  101,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "ownerProgram",
          "address": "B6eqSCBhokuZLKqBrzwhquUho183P3Fvu8pgC4a9PFkY"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "baseMint",
          "type": "pubkey"
        },
        {
          "name": "quoteMint",
          "type": "pubkey"
        },
        {
          "name": "validator",
          "type": {
            "option": "pubkey"
          }
        }
      ]
    },
    {
      "name": "delegateLaunchBid",
      "discriminator": [
        253,
        157,
        21,
        217,
        6,
        92,
        139,
        122
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "launch"
        },
        {
          "name": "bufferBid",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "bid"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                150,
                7,
                141,
                182,
                107,
                173,
                54,
                171,
                54,
                143,
                248,
                93,
                176,
                109,
                110,
                200,
                44,
                148,
                90,
                246,
                162,
                93,
                169,
                192,
                196,
                77,
                68,
                87,
                52,
                46,
                114,
                165
              ]
            }
          }
        },
        {
          "name": "delegationRecordBid",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "bid"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataBid",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "bid"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "bid",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  95,
                  98,
                  105,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              },
              {
                "kind": "account",
                "path": "payer"
              }
            ]
          }
        },
        {
          "name": "ownerProgram",
          "address": "B6eqSCBhokuZLKqBrzwhquUho183P3Fvu8pgC4a9PFkY"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "delegateTraderAccount",
      "docs": [
        "Delegates one trader's balance sheet after deposits have been made on",
        "the base layer. `submit_order` writes both the shared order book and",
        "this per-trader account, so both must live on the same ER validator."
      ],
      "discriminator": [
        121,
        60,
        40,
        178,
        53,
        10,
        72,
        138
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "bufferTraderAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "traderAccount"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                150,
                7,
                141,
                182,
                107,
                173,
                54,
                171,
                54,
                143,
                248,
                93,
                176,
                109,
                110,
                200,
                44,
                148,
                90,
                246,
                162,
                93,
                169,
                192,
                196,
                77,
                68,
                87,
                52,
                46,
                114,
                165
              ]
            }
          }
        },
        {
          "name": "delegationRecordTraderAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "traderAccount"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataTraderAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "traderAccount"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "traderAccount",
          "docs": [
            "UncheckedAccount avoids Anchor trying to serialize after the",
            "delegation CPI has transferred ownership away from this program."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "arg",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "payer"
              }
            ]
          }
        },
        {
          "name": "ownerProgram",
          "address": "B6eqSCBhokuZLKqBrzwhquUho183P3Fvu8pgC4a9PFkY"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "market",
          "type": "pubkey"
        },
        {
          "name": "validator",
          "type": {
            "option": "pubkey"
          }
        }
      ]
    },
    {
      "name": "depositBase",
      "docs": [
        "Moves `amount` of the base token from the trader's own token",
        "account into the market's custody vault, crediting their",
        "`TraderAccount` balance by the same amount so it becomes",
        "available to back sell orders."
      ],
      "discriminator": [
        213,
        125,
        25,
        122,
        8,
        72,
        100,
        237
      ],
      "accounts": [
        {
          "name": "trader",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.baseMint",
                "account": "market"
              },
              {
                "kind": "account",
                "path": "market.quoteMint",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "baseVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  115,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "traderTokenAccount",
          "writable": true
        },
        {
          "name": "traderAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "trader"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "depositQuote",
      "docs": [
        "Same as `deposit_base`, for the quote token — this is what backs",
        "buy orders."
      ],
      "discriminator": [
        117,
        189,
        114,
        160,
        243,
        50,
        163,
        104
      ],
      "accounts": [
        {
          "name": "trader",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.baseMint",
                "account": "market"
              },
              {
                "kind": "account",
                "path": "market.quoteMint",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "quoteVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  111,
                  116,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "traderTokenAccount",
          "writable": true
        },
        {
          "name": "traderAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "trader"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "editLaunchBid",
      "discriminator": [
        105,
        251,
        172,
        217,
        69,
        144,
        9,
        255
      ],
      "accounts": [
        {
          "name": "bidder",
          "signer": true,
          "relations": [
            "bid"
          ]
        },
        {
          "name": "launch",
          "relations": [
            "bid"
          ]
        },
        {
          "name": "bid",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  95,
                  98,
                  105,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              },
              {
                "kind": "account",
                "path": "bidder"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "expireLaunch",
      "discriminator": [
        98,
        30,
        30,
        129,
        233,
        249,
        51,
        187
      ],
      "accounts": [
        {
          "name": "launch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "launch.creator",
                "account": "launch"
              },
              {
                "kind": "account",
                "path": "launch.launchId",
                "account": "launch"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "fundLaunchBid",
      "discriminator": [
        107,
        193,
        133,
        56,
        106,
        73,
        213,
        44
      ],
      "accounts": [
        {
          "name": "bidder",
          "signer": true,
          "relations": [
            "bid"
          ]
        },
        {
          "name": "launch",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "launch.creator",
                "account": "launch"
              },
              {
                "kind": "account",
                "path": "launch.launchId",
                "account": "launch"
              }
            ]
          },
          "relations": [
            "bid"
          ]
        },
        {
          "name": "settlement",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  95,
                  115,
                  101,
                  116,
                  116,
                  108,
                  101,
                  109,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              }
            ]
          }
        },
        {
          "name": "bid",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  95,
                  98,
                  105,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              },
              {
                "kind": "account",
                "path": "bidder"
              }
            ]
          }
        },
        {
          "name": "source",
          "writable": true
        },
        {
          "name": "quoteVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  95,
                  113,
                  117,
                  111,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initTraderAccount",
      "docs": [
        "Opens a trader's balance sheet for a market — one PDA per",
        "(market, owner), holding the base/quote balances `submit_order`",
        "locks against and `clear_batch_callback` settles into. Required",
        "once, before a trader's first deposit or order."
      ],
      "discriminator": [
        178,
        127,
        32,
        137,
        75,
        144,
        78,
        113
      ],
      "accounts": [
        {
          "name": "trader",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.baseMint",
                "account": "market"
              },
              {
                "kind": "account",
                "path": "market.quoteMint",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "traderAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "trader"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initializeLaunch",
      "discriminator": [
        90,
        201,
        220,
        142,
        112,
        253,
        100,
        13
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "launch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              },
              {
                "kind": "arg",
                "path": "launchId"
              }
            ]
          }
        },
        {
          "name": "quoteVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  95,
                  113,
                  117,
                  111,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "launchId",
          "type": "u64"
        },
        {
          "name": "terms",
          "type": {
            "defined": {
              "name": "launchTerms"
            }
          }
        }
      ]
    },
    {
      "name": "initializeMarket",
      "discriminator": [
        35,
        35,
        189,
        193,
        155,
        48,
        170,
        203
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "baseMint"
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "baseMint"
              },
              {
                "kind": "account",
                "path": "quoteMint"
              }
            ]
          }
        },
        {
          "name": "baseVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  115,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "quoteVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  111,
                  116,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "orderBook",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114,
                  95,
                  98,
                  111,
                  111,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "reveal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  118,
                  101,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "batchPeriodSlots",
          "type": "u64"
        }
      ]
    },
    {
      "name": "launchRandomnessCallback",
      "discriminator": [
        206,
        238,
        93,
        222,
        150,
        194,
        0,
        51
      ],
      "accounts": [
        {
          "name": "vrfProgramIdentity",
          "docs": [
            "Scoped VRF identity PDA, bound to this program. Its presence as a signer proves",
            "the callback was issued by the VRF program for this program."
          ],
          "signer": true
        },
        {
          "name": "launch",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "launch.creator",
                "account": "launch"
              },
              {
                "kind": "account",
                "path": "launch.launchId",
                "account": "launch"
              }
            ]
          },
          "relations": [
            "settlement"
          ]
        },
        {
          "name": "settlement",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  95,
                  115,
                  101,
                  116,
                  116,
                  108,
                  101,
                  109,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "randomness",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "commitment",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "processUndelegation",
      "discriminator": [
        196,
        28,
        41,
        206,
        48,
        37,
        51,
        167
      ],
      "accounts": [
        {
          "name": "baseAccount",
          "writable": true
        },
        {
          "name": "buffer",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  110,
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  101,
                  45,
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "baseAccount"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                181,
                183,
                0,
                225,
                242,
                87,
                58,
                192,
                204,
                6,
                34,
                1,
                52,
                74,
                207,
                151,
                184,
                53,
                6,
                235,
                140,
                229,
                25,
                152,
                204,
                98,
                126,
                24,
                147,
                128,
                167,
                62
              ]
            }
          }
        },
        {
          "name": "payer",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "accountSeeds",
          "type": {
            "vec": "bytes"
          }
        }
      ]
    },
    {
      "name": "registerLaunchBid",
      "discriminator": [
        239,
        187,
        175,
        116,
        151,
        104,
        71,
        53
      ],
      "accounts": [
        {
          "name": "bidder",
          "writable": true,
          "signer": true
        },
        {
          "name": "launch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "launch.creator",
                "account": "launch"
              },
              {
                "kind": "account",
                "path": "launch.launchId",
                "account": "launch"
              }
            ]
          }
        },
        {
          "name": "settlement",
          "docs": [
            "legacy intake accounts remain withdrawable and usable in escrow tests."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  95,
                  115,
                  101,
                  116,
                  116,
                  108,
                  101,
                  109,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              }
            ]
          }
        },
        {
          "name": "bid",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  95,
                  98,
                  105,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              },
              {
                "kind": "account",
                "path": "bidder"
              }
            ]
          }
        },
        {
          "name": "source",
          "writable": true
        },
        {
          "name": "quoteVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  95,
                  113,
                  117,
                  111,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "requestLaunchRandomness",
      "discriminator": [
        103,
        41,
        101,
        57,
        255,
        64,
        86,
        177
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "launch",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "launch.creator",
                "account": "launch"
              },
              {
                "kind": "account",
                "path": "launch.launchId",
                "account": "launch"
              }
            ]
          },
          "relations": [
            "settlement"
          ]
        },
        {
          "name": "settlement",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  95,
                  115,
                  101,
                  116,
                  116,
                  108,
                  101,
                  109,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              }
            ]
          }
        },
        {
          "name": "oracleQueue",
          "writable": true,
          "address": "Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh"
        },
        {
          "name": "programIdentity",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  100,
                  101,
                  110,
                  116,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "vrfProgram",
          "address": "Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz"
        },
        {
          "name": "slotHashes",
          "address": "SysvarS1otHashes111111111111111111111111111"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "settleLaunch",
      "discriminator": [
        200,
        143,
        23,
        151,
        91,
        142,
        43,
        125
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "launch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "launch.creator",
                "account": "launch"
              },
              {
                "kind": "account",
                "path": "launch.launchId",
                "account": "launch"
              }
            ]
          },
          "relations": [
            "settlement"
          ]
        },
        {
          "name": "settlement",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  95,
                  115,
                  101,
                  116,
                  116,
                  108,
                  101,
                  109,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              }
            ]
          }
        },
        {
          "name": "quoteVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  95,
                  113,
                  117,
                  111,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              }
            ]
          }
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "baseMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              }
            ]
          }
        },
        {
          "name": "allocationVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  95,
                  98,
                  97,
                  115,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              }
            ]
          }
        },
        {
          "name": "dbcConfig"
        },
        {
          "name": "pool",
          "writable": true
        },
        {
          "name": "dbcBaseVault",
          "writable": true
        },
        {
          "name": "dbcQuoteVault",
          "writable": true
        },
        {
          "name": "poolAuthority",
          "address": "FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM"
        },
        {
          "name": "dbcEventAuthority",
          "address": "8Ks12pbrD6PXxfty1hVQiE9sc289zgU1zHkvXhrSdriF"
        },
        {
          "name": "mintMetadata",
          "writable": true
        },
        {
          "name": "metadataProgram",
          "address": "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
        },
        {
          "name": "creator"
        },
        {
          "name": "dbcProgram",
          "address": "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "submitOrder",
      "docs": [
        "Runs inside the ER. Appends a sealed order to the current batch.",
        "Nothing about this order — side, price, size, or trader — is",
        "visible to anyone until `clear_batch` reveals the batch's single",
        "uniform price. That is the whole mechanism: arriving first, or",
        "knowing more than the next trader, buys you nothing here."
      ],
      "discriminator": [
        230,
        150,
        200,
        53,
        92,
        208,
        109,
        108
      ],
      "accounts": [
        {
          "name": "trader",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.baseMint",
                "account": "market"
              },
              {
                "kind": "account",
                "path": "market.quoteMint",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "orderBook",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114,
                  95,
                  98,
                  111,
                  111,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "traderAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "trader"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "side",
          "type": {
            "defined": {
              "name": "side"
            }
          }
        },
        {
          "name": "price",
          "type": "u64"
        },
        {
          "name": "qty",
          "type": "u64"
        }
      ]
    },
    {
      "name": "withdrawBase",
      "docs": [
        "Withdraws `amount` of the base token back to the trader — only",
        "ever from the *unlocked* balance, so funds backing an open order",
        "can't be pulled out from under it."
      ],
      "discriminator": [
        161,
        122,
        255,
        170,
        42,
        39,
        23,
        120
      ],
      "accounts": [
        {
          "name": "trader",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.baseMint",
                "account": "market"
              },
              {
                "kind": "account",
                "path": "market.quoteMint",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "baseVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  115,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "traderTokenAccount",
          "writable": true
        },
        {
          "name": "traderAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "trader"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "withdrawLaunchFunding",
      "discriminator": [
        189,
        10,
        169,
        243,
        190,
        204,
        233,
        141
      ],
      "accounts": [
        {
          "name": "bidder",
          "signer": true,
          "relations": [
            "bid"
          ]
        },
        {
          "name": "launch",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "launch.creator",
                "account": "launch"
              },
              {
                "kind": "account",
                "path": "launch.launchId",
                "account": "launch"
              }
            ]
          },
          "relations": [
            "bid"
          ]
        },
        {
          "name": "bid",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  95,
                  98,
                  105,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              },
              {
                "kind": "account",
                "path": "bidder"
              }
            ]
          }
        },
        {
          "name": "destination",
          "writable": true
        },
        {
          "name": "quoteVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  95,
                  113,
                  117,
                  111,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "withdrawQuote",
      "docs": [
        "Same as `withdraw_base`, for the quote token."
      ],
      "discriminator": [
        209,
        209,
        177,
        248,
        7,
        105,
        157,
        66
      ],
      "accounts": [
        {
          "name": "trader",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.baseMint",
                "account": "market"
              },
              {
                "kind": "account",
                "path": "market.quoteMint",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "quoteVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  111,
                  116,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "traderTokenAccount",
          "writable": true
        },
        {
          "name": "traderAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "trader"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "launch",
      "discriminator": [
        144,
        51,
        51,
        163,
        206,
        85,
        213,
        38
      ]
    },
    {
      "name": "launchBid",
      "discriminator": [
        38,
        161,
        34,
        228,
        45,
        14,
        60,
        180
      ]
    },
    {
      "name": "market",
      "discriminator": [
        219,
        190,
        213,
        55,
        0,
        227,
        198,
        154
      ]
    },
    {
      "name": "orderBook",
      "discriminator": [
        55,
        230,
        125,
        218,
        149,
        39,
        65,
        248
      ]
    },
    {
      "name": "reveal",
      "discriminator": [
        251,
        170,
        147,
        35,
        234,
        108,
        14,
        149
      ]
    },
    {
      "name": "settlementState",
      "discriminator": [
        32,
        107,
        224,
        72,
        68,
        162,
        247,
        192
      ]
    },
    {
      "name": "traderAccount",
      "discriminator": [
        111,
        222,
        42,
        107,
        177,
        76,
        38,
        149
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "orderBookFull",
      "msg": "The order book for this batch is full"
    },
    {
      "code": 6001,
      "name": "invalidOrderParams",
      "msg": "Order price or quantity must be greater than zero"
    },
    {
      "code": 6002,
      "name": "batchSealed",
      "msg": "The current batch's submission window has already closed"
    },
    {
      "code": 6003,
      "name": "batchStillOpen",
      "msg": "The current batch's submission window is still open — too early to clear"
    },
    {
      "code": 6004,
      "name": "insufficientBalance",
      "msg": "Insufficient balance to cover this order"
    },
    {
      "code": 6005,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6006,
      "name": "fundingClosed",
      "msg": "Launch funding is closed"
    },
    {
      "code": 6007,
      "name": "biddingClosed",
      "msg": "Launch bidding is not open"
    },
    {
      "code": 6008,
      "name": "biddingStillOpen",
      "msg": "Launch bidding is still open"
    },
    {
      "code": 6009,
      "name": "invalidWindow",
      "msg": "Invalid launch time window"
    },
    {
      "code": 6010,
      "name": "invalidTerms",
      "msg": "Invalid launch terms"
    },
    {
      "code": 6011,
      "name": "invalidAmount",
      "msg": "Amount is outside the launch limits"
    },
    {
      "code": 6012,
      "name": "tooManyBidders",
      "msg": "Launch bidder capacity reached"
    },
    {
      "code": 6013,
      "name": "invalidBid",
      "msg": "Bid account does not belong to this launch or bidder"
    },
    {
      "code": 6014,
      "name": "insufficientFunding",
      "msg": "Bid exceeds deposited funding"
    },
    {
      "code": 6015,
      "name": "privacyNotReady",
      "msg": "Private bid permissions have not been activated"
    },
    {
      "code": 6016,
      "name": "incompleteBids",
      "msg": "Every registered bid must be supplied exactly once"
    },
    {
      "code": 6017,
      "name": "bidStillDelegated",
      "msg": "Bid has not returned from the private ER"
    },
    {
      "code": 6018,
      "name": "alreadyClosed",
      "msg": "Launch has already closed"
    },
    {
      "code": 6019,
      "name": "settlementExpired",
      "msg": "Settlement deadline has passed"
    },
    {
      "code": 6020,
      "name": "settlementNotExpired",
      "msg": "Settlement deadline has not passed"
    },
    {
      "code": 6021,
      "name": "invalidDbcConfig",
      "msg": "DBC configuration is unsupported or changed"
    },
    {
      "code": 6022,
      "name": "settlementNotReady",
      "msg": "Launch settlement is not configured or not ready"
    },
    {
      "code": 6023,
      "name": "randomnessAlreadyRequested",
      "msg": "Randomness has already been requested or delivered"
    },
    {
      "code": 6024,
      "name": "launchSlippage",
      "msg": "Settlement output is below the immutable launch minimum"
    },
    {
      "code": 6025,
      "name": "invalidLaunchAssets",
      "msg": "Launch assets or custody accounts do not match the accepted terms"
    },
    {
      "code": 6026,
      "name": "allocationInvariant",
      "msg": "Allocation or claim conservation check failed"
    },
    {
      "code": 6027,
      "name": "alreadyClaimed",
      "msg": "This allocation has already been claimed"
    },
    {
      "code": 6028,
      "name": "poolAlreadyExists",
      "msg": "Fresh pool creation is required for the opening purchase"
    },
    {
      "code": 6029,
      "name": "randomnessExhausted",
      "msg": "Random sampling exhausted its bounded rejection attempts"
    }
  ],
  "types": [
    {
      "name": "launch",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "launchId",
            "type": "u64"
          },
          {
            "name": "quoteMint",
            "type": "pubkey"
          },
          {
            "name": "terms",
            "type": {
              "defined": {
                "name": "launchTerms"
              }
            }
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "launchStatus"
              }
            }
          },
          {
            "name": "bidCount",
            "type": "u16"
          },
          {
            "name": "bids",
            "docs": [
              "Public registration addresses, never bid amounts or an open tally."
            ],
            "type": {
              "array": [
                "pubkey",
                24
              ]
            }
          },
          {
            "name": "totalBid",
            "type": "u64"
          },
          {
            "name": "acceptedTotal",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "quoteVaultBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "launchBid",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "launch",
            "type": "pubkey"
          },
          {
            "name": "bidder",
            "type": "pubkey"
          },
          {
            "name": "funded",
            "docs": [
              "Publicly funded balance; only `amount` becomes confidential on the ER."
            ],
            "type": "u64"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "privacyReady",
            "type": "bool"
          },
          {
            "name": "closed",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "launchMetadata",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "symbol",
            "type": "string"
          },
          {
            "name": "uri",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "launchStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "funding"
          },
          {
            "name": "ready"
          },
          {
            "name": "refunds"
          },
          {
            "name": "settled"
          }
        ]
      }
    },
    {
      "name": "launchTerms",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "baseMint",
            "type": "pubkey"
          },
          {
            "name": "dbcConfig",
            "type": "pubkey"
          },
          {
            "name": "biddingOpensAt",
            "type": "i64"
          },
          {
            "name": "biddingClosesAt",
            "type": "i64"
          },
          {
            "name": "settlementDeadline",
            "type": "i64"
          },
          {
            "name": "minRaise",
            "type": "u64"
          },
          {
            "name": "maxRaise",
            "type": "u64"
          },
          {
            "name": "minBid",
            "type": "u64"
          },
          {
            "name": "manifestHash",
            "docs": [
              "Hash of the creator's published metadata/config manifest. The DBC",
              "settlement instruction must independently validate the actual config."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "market",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "baseMint",
            "docs": [
              "The base and quote mints this market trades."
            ],
            "type": "pubkey"
          },
          {
            "name": "quoteMint",
            "type": "pubkey"
          },
          {
            "name": "batchPeriodSlots",
            "docs": [
              "How many sub-ticks (roughly, how many ER slots) a batch stays open",
              "before it seals and clears. Tuned for legibility during the demo;",
              "production would push this toward the ER's real floor."
            ],
            "type": "u64"
          },
          {
            "name": "batchOpenSlot",
            "docs": [
              "The slot the *current* batch's submission window opened at."
            ],
            "type": "u64"
          },
          {
            "name": "currentBatchId",
            "type": "u64"
          },
          {
            "name": "bump",
            "docs": [
              "Bump seeds for the market's PDA and its two custody vaults."
            ],
            "type": "u8"
          },
          {
            "name": "baseVaultBump",
            "type": "u8"
          },
          {
            "name": "quoteVaultBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "onchainFill",
      "docs": [
        "A single settled fill as stored on-chain — same plain-old-data",
        "constraint as `OnchainOrder`, for the same reason."
      ],
      "serialization": "bytemuck",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "qty",
            "type": "u64"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "side",
            "type": "u8"
          },
          {
            "name": "padding",
            "type": {
              "array": [
                "u8",
                7
              ]
            }
          }
        ]
      }
    },
    {
      "name": "onchainOrder",
      "docs": [
        "A single sealed order as stored on-chain. Deliberately a plain,",
        "fixed-layout (`bytemuck::Pod`-compatible) struct — `side` is a raw `u8`",
        "(0 = buy, 1 = sell) rather than the ergonomic `clearing::Side` enum,",
        "because zero-copy accounts require every field to be plain old data.",
        "Converted to/from `clearing::Order` right at the boundary where",
        "`clear_batch` runs the actual auction — see `lib.rs`."
      ],
      "serialization": "bytemuck",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "qty",
            "type": "u64"
          },
          {
            "name": "side",
            "type": "u8"
          },
          {
            "name": "padding",
            "type": {
              "array": [
                "u8",
                7
              ]
            }
          }
        ]
      }
    },
    {
      "name": "orderBook",
      "docs": [
        "The sealed order book for the market's current batch. While this",
        "account is delegated into a Private ER, its contents are invisible to",
        "everyone — including the sequencer operator — until the batch seals and",
        "`clear_batch` runs. That invisibility is what a continuous book cannot",
        "give you: on a normal book, resting orders are public the instant",
        "they're submitted.",
        "",
        "This is `zero_copy` (accessed via `AccountLoader`, not `Account`) on",
        "purpose: at `MAX_ORDERS_PER_BATCH` = 128, the plain struct is well over",
        "8KB, and Anchor's normal `Account<T>` deserializes the *entire struct",
        "onto the stack* — SBF caps a single function's stack frame at 4096",
        "bytes, so that blew up immediately (`cargo build-sbf` reported 30KB+",
        "frames on `initialize_market`/`clear_batch`). Zero-copy accounts hold a",
        "reference straight into the account's own byte buffer instead of ever",
        "materializing the whole struct as a stack value — the standard fix for",
        "any account this shape (an order book is exactly the case zero-copy",
        "exists for)."
      ],
      "serialization": "bytemuck",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "batchId",
            "type": "u64"
          },
          {
            "name": "orderCount",
            "type": "u16"
          },
          {
            "name": "awaitingVrf",
            "docs": [
              "Set while a `clear_batch` VRF request is in flight, so",
              "`submit_order` can reject new orders until the callback actually",
              "clears the batch — otherwise an order could sneak in between the",
              "randomness request and its fulfillment, defeating the seal."
            ],
            "type": "u8"
          },
          {
            "name": "padding",
            "type": {
              "array": [
                "u8",
                5
              ]
            }
          },
          {
            "name": "orders",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "onchainOrder"
                  }
                },
                128
              ]
            }
          }
        ]
      }
    },
    {
      "name": "reveal",
      "docs": [
        "The public result of the most recently cleared batch — this is the only",
        "thing anyone ever sees about a batch's orders: one price, and the fills",
        "against it. Nothing about who bid what, or when, is ever exposed.",
        "Zero-copy for the same reason as `OrderBook`."
      ],
      "serialization": "bytemuck",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "batchId",
            "type": "u64"
          },
          {
            "name": "clearingPrice",
            "type": "u64"
          },
          {
            "name": "matchedQty",
            "type": "u64"
          },
          {
            "name": "fillCount",
            "type": "u16"
          },
          {
            "name": "hadTrade",
            "type": "u8"
          },
          {
            "name": "padding",
            "type": {
              "array": [
                "u8",
                5
              ]
            }
          },
          {
            "name": "fills",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "onchainFill"
                  }
                },
                128
              ]
            }
          }
        ]
      }
    },
    {
      "name": "settlementState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "launch",
            "type": "pubkey"
          },
          {
            "name": "configHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "commitment",
            "docs": [
              "SHA256 binds the ordered closed bids, funding, terms, config and venue."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "randomness",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "minTokensAtCap",
            "type": "u64"
          },
          {
            "name": "baseReceived",
            "type": "u64"
          },
          {
            "name": "quoteSpent",
            "type": "u64"
          },
          {
            "name": "accepted",
            "type": {
              "array": [
                "u64",
                24
              ]
            }
          },
          {
            "name": "tokens",
            "type": {
              "array": [
                "u64",
                24
              ]
            }
          },
          {
            "name": "refunds",
            "type": {
              "array": [
                "u64",
                24
              ]
            }
          },
          {
            "name": "claimed",
            "type": "u32"
          },
          {
            "name": "phase",
            "docs": [
              "0=configured, 1=requested, 2=randomness ready, 3=settled."
            ],
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "metadata",
            "type": {
              "defined": {
                "name": "launchMetadata"
              }
            }
          }
        ]
      }
    },
    {
      "name": "side",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "buy"
          },
          {
            "name": "sell"
          }
        ]
      }
    },
    {
      "name": "traderAccount",
      "docs": [
        "Per-trader balances held in custody by the market — deposited on L1,",
        "spent/earned inside the ER as batches clear, withdrawable on L1 after",
        "commit + undelegate. Keeping this as its own small PDA (rather than",
        "real token transfers per fill) is what makes clearing hundreds of",
        "sealed orders per batch cheap: settlement is a balance write, not a",
        "token transfer, until the trader actually withdraws. Small and",
        "fixed-shape enough that a regular (non-zero-copy) account is fine."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "baseBalance",
            "type": "u64"
          },
          {
            "name": "quoteBalance",
            "type": "u64"
          },
          {
            "name": "baseLocked",
            "type": "u64"
          },
          {
            "name": "quoteLocked",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ]
};

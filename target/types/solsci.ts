/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/solsci.json`.
 */
export type Solsci = {
  "address": "8cmvWB8SrFvS5fKjsCw4bme9iFVeFCFsbTPKdq9NykbH",
  "metadata": {
    "name": "solsci",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "SolSci — on-chain scientific discovery verification protocol"
  },
  "instructions": [
    {
      "name": "closeDiscovery",
      "discriminator": [68, 228, 43, 231, 210, 107, 157, 241],
      "accounts": [
        { "name": "owner",           "writable": true, "signer": true },
        { "name": "researcher" },
        { "name": "discoveryRecord", "writable": true,
          "pda": { "seeds": [
            { "kind": "const",   "value": [100, 105, 115, 99, 111, 118, 101, 114, 121] },
            { "kind": "account", "path": "researcher" },
            { "kind": "arg",     "path": "fileHash" }
          ]}
        }
      ],
      "args": [{ "name": "fileHash", "type": { "array": ["u8", 32] } }]
    },
    {
      "name": "endorseDiscovery",
      "discriminator": [37, 131, 113, 190, 247, 115, 235, 95],
      "accounts": [
        { "name": "endorser",         "writable": true, "signer": true },
        { "name": "researcher" },
        { "name": "discoveryRecord",  "writable": true,
          "pda": { "seeds": [
            { "kind": "const",   "value": [100, 105, 115, 99, 111, 118, 101, 114, 121] },
            { "kind": "account", "path": "researcher" },
            { "kind": "arg",     "path": "fileHash" }
          ]}
        },
        { "name": "endorsementRecord", "writable": true,
          "pda": { "seeds": [
            { "kind": "const",   "value": [101, 110, 100, 111, 114, 115, 101, 109, 101, 110, 116] },
            { "kind": "account", "path": "endorser" },
            { "kind": "account", "path": "discoveryRecord" }
          ]}
        },
        { "name": "systemProgram", "address": "11111111111111111111111111111111" }
      ],
      "args": [{ "name": "fileHash", "type": { "array": ["u8", 32] } }]
    },
    {
      "name": "registerDiscovery",
      "discriminator": [63, 188, 175, 73, 49, 157, 163, 63],
      "accounts": [
        { "name": "researcher",      "writable": true, "signer": true },
        { "name": "discoveryRecord", "writable": true,
          "pda": { "seeds": [
            { "kind": "const",   "value": [100, 105, 115, 99, 111, 118, 101, 114, 121] },
            { "kind": "account", "path": "researcher" },
            { "kind": "arg",     "path": "fileHash" }
          ]}
        },
        { "name": "systemProgram", "address": "11111111111111111111111111111111" }
      ],
      "args": [
        { "name": "fileHash",  "type": { "array": ["u8", 32] } },
        { "name": "metadata",  "type": "string" }
      ]
    },
    {
      "name": "transferDiscovery",
      "discriminator": [67, 115, 169, 238, 78, 78, 248, 31],
      "accounts": [
        { "name": "owner",           "writable": true, "signer": true },
        { "name": "newOwner" },
        { "name": "researcher" },
        { "name": "discoveryRecord", "writable": true,
          "pda": { "seeds": [
            { "kind": "const",   "value": [100, 105, 115, 99, 111, 118, 101, 114, 121] },
            { "kind": "account", "path": "researcher" },
            { "kind": "arg",     "path": "fileHash" }
          ]}
        }
      ],
      "args": [{ "name": "fileHash", "type": { "array": ["u8", 32] } }]
    },
    {
      "name": "verifyDiscovery",
      "discriminator": [165, 40, 125, 103, 133, 125, 85, 103],
      "accounts": [
        { "name": "researcher" },
        { "name": "discoveryRecord",
          "pda": { "seeds": [
            { "kind": "const",   "value": [100, 105, 115, 99, 111, 118, 101, 114, 121] },
            { "kind": "account", "path": "researcher" },
            { "kind": "arg",     "path": "fileHash" }
          ]}
        }
      ],
      "args": [{ "name": "fileHash", "type": { "array": ["u8", 32] } }]
    }
  ],
  "accounts": [
    {
      "name": "discoveryRecord",
      "discriminator": [245, 152, 169, 214, 121, 7, 209, 179]
    },
    {
      "name": "endorsementRecord",
      "discriminator": [185, 29, 215, 246, 202, 74, 79, 11]
    }
  ],
  "events": [
    { "name": "discoveryEndorsed",    "discriminator": [164, 0, 236, 117, 218, 14, 166, 27] },
    { "name": "discoveryRegistered",  "discriminator": [248, 127, 46, 26, 185, 205, 47, 204] },
    { "name": "discoveryTransferred", "discriminator": [36, 38, 69, 76, 212, 237, 116, 157] },
    { "name": "discoveryVerified",    "discriminator": [237, 74, 97, 219, 137, 190, 228, 185] }
  ],
  "errors": [
    { "code": 6000, "name": "metadataTooLong",    "msg": "Metadata string exceeds the 512-byte limit" },
    { "code": 6001, "name": "metadataEmpty",      "msg": "Metadata must not be empty" },
    { "code": 6002, "name": "notOwner",           "msg": "Only the current owner can perform this action" },
    { "code": 6003, "name": "cannotEndorseOwn",   "msg": "You cannot endorse your own discovery" }
  ],
  "types": [
    {
      "name": "discoveryRecord",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "researcher",        "type": "pubkey" },
          { "name": "owner",             "type": "pubkey" },
          { "name": "fileHash",          "type": { "array": ["u8", 32] } },
          { "name": "timestamp",         "type": "i64" },
          { "name": "metadata",          "type": "string" },
          { "name": "bump",              "type": "u8" },
          { "name": "endorsementCount",  "type": "u32" }
        ]
      }
    },
    {
      "name": "endorsementRecord",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "endorser",         "type": "pubkey" },
          { "name": "discoveryRecord",  "type": "pubkey" },
          { "name": "timestamp",        "type": "i64" },
          { "name": "bump",             "type": "u8" }
        ]
      }
    },
    {
      "name": "discoveryEndorsed",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "certificateId", "type": "pubkey" },
          { "name": "endorser",      "type": "pubkey" },
          { "name": "researcher",    "type": "pubkey" },
          { "name": "timestamp",     "type": "i64" }
        ]
      }
    },
    {
      "name": "discoveryRegistered",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "researcher",     "type": "pubkey" },
          { "name": "owner",          "type": "pubkey" },
          { "name": "fileHash",       "type": { "array": ["u8", 32] } },
          { "name": "timestamp",      "type": "i64" },
          { "name": "metadata",       "type": "string" },
          { "name": "certificateId",  "type": "pubkey" }
        ]
      }
    },
    {
      "name": "discoveryTransferred",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "certificateId", "type": "pubkey" },
          { "name": "from",          "type": "pubkey" },
          { "name": "to",            "type": "pubkey" },
          { "name": "researcher",    "type": "pubkey" }
        ]
      }
    },
    {
      "name": "discoveryVerified",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "researcher",    "type": "pubkey" },
          { "name": "owner",         "type": "pubkey" },
          { "name": "fileHash",      "type": { "array": ["u8", 32] } },
          { "name": "timestamp",     "type": "i64" },
          { "name": "metadata",      "type": "string" },
          { "name": "certificateId", "type": "pubkey" }
        ]
      }
    }
  ]
};

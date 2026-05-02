# SOLSCI-PROTOCOL

**Version:** 0.1.0  
**Status:** Draft  
**Chain:** Solana (Devnet → Mainnet)

---

## Overview

SolSci is an open protocol for anchoring scientific discoveries to an immutable, trustless ledger.  
Any research tool can integrate SolSci to give its outputs a tamper-proof, on-chain proof of discovery.

The core primitive is a **DiscoveryRecord**: a Program Derived Address (PDA) account on Solana that stores:

| Field | Type | Description |
|---|---|---|
| `researcher` | `Pubkey` | Solana wallet of the registering researcher |
| `file_hash` | `[u8; 32]` | SHA-256 of the processed research output |
| `timestamp` | `i64` | Unix timestamp of the registering block |
| `metadata` | `String` | JSON blob with tool-specific metadata (≤ 512 bytes) |
| `bump` | `u8` | PDA bump seed |

---

## PDA Derivation

```
seeds = ["discovery", researcher_pubkey, file_hash]
program = <SOLSCI_PROGRAM_ID>
```

The combination of `(researcher, file_hash)` is unique on-chain.  
The same researcher **cannot** overwrite a registration — re-submitting the same hash will fail with `AccountAlreadyInitialized`.

---

## Instructions

### `register_discovery`

Register a new discovery on-chain.

**Accounts:**

| Account | Role |
|---|---|
| `researcher` | Signer, payer |
| `discovery_record` | PDA, writable, init |
| `system_program` | Required for account creation |

**Parameters:**

| Parameter | Type | Constraints |
|---|---|---|
| `file_hash` | `[u8; 32]` | SHA-256 of the processed output |
| `metadata` | `String` | Valid UTF-8 JSON, ≤ 512 bytes, non-empty |

**Emits:** `DiscoveryRegistered` event

---

### `verify_discovery`

Read-only verification of an existing record. Emits a `DiscoveryVerified` event for indexers and CPI callers.

**Accounts:**

| Account | Role |
|---|---|
| `researcher` | Read-only, used for PDA derivation |
| `discovery_record` | PDA, read-only |

**Parameters:**

| Parameter | Type |
|---|---|
| `file_hash` | `[u8; 32]` |

**Emits:** `DiscoveryVerified` event

---

## Events

### `DiscoveryRegistered`

```rust
pub struct DiscoveryRegistered {
    pub researcher: Pubkey,   // indexed
    pub file_hash: [u8; 32],
    pub timestamp: i64,
    pub metadata: String,
    pub certificate_id: Pubkey,
}
```

### `DiscoveryVerified`

```rust
pub struct DiscoveryVerified {
    pub researcher: Pubkey,   // indexed
    pub file_hash: [u8; 32],
    pub timestamp: i64,
    pub metadata: String,
    pub certificate_id: Pubkey,
}
```

---

## Metadata JSON Schema

Integrating tools **MUST** include at minimum:

```json
{
  "tool": "string",
  "version": "string",
  "analysis_type": "string",
  "file_size_bytes": 0
}
```

Optional fields (recommended):

```json
{
  "reference_genome": "string",
  "file_name": "string",
  "institution": "string",
  "orcid": "string"
}
```

Total serialised length **must not exceed 512 bytes**.

---

## Certificate ID

The `certificate_id` is the base58-encoded PDA address.  
It can be independently verified by any party by re-deriving the PDA from `(researcher, file_hash)` and confirming the account exists on-chain.

---

## Integration Guide

### Step 1 — Hash your output

```bash
sha256sum my_analysis_output.fastq
# or in Rust:
let hash = Sha256::digest(&file_bytes);
```

### Step 2 — Build metadata

```json
{
  "tool": "BioFastq-A",
  "version": "1.0.0",
  "analysis_type": "whole_genome_sequencing",
  "file_size_bytes": 1048576
}
```

### Step 3 — Call `register_discovery`

Using the Anchor client (Rust):

```rust
program
    .request()
    .accounts(solsci::accounts::RegisterDiscovery {
        researcher: payer.pubkey(),
        discovery_record: pda,
        system_program: system_program::ID,
    })
    .args(solsci::instruction::RegisterDiscovery {
        file_hash: hash_bytes,
        metadata: metadata_json,
    })
    .signer(&payer)
    .send()?;
```

### Step 4 — Store the certificate

The returned `certificate_id` (PDA) is your permanent, publicly verifiable proof of discovery.  
Link it in your publication, dataset, or lab notebook.

---

## Error Codes

| Code | Name | Description |
|---|---|---|
| 6000 | `MetadataTooLong` | Metadata JSON exceeds 512 bytes |
| 6001 | `MetadataEmpty` | Metadata must not be empty |

---

## Versioning

This document is versioned alongside the on-chain program.  
Breaking changes to account layout or instruction signatures will increment the minor version.  
The program ID is the canonical version identifier on-chain.

---

## License

MIT — see `LICENSE` in this repository.

# SolSci

**Tamper-proof scientific discovery verification on Solana.**

SolSci lets researchers register their analysis outputs on-chain with a permanent, timestamped certificate. The file never leaves your machine — only its SHA-256 hash gets stored. Anyone can later verify the record by hashing the same file and looking up the on-chain proof.

---

## Why

Science has a reproducibility problem. Results get published, challenged, or quietly buried with no neutral record of what existed when. SolSci creates an immutable timestamp: *this researcher, this file, this moment*. No intermediary, no trusted third party, no way to rewrite the past.

---

## How it works

```
analysis output file (FASTQ, JSON, CSV, anything)
        ↓
SHA-256 hash computed locally (file never uploaded)
        ↓
register_discovery → Solana PDA
        ↓
permanent on-chain certificate
```

The PDA is keyed by `(researcher_wallet, file_hash)`. Same researcher can't register the same hash twice. Anyone with the file can verify: hash it themselves, look up the PDA, compare.

---

## Structure

```
SolSci/
├── programs/solsci/        Anchor smart contract
│   └── src/lib.rs          register_discovery, verify_discovery, close_discovery
├── engine/                 Rust CLI for registering from terminal or CI
│   └── src/
│       ├── main.rs         entry point, register + verify subcommands
│       ├── cli.rs          clap argument definitions
│       ├── hash.rs         streaming SHA-256 (handles multi-GB files)
│       ├── metadata.rs     DiscoveryMetadata builder
│       └── solana.rs       PDA derivation, instruction encoding, on-chain submission
├── app/                    React frontend
│   └── src/
│       ├── App.tsx         wallet provider setup
│       ├── components/
│       │   └── Dashboard.tsx   Register / Verify / Feed tabs
│       └── idl/solsci.json     program interface (regenerate with npm run copy-idl)
├── tests/solsci.ts         anchor test suite
└── .github/workflows/
    └── solsci.yml          CI/CD — auto-stamps analysis outputs on push
```

---

## On-chain program

Three instructions:

| Instruction | What it does |
|---|---|
| `register_discovery` | Creates a PDA storing `researcher`, `file_hash`, `timestamp`, `metadata`, `bump` |
| `verify_discovery` | Confirms a record exists, emits a `DiscoveryVerified` event for CPI callers |
| `close_discovery` | Closes the account, returns rent lamports to the researcher |

Account space is calculated automatically via `#[derive(InitSpace)]`. Metadata is capped at 512 bytes on-chain.

---

## CLI engine

```bash
# Build
cd engine && cargo build --release

# Register a discovery
./target/release/solsci-engine register \
  --file output.fastq \
  --analysis-type whole_genome_sequencing \
  --tool-version "fastp/0.23.4" \
  --program-id <DEPLOYED_PROGRAM_ID> \
  --keypair ~/.config/solana/id.json

# Dry-run (hash + metadata only, no transaction)
./target/release/solsci-engine register \
  --file output.fastq \
  --program-id <DEPLOYED_PROGRAM_ID> \
  --dry-run

# Verify a record
./target/release/solsci-engine verify \
  --hash <64-char-hex> \
  --researcher <wallet-address> \
  --program-id <DEPLOYED_PROGRAM_ID>
```

The engine streams files in 64 KB chunks — no memory issues with large genomics files.

---

## Frontend

```bash
cd app
npm install --legacy-peer-deps
npm start
```

Three tabs:

- **Register** — drop any file, pick analysis type, connect Phantom, register on-chain
- **Verify** — paste a wallet + hash (or drop the file), checks the PDA live
- **Feed** — all registered discoveries, sorted newest first

After `anchor build` and `anchor deploy`, sync the IDL:

```bash
npm run copy-idl
```

Then update `app/src/idl/solsci.json` with the deployed program address.

---

## GitHub Actions — automatic stamping

Put this in your analysis repo and discoveries get stamped automatically:

```yaml
# .github/workflows/solsci.yml already included
```

**Secrets to configure** (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `SOLANA_KEYPAIR` | `base64 -w0 ~/.config/solana/id.json` |
| `SOLSCI_PROGRAM_ID` | your deployed program address |

Without secrets it runs in dry-run mode — safe to add to any repo immediately.

---

## Local development

**Prerequisites:**
- Rust stable (`rustup update stable`)
- Solana CLI 2.x+ (`sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"`)
- Anchor CLI 1.0.2+ (`avm install latest && avm use latest`)
- Node.js 18+

```bash
# Clone
git clone https://github.com/diladeniz/solsci
cd solsci

# Install JS deps
npm install --legacy-peer-deps

# Build and deploy to devnet
anchor keys sync
anchor build
anchor deploy

# Sync IDL to frontend
npm run copy-idl

# Run tests
anchor test
```

Make sure your wallet has devnet SOL:

```bash
solana config set --url devnet
solana airdrop 2
```

---

## Tech stack

| Layer | Tech |
|---|---|
| Smart contract | Anchor 1.0.2, Rust |
| CLI engine | Rust, solana-sdk 2.2, sha2, clap |
| Frontend | React 18, @coral-xyz/anchor 1.0.2, @solana/wallet-adapter |
| Network | Solana devnet → mainnet-beta |
| CI/CD | GitHub Actions |

---

## License

Apache 2.0

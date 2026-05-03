/**
 * SolSci devnet end-to-end test
 * register → verify → list feed → close
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, Connection } from "@solana/web3.js";
import { readFileSync } from "fs";
import { createHash } from "crypto";
import { createInterface } from "readline";

const RPC       = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("8cmvWB8SrFvS5fKjsCw4bme9iFVeFCFsbTPKdq9NykbH");

// ── Load keypair ──────────────────────────────────────────────────────────────

const rawKey  = JSON.parse(readFileSync("/root/.config/solana/id.json", "utf8"));
const keypair = Keypair.fromSecretKey(Uint8Array.from(rawKey));

// ── Anchor setup ──────────────────────────────────────────────────────────────

const connection = new Connection(RPC, "confirmed");
const wallet     = new anchor.Wallet(keypair);
const provider   = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });

anchor.setProvider(provider);

const idlRaw = JSON.parse(readFileSync("./app/src/idl/solsci.json", "utf8"));
const program = new anchor.Program(idlRaw, provider);

// ── Helpers ───────────────────────────────────────────────────────────────────

function sha256(input) {
  return Array.from(createHash("sha256").update(input).digest());
}

function hex(bytes) {
  return Buffer.from(bytes).toString("hex");
}

function derivePDA(pubkey, fileHash) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("discovery"), pubkey.toBuffer(), Buffer.from(fileHash)],
    PROGRAM_ID
  );
}

function log(label, value) {
  console.log(`  \x1b[36m${label.padEnd(22)}\x1b[0m ${value}`);
}

function ok(msg)   { console.log(`  \x1b[32m✔\x1b[0m  ${msg}`); }
function fail(msg) { console.log(`  \x1b[31m✘\x1b[0m  ${msg}`); process.exit(1); }

// ── Test data ─────────────────────────────────────────────────────────────────

const testInput  = `solsci-devnet-e2e-test-${Date.now()}`;
const fileHash   = sha256(testInput);
const metadata   = JSON.stringify({
  tool:          "solsci-e2e",
  version:       "1.0.0",
  analysis_type: "whole_genome_sequencing",
  description:   "Automated devnet end-to-end test",
  file_size_bytes: 1337,
});

const [pda] = derivePDA(keypair.publicKey, fileHash);

// ── Run ───────────────────────────────────────────────────────────────────────

console.log("\n\x1b[1mSolSci devnet E2E test\x1b[0m");
console.log("─".repeat(50));
log("Wallet",     keypair.publicKey.toBase58());
log("Program ID", PROGRAM_ID.toBase58());
log("File hash",  hex(fileHash).slice(0, 32) + "…");
log("PDA",        pda.toBase58());
console.log();

// ── 1. Register ───────────────────────────────────────────────────────────────

console.log("\x1b[1m1. register_discovery\x1b[0m");
try {
  const tx = await program.methods
    .registerDiscovery(fileHash, metadata)
    .accounts({ researcher: keypair.publicKey, discoveryRecord: pda })
    .rpc({ commitment: "confirmed" });

  ok(`Transaction confirmed`);
  log("Signature", tx.slice(0, 32) + "…");
  log("Explorer",  `https://explorer.solana.com/tx/${tx}?cluster=devnet`);
} catch (e) {
  fail(`register_discovery failed: ${e.message}`);
}

// ── 2. Fetch and verify state ─────────────────────────────────────────────────

console.log("\n\x1b[1m2. Fetch on-chain record\x1b[0m");
try {
  const record = await program.account.discoveryRecord.fetch(pda);

  ok("Account exists on devnet");
  log("Researcher",  record.researcher.toBase58());
  log("Timestamp",   new Date(record.timestamp.toNumber() * 1000).toISOString());
  log("File hash",   hex(record.fileHash).slice(0, 32) + "…");
  log("Metadata",    record.metadata.slice(0, 60) + "…");
  log("Bump",        String(record.bump));

  if (!record.researcher.equals(keypair.publicKey)) fail("Researcher mismatch");
  if (hex(record.fileHash) !== hex(fileHash))        fail("File hash mismatch");
  if (record.metadata !== metadata)                  fail("Metadata mismatch");
  ok("All fields verified");
} catch (e) {
  fail(`fetch failed: ${e.message}`);
}

// ── 3. verify_discovery ───────────────────────────────────────────────────────

console.log("\n\x1b[1m3. verify_discovery\x1b[0m");
try {
  const tx = await program.methods
    .verifyDiscovery(fileHash)
    .accounts({ researcher: keypair.publicKey, discoveryRecord: pda })
    .rpc({ commitment: "confirmed" });

  ok("verify_discovery emitted event");
  log("Signature", tx.slice(0, 32) + "…");
} catch (e) {
  fail(`verify_discovery failed: ${e.message}`);
}

// ── 4. Feed (all accounts) ────────────────────────────────────────────────────

console.log("\n\x1b[1m4. Feed (all discoveryRecord accounts)\x1b[0m");
try {
  const accounts = await program.account.discoveryRecord.all();
  ok(`Found ${accounts.length} discovery record(s) on devnet`);
  accounts
    .sort((a, b) => b.account.timestamp.toNumber() - a.account.timestamp.toNumber())
    .slice(0, 5)
    .forEach((a, i) => {
      const meta = JSON.parse(a.account.metadata);
      log(`  [${i + 1}] ${meta.analysis_type}`, new Date(a.account.timestamp.toNumber() * 1000).toLocaleDateString());
    });
} catch (e) {
  fail(`feed fetch failed: ${e.message}`);
}

// ── 5. close_discovery ────────────────────────────────────────────────────────

console.log("\n\x1b[1m5. close_discovery (rent reclaim)\x1b[0m");
const balBefore = await connection.getBalance(keypair.publicKey);
try {
  const tx = await program.methods
    .closeDiscovery(fileHash)
    .accounts({ researcher: keypair.publicKey, discoveryRecord: pda })
    .rpc({ commitment: "confirmed" });

  const balAfter = await connection.getBalance(keypair.publicKey);
  ok("Account closed, rent returned");
  log("Signature",  tx.slice(0, 32) + "…");
  log("SOL reclaimed", `+${((balAfter - balBefore) / 1e9).toFixed(6)} SOL`);

  // Confirm account is gone
  try {
    await program.account.discoveryRecord.fetch(pda);
    fail("Account should not exist after close");
  } catch {
    ok("Account confirmed deleted on-chain");
  }
} catch (e) {
  fail(`close_discovery failed: ${e.message}`);
}

console.log("\n" + "─".repeat(50));
console.log("\x1b[32m\x1b[1mAll tests passed on devnet ✔\x1b[0m\n");

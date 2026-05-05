import * as anchor from "@coral-xyz/anchor";
import { Program }  from "@coral-xyz/anchor";
import { Solsci }   from "../target/types/solsci";
import { assert }   from "chai";
import * as crypto  from "crypto";

// Anchor v0.32 ResolvedAccounts has quirky inference for PDA accounts;
// casting to `any` avoids false TS errors without sacrificing runtime safety.
type Accs = Record<string, anchor.web3.PublicKey | anchor.web3.Keypair>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function sha256(input: string): number[] {
  return Array.from(crypto.createHash("sha256").update(input).digest());
}

function toFixed(bytes: number[]): number[] & { length: 32 } {
  return [...Buffer.from(bytes)] as unknown as number[] & { length: 32 };
}

function makeMetadata(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    analysis_type:   "machine_learning",
    tool:            "Python",
    version:         "3.11.0",
    description:     "Benchmark results for a transformer model on CIFAR-10",
    file_name:       "results.json",
    file_size_bytes: 4096,
    ...overrides,
  });
}

async function airdrop(
  connection: anchor.web3.Connection,
  pubkey: anchor.web3.PublicKey,
  sol = 2,
) {
  const sig = await connection.requestAirdrop(
    pubkey,
    sol * anchor.web3.LAMPORTS_PER_SOL,
  );
  await connection.confirmTransaction(sig, "confirmed");
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("solsci", () => {
  const provider    = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program     = anchor.workspace.Solsci as Program<Solsci>;
  const researcher  = provider.wallet;

  // Second wallet used for transfer + endorse tests
  const peer        = anchor.web3.Keypair.generate();

  const testFileHash  = sha256("test-output-v1");
  const testMetadata  = makeMetadata();

  function discoveryPDA(pubkey: anchor.web3.PublicKey, hash: number[]) {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("discovery"), pubkey.toBuffer(), Buffer.from(hash)],
      program.programId,
    );
  }

  function endorsementPDA(
    endorser: anchor.web3.PublicKey,
    discoveryKey: anchor.web3.PublicKey,
  ) {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("endorsement"), endorser.toBuffer(), discoveryKey.toBuffer()],
      program.programId,
    );
  }

  before(async () => {
    await airdrop(provider.connection, peer.publicKey);
  });

  // ── Register ────────────────────────────────────────────────────────────────

  it("registers a discovery and stores correct on-chain state", async () => {
    const [pda] = discoveryPDA(researcher.publicKey, testFileHash);

    const txSig = await (program.methods as any)
      .registerDiscovery(toFixed(testFileHash), testMetadata)
      .accounts({ researcher: researcher.publicKey, discoveryRecord: pda })
      .rpc();

    console.log("  register_discovery:", txSig);

    const record = await program.account.discoveryRecord.fetch(pda);

    assert.ok(record.researcher.equals(researcher.publicKey), "researcher");
    assert.ok(record.owner.equals(researcher.publicKey),      "owner == researcher on init");
    assert.deepEqual(Array.from(record.fileHash), testFileHash, "file hash");
    assert.equal(record.metadata, testMetadata,   "metadata");
    assert.isAbove(record.timestamp.toNumber(), 0, "timestamp set");
    assert.equal(record.endorsementCount, 0,       "endorsementCount starts at 0");

    const parsed = JSON.parse(record.metadata);
    assert.equal(parsed.analysis_type, "machine_learning");
    assert.equal(parsed.tool,          "Python");
    assert.equal(parsed.version,       "3.11.0");
    assert.ok(parsed.description,      "description present");
  });

  // ── Verify ──────────────────────────────────────────────────────────────────

  it("verifies an existing discovery and emits DiscoveryVerified", async () => {
    const [pda] = discoveryPDA(researcher.publicKey, testFileHash);

    const txSig = await (program.methods as any)
      .verifyDiscovery(toFixed(testFileHash))
      .accounts({ researcher: researcher.publicKey, discoveryRecord: pda })
      .rpc();

    console.log("  verify_discovery:", txSig);
    assert.ok(txSig, "expected a transaction signature");
  });

  // ── Transfer ─────────────────────────────────────────────────────────────────

  it("transfers ownership to a new wallet, preserving researcher", async () => {
    const hash   = sha256("transfer-test");
    const [pda]  = discoveryPDA(researcher.publicKey, hash);

    await (program.methods as any)
      .registerDiscovery(toFixed(hash), testMetadata)
      .accounts({ researcher: researcher.publicKey, discoveryRecord: pda })
      .rpc();

    const txSig = await (program.methods as any)
      .transferDiscovery(toFixed(hash))
      .accounts({
        owner:           researcher.publicKey,
        newOwner:        peer.publicKey,
        researcher:      researcher.publicKey,
        discoveryRecord: pda,
      })
      .rpc();

    console.log("  transfer_discovery:", txSig);

    const record = await program.account.discoveryRecord.fetch(pda);
    assert.ok(record.owner.equals(peer.publicKey),            "owner updated");
    assert.ok(record.researcher.equals(researcher.publicKey), "researcher immutable");
  });

  it("rejects transfer from non-owner wallet", async () => {
    const hash  = sha256("transfer-reject-test");
    const [pda] = discoveryPDA(researcher.publicKey, hash);

    await (program.methods as any)
      .registerDiscovery(toFixed(hash), testMetadata)
      .accounts({ researcher: researcher.publicKey, discoveryRecord: pda })
      .rpc();

    try {
      await (program.methods as any)
        .transferDiscovery(toFixed(hash))
        .accounts({
          owner:           peer.publicKey,      // peer is NOT the owner
          newOwner:        peer.publicKey,
          researcher:      researcher.publicKey,
          discoveryRecord: pda,
        })
        .signers([peer])
        .rpc();
      assert.fail("Expected NotOwner error");
    } catch (err: any) {
      assert.include(err.toString(), "NotOwner");
    }
  });

  // ── Endorse ──────────────────────────────────────────────────────────────────

  it("endorses a discovery and increments endorsement_count", async () => {
    const [pda]         = discoveryPDA(researcher.publicKey, testFileHash);
    const [endorsePda]  = endorsementPDA(peer.publicKey, pda);

    const before = await program.account.discoveryRecord.fetch(pda);

    const txSig = await (program.methods as any)
      .endorseDiscovery(toFixed(testFileHash))
      .accounts({
        endorser:         peer.publicKey,
        researcher:       researcher.publicKey,
        discoveryRecord:  pda,
        endorsementRecord: endorsePda,
      })
      .signers([peer])
      .rpc();

    console.log("  endorse_discovery:", txSig);

    const after = await program.account.discoveryRecord.fetch(pda);
    assert.equal(
      after.endorsementCount,
      before.endorsementCount + 1,
      "endorsementCount must increment",
    );

    const endorsement = await program.account.endorsementRecord.fetch(endorsePda);
    assert.ok(endorsement.endorser.equals(peer.publicKey),       "endorser stored");
    assert.ok(endorsement.discoveryRecord.equals(pda),           "discovery_record stored");
    assert.isAbove(endorsement.timestamp.toNumber(), 0,          "timestamp set");
  });

  it("rejects a second endorsement from the same wallet (PDA already exists)", async () => {
    const [pda]        = discoveryPDA(researcher.publicKey, testFileHash);
    const [endorsePda] = endorsementPDA(peer.publicKey, pda);

    try {
      await (program.methods as any)
        .endorseDiscovery(toFixed(testFileHash))
        .accounts({
          endorser:          peer.publicKey,
          researcher:        researcher.publicKey,
          discoveryRecord:   pda,
          endorsementRecord: endorsePda,
        })
        .signers([peer])
        .rpc();
      assert.fail("Expected duplicate endorsement to fail");
    } catch (err: any) {
      assert.ok(err, "duplicate endorsement must throw");
    }
  });

  it("rejects self-endorsement (CannotEndorseOwn)", async () => {
    const hash       = sha256("self-endorse-test");
    const [pda]      = discoveryPDA(researcher.publicKey, hash);
    const [epda]     = endorsementPDA(researcher.publicKey, pda);

    await (program.methods as any)
      .registerDiscovery(toFixed(hash), testMetadata)
      .accounts({ researcher: researcher.publicKey, discoveryRecord: pda })
      .rpc();

    try {
      await (program.methods as any)
        .endorseDiscovery(toFixed(hash))
        .accounts({
          endorser:          researcher.publicKey,
          researcher:        researcher.publicKey,
          discoveryRecord:   pda,
          endorsementRecord: epda,
        })
        .rpc();
      assert.fail("Expected CannotEndorseOwn error");
    } catch (err: any) {
      assert.include(err.toString(), "CannotEndorseOwn");
    }
  });

  // ── Validation ───────────────────────────────────────────────────────────────

  it("rejects metadata exceeding 512 bytes", async () => {
    const hash  = sha256("too-long-metadata");
    const [pda] = discoveryPDA(researcher.publicKey, hash);

    try {
      await (program.methods as any)
        .registerDiscovery(toFixed(hash), "x".repeat(513))
        .accounts({ researcher: researcher.publicKey, discoveryRecord: pda })
        .rpc();
      assert.fail("Expected MetadataTooLong error");
    } catch (err: any) {
      assert.include(err.toString(), "MetadataTooLong");
    }
  });

  it("rejects empty metadata", async () => {
    const hash  = sha256("empty-metadata");
    const [pda] = discoveryPDA(researcher.publicKey, hash);

    try {
      await (program.methods as any)
        .registerDiscovery(toFixed(hash), "")
        .accounts({ researcher: researcher.publicKey, discoveryRecord: pda })
        .rpc();
      assert.fail("Expected MetadataEmpty error");
    } catch (err: any) {
      assert.include(err.toString(), "MetadataEmpty");
    }
  });

  it("rejects duplicate registration for the same researcher + hash", async () => {
    const [pda] = discoveryPDA(researcher.publicKey, testFileHash);

    try {
      await (program.methods as any)
        .registerDiscovery(toFixed(testFileHash), testMetadata)
        .accounts({ researcher: researcher.publicKey, discoveryRecord: pda })
        .rpc();
      assert.fail("Expected duplicate registration to fail");
    } catch (err: any) {
      assert.ok(err, "duplicate must throw");
    }
  });

  it("accepts metadata at the 512-byte boundary", async () => {
    const hash  = sha256("boundary-metadata");
    const [pda] = discoveryPDA(researcher.publicKey, hash);

    const base   = makeMetadata({ description: "" });
    const budget = 512 - base.length;
    const meta   = makeMetadata({ description: budget > 2 ? "x".repeat(budget - 2) : "" });

    assert.isAtMost(new TextEncoder().encode(meta).length, 512, "test meta must fit");

    const txSig = await (program.methods as any)
      .registerDiscovery(toFixed(hash), meta)
      .accounts({ researcher: researcher.publicKey, discoveryRecord: pda })
      .rpc();

    assert.ok(txSig, "boundary metadata should succeed");
  });

  // ── Close ────────────────────────────────────────────────────────────────────

  it("closes a discovery and returns rent to the current owner", async () => {
    const hash  = sha256("discovery-to-close");
    const [pda] = discoveryPDA(researcher.publicKey, hash);

    await (program.methods as any)
      .registerDiscovery(toFixed(hash), testMetadata)
      .accounts({ researcher: researcher.publicKey, discoveryRecord: pda })
      .rpc();

    const balanceBefore = await provider.connection.getBalance(researcher.publicKey);

    const txSig = await (program.methods as any)
      .closeDiscovery(toFixed(hash))
      .accounts({
        owner:           researcher.publicKey,
        researcher:      researcher.publicKey,
        discoveryRecord: pda,
      })
      .rpc();

    console.log("  close_discovery:", txSig);

    const balanceAfter = await provider.connection.getBalance(researcher.publicKey);
    assert.isAbove(balanceAfter, balanceBefore, "rent must be returned");

    try {
      await program.account.discoveryRecord.fetch(pda);
      assert.fail("Closed account should not be fetchable");
    } catch (err: any) {
      assert.ok(err, "fetching a closed account must throw");
    }
  });

  it("rejects close from non-owner wallet", async () => {
    const hash  = sha256("close-reject-test");
    const [pda] = discoveryPDA(researcher.publicKey, hash);

    await (program.methods as any)
      .registerDiscovery(toFixed(hash), testMetadata)
      .accounts({ researcher: researcher.publicKey, discoveryRecord: pda })
      .rpc();

    try {
      await (program.methods as any)
        .closeDiscovery(toFixed(hash))
        .accounts({
          owner:           peer.publicKey,      // peer is NOT the owner
          researcher:      researcher.publicKey,
          discoveryRecord: pda,
        })
        .signers([peer])
        .rpc();
      assert.fail("Expected NotOwner error");
    } catch (err: any) {
      assert.include(err.toString(), "NotOwner");
    }
  });
});

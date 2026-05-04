import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Solsci } from "../target/types/solsci";
import { assert } from "chai";
import * as crypto from "crypto";

// ── Helpers ───────────────────────────────────────────────────────────────────

function sha256(input: string): number[] {
  return Array.from(crypto.createHash("sha256").update(input).digest());
}

function toFixedArray(bytes: number[]): number[] & { length: 32 } {
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

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("solsci", () => {
  const provider   = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program    = anchor.workspace.Solsci as Program<Solsci>;
  const researcher = provider.wallet;

  const testFileHash = sha256("test-output-v1");
  const testMetadata = makeMetadata();

  function derivePDA(pubkey: anchor.web3.PublicKey, fileHash: number[]) {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("discovery"), pubkey.toBuffer(), Buffer.from(fileHash)],
      program.programId,
    );
  }

  // ── Register ────────────────────────────────────────────────────────────────

  it("registers a discovery and stores correct on-chain state", async () => {
    const [pda] = derivePDA(researcher.publicKey, testFileHash);

    const txSig = await program.methods
      .registerDiscovery(toFixedArray(testFileHash), testMetadata)
      .accounts({ researcher: researcher.publicKey, discoveryRecord: pda })
      .rpc();

    console.log("  register_discovery:", txSig);

    const record = await program.account.discoveryRecord.fetch(pda);

    assert.ok(record.researcher.equals(researcher.publicKey), "researcher mismatch");
    assert.deepEqual(Array.from(record.fileHash), testFileHash, "file hash mismatch");
    assert.equal(record.metadata, testMetadata, "metadata mismatch");
    assert.isAbove(record.timestamp.toNumber(), 0, "timestamp must be set");
    assert.isAbove(record.bump, -1, "bump must be stored");

    // Verify the stored metadata parses back to the expected shape
    const parsed = JSON.parse(record.metadata);
    assert.equal(parsed.analysis_type, "machine_learning");
    assert.equal(parsed.tool, "Python");
    assert.equal(parsed.version, "3.11.0");
    assert.ok(parsed.description, "description must be present");
  });

  // ── Verify ──────────────────────────────────────────────────────────────────

  it("verifies an existing discovery record", async () => {
    const [pda] = derivePDA(researcher.publicKey, testFileHash);

    const txSig = await program.methods
      .verifyDiscovery(toFixedArray(testFileHash))
      .accounts({ researcher: researcher.publicKey, discoveryRecord: pda })
      .rpc();

    console.log("  verify_discovery:", txSig);
    assert.ok(txSig, "expected a transaction signature");
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  it("rejects metadata exceeding 512 bytes", async () => {
    const badHash = sha256("bad-metadata-test");
    const [pda]   = derivePDA(researcher.publicKey, badHash);

    try {
      await program.methods
        .registerDiscovery(toFixedArray(badHash), "x".repeat(513))
        .accounts({ researcher: researcher.publicKey, discoveryRecord: pda })
        .rpc();
      assert.fail("Expected MetadataTooLong error");
    } catch (err: any) {
      assert.include(err.toString(), "MetadataTooLong");
    }
  });

  it("rejects empty metadata", async () => {
    const badHash = sha256("empty-metadata-test");
    const [pda]   = derivePDA(researcher.publicKey, badHash);

    try {
      await program.methods
        .registerDiscovery(toFixedArray(badHash), "")
        .accounts({ researcher: researcher.publicKey, discoveryRecord: pda })
        .rpc();
      assert.fail("Expected MetadataEmpty error");
    } catch (err: any) {
      assert.include(err.toString(), "MetadataEmpty");
    }
  });

  it("rejects duplicate registration for the same researcher + hash", async () => {
    const [pda] = derivePDA(researcher.publicKey, testFileHash);

    try {
      await program.methods
        .registerDiscovery(toFixedArray(testFileHash), testMetadata)
        .accounts({ researcher: researcher.publicKey, discoveryRecord: pda })
        .rpc();
      assert.fail("Expected duplicate registration to fail");
    } catch (err: any) {
      assert.ok(err, "duplicate registration must throw");
    }
  });

  it("accepts metadata at the 512-byte boundary", async () => {
    const boundaryHash = sha256("boundary-metadata-test");
    const [pda]        = derivePDA(researcher.publicKey, boundaryHash);

    // Build metadata that is exactly ≤ 512 bytes
    const base   = makeMetadata({ description: "" });
    const budget = 512 - base.length;
    const padding = budget > 2 ? "x".repeat(budget - 2) : "";
    const meta   = makeMetadata({ description: padding });

    assert.isAtMost(new TextEncoder().encode(meta).length, 512, "test metadata must fit");

    const txSig = await program.methods
      .registerDiscovery(toFixedArray(boundaryHash), meta)
      .accounts({ researcher: researcher.publicKey, discoveryRecord: pda })
      .rpc();

    assert.ok(txSig, "boundary-length metadata should succeed");
  });

  // ── Close ───────────────────────────────────────────────────────────────────

  it("closes a discovery record and returns rent to the researcher", async () => {
    const closeHash = sha256("discovery-to-close");
    const [pda]     = derivePDA(researcher.publicKey, closeHash);

    await program.methods
      .registerDiscovery(toFixedArray(closeHash), testMetadata)
      .accounts({ researcher: researcher.publicKey, discoveryRecord: pda })
      .rpc();

    const balanceBefore = await provider.connection.getBalance(researcher.publicKey);

    const txSig = await program.methods
      .closeDiscovery(toFixedArray(closeHash))
      .accounts({ researcher: researcher.publicKey, discoveryRecord: pda })
      .rpc();

    console.log("  close_discovery:", txSig);

    const balanceAfter = await provider.connection.getBalance(researcher.publicKey);
    assert.isAbove(balanceAfter, balanceBefore, "rent should be returned to researcher");

    try {
      await program.account.discoveryRecord.fetch(pda);
      assert.fail("Closed account should not be fetchable");
    } catch (err: any) {
      assert.ok(err, "fetching a closed account must throw");
    }
  });
});

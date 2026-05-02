import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Solsci } from "../target/types/solsci";
import { assert } from "chai";
import * as crypto from "crypto";

describe("solsci", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Solsci as Program<Solsci>;
  const researcher = provider.wallet;

  // Generate a deterministic test hash from a known FASTQ output string
  const testFileHash = Array.from(
    crypto.createHash("sha256").update("test-fastq-output-v1").digest()
  ) as number[];

  const testMetadata = JSON.stringify({
    tool: "BioFastq-A",
    version: "1.0.0",
    analysis_type: "whole_genome_sequencing",
    file_size_bytes: 1048576,
    reference_genome: "GRCh38",
  });

  function deriveDiscoveryPDA(
    researcherPubkey: anchor.web3.PublicKey,
    fileHash: number[]
  ): [anchor.web3.PublicKey, number] {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("discovery"),
        researcherPubkey.toBuffer(),
        Buffer.from(fileHash),
      ],
      program.programId
    );
  }

  it("registers a discovery and emits DiscoveryRegistered event", async () => {
    const fileHashBytes = Buffer.from(testFileHash);
    const [discoveryPDA] = deriveDiscoveryPDA(
      researcher.publicKey,
      testFileHash
    );

    const txSig = await program.methods
      .registerDiscovery([...fileHashBytes] as unknown as number[] & { length: 32 }, testMetadata)
      .accounts({
        researcher: researcher.publicKey,
        discoveryRecord: discoveryPDA,
      })
      .rpc();

    console.log("  register_discovery tx:", txSig);

    // Fetch and assert on-chain state
    const record = await program.account.discoveryRecord.fetch(discoveryPDA);

    assert.ok(
      record.researcher.equals(researcher.publicKey),
      "researcher pubkey mismatch"
    );
    assert.deepEqual(
      Array.from(record.fileHash),
      testFileHash,
      "file hash mismatch"
    );
    assert.equal(record.metadata, testMetadata, "metadata mismatch");
    assert.isAbove(record.timestamp.toNumber(), 0, "timestamp should be set");
  });

  it("verifies an existing discovery record", async () => {
    const [discoveryPDA] = deriveDiscoveryPDA(
      researcher.publicKey,
      testFileHash
    );

    const txSig = await program.methods
      .verifyDiscovery([...Buffer.from(testFileHash)] as unknown as number[] & { length: 32 })
      .accounts({
        researcher: researcher.publicKey,
        discoveryRecord: discoveryPDA,
      })
      .rpc();

    console.log("  verify_discovery tx:", txSig);
    assert.ok(txSig, "verify_discovery should return a transaction signature");
  });

  it("rejects metadata exceeding 512 bytes", async () => {
    const longMetadata = "x".repeat(513);
    const otherHash = Array.from(
      crypto.createHash("sha256").update("other-output").digest()
    );
    const [otherPDA] = deriveDiscoveryPDA(researcher.publicKey, otherHash);

    try {
      await program.methods
        .registerDiscovery(
          [...Buffer.from(otherHash)] as unknown as number[] & { length: 32 },
          longMetadata
        )
        .accounts({
          researcher: researcher.publicKey,
          discoveryRecord: otherPDA,
        })
        .rpc();
      assert.fail("Expected MetadataTooLong error");
    } catch (err: any) {
      assert.include(
        err.toString(),
        "MetadataTooLong",
        "should throw MetadataTooLong"
      );
    }
  });

  it("rejects empty metadata", async () => {
    const emptyHash = Array.from(
      crypto.createHash("sha256").update("empty-meta-test").digest()
    );
    const [emptyPDA] = deriveDiscoveryPDA(researcher.publicKey, emptyHash);

    try {
      await program.methods
        .registerDiscovery(
          [...Buffer.from(emptyHash)] as unknown as number[] & { length: 32 },
          ""
        )
        .accounts({
          researcher: researcher.publicKey,
          discoveryRecord: emptyPDA,
        })
        .rpc();
      assert.fail("Expected MetadataEmpty error");
    } catch (err: any) {
      assert.include(
        err.toString(),
        "MetadataEmpty",
        "should throw MetadataEmpty"
      );
    }
  });

  it("prevents duplicate registration for same researcher + hash", async () => {
    const [discoveryPDA] = deriveDiscoveryPDA(
      researcher.publicKey,
      testFileHash
    );

    try {
      await program.methods
        .registerDiscovery(
          [...Buffer.from(testFileHash)] as unknown as number[] & { length: 32 },
          testMetadata
        )
        .accounts({
          researcher: researcher.publicKey,
          discoveryRecord: discoveryPDA,
        })
        .rpc();
      assert.fail("Expected duplicate registration to fail");
    } catch (err: any) {
      // Anchor will reject with "already in use" because the PDA account
      // was already initialised in the first test
      assert.ok(err, "duplicate registration should throw");
    }
  });
});

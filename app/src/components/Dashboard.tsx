import React, { useCallback, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import idl from "../idl/solsci.json";

const PROGRAM_ID = new PublicKey((idl as any).address);

interface Certificate {
  pda: string;
  txSig: string;
  fileHash: string;
  timestamp: number;
  metadata: string;
}

export default function Dashboard() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [file, setFile] = useState<File | null>(null);
  const [fileHash, setFileHash] = useState<string>("");
  const [hashBytes, setHashBytes] = useState<Uint8Array | null>(null);
  const [analysisType, setAnalysisType] = useState("whole_genome_sequencing");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function hashFile(f: File): Promise<Uint8Array> {
    const buf = await f.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return new Uint8Array(digest);
  }

  const handleFileSelect = useCallback(async (f: File) => {
    setFile(f);
    setFileHash("");
    setHashBytes(null);
    setCertificate(null);
    setError("");
    setStatus("Hashing file…");
    try {
      const bytes = await hashFile(f);
      const hex = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      setHashBytes(bytes);
      setFileHash(hex);
      setStatus("Hash ready. Connect wallet and click Register.");
    } catch {
      setError("Failed to hash file.");
      setStatus("");
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]);
    },
    [handleFileSelect]
  );

  async function registerDiscovery() {
    if (!wallet.publicKey || !wallet.signTransaction || !hashBytes || !file) return;
    setError("");
    setStatus("Building transaction…");

    try {
      const provider = new AnchorProvider(
        connection,
        wallet as any,
        { commitment: "confirmed" }
      );

      const program = new Program(idl as Idl, provider);

      const metadata = JSON.stringify({
        tool: "BioFastq-A",
        version: "1.0.0",
        analysis_type: analysisType,
        file_size_bytes: file.size,
        file_name: file.name,
      });

      if (new TextEncoder().encode(metadata).length > 512) {
        setError("Metadata too long (> 512 bytes). Shorten analysis type or file name.");
        return;
      }

      const [discoveryPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("discovery"),
          wallet.publicKey.toBuffer(),
          Buffer.from(hashBytes),
        ],
        PROGRAM_ID
      );

      setStatus("Awaiting wallet approval…");

      const txSig = await (program.methods as any)
        .registerDiscovery(Array.from(hashBytes), metadata)
        .accounts({
          researcher: wallet.publicKey,
          discoveryRecord: discoveryPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: "confirmed" });

      const record = await (program.account as any).discoveryRecord.fetch(discoveryPDA);

      setCertificate({
        pda: discoveryPDA.toBase58(),
        txSig,
        fileHash,
        timestamp: record.timestamp.toNumber(),
        metadata,
      });
      setStatus("Discovery registered successfully.");
    } catch (e: any) {
      setError(e?.message ?? "Transaction failed.");
      setStatus("");
    }
  }

  return (
    <div className="solsci-app">
      <header className="solsci-header">
        <h1>SolSci</h1>
        <p>Tamper-proof scientific discovery verification on Solana</p>
      </header>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1rem" }}>
        <WalletMultiButton />
      </div>

      <div className="card">
        <h2>1. Upload Research Output</h2>
        <div
          className={`drop-zone${dragging ? " active" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <p>{file ? file.name : "Drop your FASTQ / analysis output here, or click to browse"}</p>
          <input
            ref={inputRef}
            type="file"
            style={{ display: "none" }}
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
          />
        </div>
        {fileHash && <div className="hash-display">SHA-256: {fileHash}</div>}
      </div>

      {file && (
        <div className="card">
          <h2>2. Analysis Metadata</h2>
          <label style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
            Analysis Type
            <input
              type="text"
              value={analysisType}
              onChange={(e) => setAnalysisType(e.target.value)}
              style={{
                display: "block",
                width: "100%",
                marginTop: "0.4rem",
                background: "#0d1117",
                border: "1px solid #2d2d44",
                borderRadius: "6px",
                color: "#e2e8f0",
                padding: "0.5rem 0.75rem",
                fontSize: "0.9rem",
              }}
            />
          </label>
        </div>
      )}

      {hashBytes && (
        <div className="card">
          <h2>3. Register Discovery</h2>
          <button
            className="btn"
            disabled={!wallet.publicKey || !hashBytes}
            onClick={registerDiscovery}
          >
            {wallet.publicKey ? "Register on Solana" : "Connect Wallet First"}
          </button>
          {status && <p className="status">{status}</p>}
          {error && <p className="error">{error}</p>}
        </div>
      )}

      {certificate && (
        <div className="card">
          <h2>Certificate of Discovery</h2>
          <div className="certificate">
            <p className="label">Certificate ID (PDA)</p>
            <p className="value">{certificate.pda}</p>

            <p className="label">Transaction</p>
            <p className="value">
              <a
                href={`https://explorer.solana.com/tx/${certificate.txSig}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
              >
                {certificate.txSig}
              </a>
            </p>

            <p className="label">File Hash (SHA-256)</p>
            <p className="value">{certificate.fileHash}</p>

            <p className="label">Timestamp</p>
            <p className="value">{new Date(certificate.timestamp * 1000).toUTCString()}</p>

            <p className="label">Metadata</p>
            <p className="value">{certificate.metadata}</p>
          </div>
        </div>
      )}
    </div>
  );
}

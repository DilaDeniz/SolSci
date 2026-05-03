import React, { useCallback, useEffect, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import idl from "../idl/solsci.json";

const PROGRAM_ID    = new PublicKey((idl as any).address);
const QVAC_BASE_URL = "http://localhost:3001";

const ANALYSIS_TYPES = [
  "whole_genome_sequencing",
  "rna_sequencing",
  "proteomics",
  "metabolomics",
  "chip_seq",
  "single_cell_sequencing",
  "metagenomics",
  "epigenomics",
  "genomic_analysis",
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface Certificate {
  pda: string;
  txSig: string;
  fileHash: string;
  timestamp: number;
  metadata: string;
}

interface VerifyResult {
  found: boolean;
  pda?: string;
  researcher?: string;
  timestamp?: number;
  metadata?: string;
}

interface FeedEntry {
  pda: string;
  researcher: string;
  fileHash: string;
  timestamp: number;
  metadata: string;
  _score?: number;
}

type Tab = "register" | "verify" | "feed";

// ── Helpers ───────────────────────────────────────────────────────────────────

function truncate(s: string, n = 8) {
  return s.length <= n * 2 + 3 ? s : `${s.slice(0, n)}…${s.slice(-n)}`;
}

async function readTextSample(file: File, bytes = 4096): Promise<string> {
  const slice = file.slice(0, bytes);
  const buf   = await slice.arrayBuffer();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
  catch { return ""; }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { connection } = useConnection();
  const wallet         = useWallet();
  const [tab, setTab]  = useState<Tab>("register");

  // ── QVAC availability ──────────────────────────────────────────────────────
  const [qvacOnline, setQvacOnline] = useState(false);

  useEffect(() => {
    fetch(`${QVAC_BASE_URL}/api/health`, { signal: AbortSignal.timeout(800) })
      .then((r) => setQvacOnline(r.ok))
      .catch(() => setQvacOnline(false));
  }, []);

  // ── Register state ─────────────────────────────────────────────────────────
  const [file, setFile]         = useState<File | null>(null);
  const [fileHash, setFileHash] = useState("");
  const [hashBytes, setHashBytes] = useState<Uint8Array | null>(null);
  const [analysisType, setAnalysisType] = useState("whole_genome_sequencing");
  const [toolName, setToolName] = useState("BioFastq-A");
  const [toolVersion, setToolVersion] = useState("1.0.0");
  const [description, setDescription] = useState("");
  const [status, setStatus]     = useState("");
  const [error, setError]       = useState("");
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [registering, setRegistering] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Verify state ───────────────────────────────────────────────────────────
  const [verifyHashInput,   setVerifyHashInput]   = useState("");
  const [verifyWalletInput, setVerifyWalletInput] = useState("");
  const [verifyResult,      setVerifyResult]      = useState<VerifyResult | null>(null);
  const [verifyError,       setVerifyError]       = useState("");
  const [verifying,         setVerifying]         = useState(false);
  const verifyFileRef = useRef<HTMLInputElement>(null);

  // ── Feed state ─────────────────────────────────────────────────────────────
  const [feed,        setFeed]        = useState<FeedEntry[]>([]);
  const [feedRaw,     setFeedRaw]     = useState<FeedEntry[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError,   setFeedError]   = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searching,   setSearching]   = useState(false);

  // ── Helpers ────────────────────────────────────────────────────────────────

  async function hashFile(f: File): Promise<Uint8Array> {
    const buf = await f.arrayBuffer();
    return new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
  }

  function bytesToHex(b: Uint8Array) {
    return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
  }

  function getProgram() {
    const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
    return new Program(idl as Idl, provider);
  }

  function renderMetadata(metaStr: string) {
    try {
      const obj = JSON.parse(metaStr);
      return (
        <table className="meta-table">
          <tbody>
            {Object.entries(obj).map(([k, v]) => (
              <tr key={k}>
                <td>{k.replace(/_/g, " ")}</td>
                <td>{String(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    } catch {
      return <span className="cert-value">{metaStr}</span>;
    }
  }

  function metaField(metaStr: string, key: string): string {
    try { return JSON.parse(metaStr)[key] ?? "—"; }
    catch { return "—"; }
  }

  // ── QVAC: suggest metadata ─────────────────────────────────────────────────

  async function suggestWithAI() {
    if (!file || !qvacOnline) return;
    setSuggesting(true);
    try {
      const fileSample = await readTextSample(file);
      const res = await fetch(`${QVAC_BASE_URL}/api/suggest`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ fileName: file.name, fileSample }),
      });
      if (!res.ok) throw new Error(await res.text());
      const suggestion = await res.json();
      if (suggestion.analysis_type) setAnalysisType(suggestion.analysis_type);
      if (suggestion.tool)          setToolName(suggestion.tool);
      if (suggestion.version)       setToolVersion(suggestion.version);
      if (suggestion.description)   setDescription(suggestion.description);
    } catch (e: any) {
      setError(`AI suggest failed: ${e.message}`);
    } finally {
      setSuggesting(false);
    }
  }

  // ── QVAC: semantic search ──────────────────────────────────────────────────

  async function runSemanticSearch() {
    if (!searchQuery.trim() || !qvacOnline) return;
    setSearching(true);
    try {
      const res = await fetch(`${QVAC_BASE_URL}/api/search`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ query: searchQuery, discoveries: feedRaw }),
      });
      if (!res.ok) throw new Error(await res.text());
      const ranked: FeedEntry[] = await res.json();
      setFeed(ranked);
    } catch (e: any) {
      setFeedError(`AI search failed: ${e.message}`);
    } finally {
      setSearching(false);
    }
  }

  function clearSearch() {
    setSearchQuery("");
    setFeed(feedRaw);
  }

  // ── Register handlers ──────────────────────────────────────────────────────

  const handleFileSelect = useCallback(async (f: File) => {
    setFile(f);
    setFileHash("");
    setHashBytes(null);
    setCertificate(null);
    setError("");
    setStatus("Hashing file…");
    try {
      const bytes = await hashFile(f);
      setHashBytes(bytes);
      setFileHash(bytesToHex(bytes));
      setStatus("Hash ready. Connect wallet and click Register.");
    } catch {
      setError("Failed to hash file.");
      setStatus("");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]);
    },
    [handleFileSelect]
  );

  async function registerDiscovery() {
    if (!wallet.publicKey || !hashBytes || !file) return;
    setError("");
    setRegistering(true);
    setStatus("Building transaction…");

    try {
      const program  = getProgram();
      const metadata = JSON.stringify({
        tool:          toolName,
        version:       toolVersion,
        analysis_type: analysisType,
        file_size_bytes: file.size,
        file_name:     file.name,
        ...(description ? { description } : {}),
      });

      if (new TextEncoder().encode(metadata).length > 512) {
        setError("Metadata too long (> 512 bytes). Shorten the description or file name.");
        return;
      }

      const [discoveryPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("discovery"), wallet.publicKey.toBuffer(), Buffer.from(hashBytes)],
        PROGRAM_ID
      );

      setStatus("Awaiting wallet approval…");

      const txSig = await (program.methods as any)
        .registerDiscovery(Array.from(hashBytes), metadata)
        .accounts({
          researcher:      wallet.publicKey,
          discoveryRecord: discoveryPDA,
          systemProgram:   SystemProgram.programId,
        })
        .rpc({ commitment: "confirmed" });

      setStatus("Confirming on-chain…");
      const record = await (program.account as any).discoveryRecord.fetch(discoveryPDA);

      setCertificate({
        pda:       discoveryPDA.toBase58(),
        txSig,
        fileHash,
        timestamp: record.timestamp.toNumber(),
        metadata,
      });
      setStatus("Registered successfully.");
    } catch (e: any) {
      setError(e?.message ?? "Transaction failed.");
      setStatus("");
    } finally {
      setRegistering(false);
    }
  }

  // ── Verify handlers ────────────────────────────────────────────────────────

  async function handleVerifyFileSelect(f: File) {
    const bytes = await hashFile(f);
    setVerifyHashInput(bytesToHex(bytes));
  }

  async function verifyDiscovery() {
    setVerifyError("");
    setVerifyResult(null);

    const hashHex   = verifyHashInput.trim().toLowerCase();
    const walletAddr = verifyWalletInput.trim();

    if (hashHex.length !== 64 || !/^[0-9a-f]+$/.test(hashHex)) {
      setVerifyError("Enter a valid 64-character SHA-256 hex hash.");
      return;
    }

    let researcherKey: PublicKey;
    try {
      researcherKey = new PublicKey(walletAddr);
    } catch {
      setVerifyError("Invalid wallet address.");
      return;
    }

    setVerifying(true);
    try {
      const provider = new AnchorProvider(
        connection,
        wallet.publicKey
          ? (wallet as any)
          : { publicKey: researcherKey, signTransaction: async (t: any) => t, signAllTransactions: async (t: any) => t },
        { commitment: "confirmed" }
      );
      const program      = new Program(idl as Idl, provider);
      const hashBytesArr = Buffer.from(hashHex, "hex");

      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("discovery"), researcherKey.toBuffer(), hashBytesArr],
        PROGRAM_ID
      );

      const record = await (program.account as any).discoveryRecord.fetch(pda);
      setVerifyResult({
        found:      true,
        pda:        pda.toBase58(),
        researcher: record.researcher.toBase58(),
        timestamp:  record.timestamp.toNumber(),
        metadata:   record.metadata,
      });
    } catch (e: any) {
      if (e?.message?.includes("Account does not exist")) {
        setVerifyResult({ found: false });
      } else {
        setVerifyError(e?.message ?? "Verification failed.");
      }
    } finally {
      setVerifying(false);
    }
  }

  // ── Feed handlers ──────────────────────────────────────────────────────────

  async function loadFeed() {
    setFeedLoading(true);
    setFeedError("");
    setSearchQuery("");
    try {
      const provider = new AnchorProvider(
        connection,
        wallet.publicKey
          ? (wallet as any)
          : { publicKey: PublicKey.default, signTransaction: async (t: any) => t, signAllTransactions: async (t: any) => t },
        { commitment: "confirmed" }
      );
      const program = new Program(idl as Idl, provider);

      const accounts = await (program.account as any).discoveryRecord.all();

      const entries: FeedEntry[] = accounts
        .map((a: any) => ({
          pda:        a.publicKey.toBase58(),
          researcher: a.account.researcher.toBase58(),
          fileHash:   Buffer.from(a.account.fileHash).toString("hex"),
          timestamp:  a.account.timestamp.toNumber(),
          metadata:   a.account.metadata,
        }))
        .sort((a: FeedEntry, b: FeedEntry) => b.timestamp - a.timestamp)
        .slice(0, 50);

      setFeedRaw(entries);
      setFeed(entries);
    } catch (e: any) {
      setFeedError(e?.message ?? "Failed to load discoveries.");
    } finally {
      setFeedLoading(false);
    }
  }

  useEffect(() => {
    if (tab === "feed") loadFeed();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="solsci-app">
      <header className="solsci-header">
        <h1>SolSci</h1>
        <p>Tamper-proof scientific discovery verification on Solana</p>
      </header>

      <div className="topbar">
        <div className="tabs">
          <button className={`tab${tab === "register" ? " active" : ""}`} onClick={() => setTab("register")}>Register</button>
          <button className={`tab${tab === "verify"   ? " active" : ""}`} onClick={() => setTab("verify")}>Verify</button>
          <button className={`tab${tab === "feed"     ? " active" : ""}`} onClick={() => setTab("feed")}>Feed</button>
        </div>
        <div className="topbar-right">
          {qvacOnline && <span className="qvac-badge">AI local</span>}
          <WalletMultiButton />
        </div>
      </div>

      {/* ── REGISTER TAB ── */}
      {tab === "register" && (
        <>
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
              <input ref={inputRef} type="file" style={{ display: "none" }}
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])} />
            </div>
            {fileHash && <div className="hash-display">SHA-256: {fileHash}</div>}
          </div>

          {file && (
            <div className="card">
              <h2>2. Analysis Metadata</h2>

              {qvacOnline && (
                <button
                  className="btn-ai"
                  disabled={suggesting}
                  onClick={suggestWithAI}
                  title="Uses local Llama 3.2 1B via QVAC — no data leaves your machine"
                >
                  {suggesting
                    ? <><span className="spinner" />Thinking locally…</>
                    : "Suggest with AI (local)"}
                </button>
              )}

              <label className="field-label">
                Analysis Type
                <select className="select-input" value={analysisType} onChange={(e) => setAnalysisType(e.target.value)}>
                  {ANALYSIS_TYPES.map((t) => (
                    <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </label>

              <label className="field-label" style={{ marginTop: "0.75rem" }}>
                Tool
                <input type="text" className="text-input" value={toolName}
                  onChange={(e) => setToolName(e.target.value)} />
              </label>

              <label className="field-label" style={{ marginTop: "0.75rem" }}>
                Version
                <input type="text" className="text-input" value={toolVersion}
                  onChange={(e) => setToolVersion(e.target.value)} />
              </label>

              <label className="field-label" style={{ marginTop: "0.75rem" }}>
                Description (optional)
                <input type="text" className="text-input" value={description}
                  placeholder="AI-generated or manual summary"
                  onChange={(e) => setDescription(e.target.value)} />
              </label>

              <div className="file-info" style={{ marginTop: "0.75rem" }}>
                <span>{file.name}</span>
                <span>{(file.size / 1024).toFixed(1)} KB</span>
              </div>
            </div>
          )}

          {hashBytes && (
            <div className="card">
              <h2>3. Register Discovery</h2>
              <button className="btn" disabled={!wallet.publicKey || registering} onClick={registerDiscovery}>
                {registering
                  ? <><span className="spinner" />Registering…</>
                  : wallet.publicKey ? "Register on Solana" : "Connect Wallet First"}
              </button>
              {status && <p className="status">{status}</p>}
              {error  && <p className="error">{error}</p>}
            </div>
          )}

          {certificate && (
            <div className="card">
              <h2>Certificate of Discovery</h2>
              <div className="certificate">
                <div className="cert-row">
                  <span className="cert-label">Certificate ID (PDA)</span>
                  <span className="cert-value mono">{certificate.pda}</span>
                </div>
                <div className="cert-row">
                  <span className="cert-label">Transaction</span>
                  <a className="cert-value mono cert-link"
                    href={`https://explorer.solana.com/tx/${certificate.txSig}?cluster=devnet`}
                    target="_blank" rel="noreferrer">
                    {certificate.txSig.slice(0, 24)}…
                  </a>
                </div>
                <div className="cert-row">
                  <span className="cert-label">File Hash (SHA-256)</span>
                  <span className="cert-value mono">{certificate.fileHash}</span>
                </div>
                <div className="cert-row">
                  <span className="cert-label">Registered</span>
                  <span className="cert-value">{new Date(certificate.timestamp * 1000).toUTCString()}</span>
                </div>
                <div className="cert-row">
                  <span className="cert-label">Metadata</span>
                  <div className="cert-value">{renderMetadata(certificate.metadata)}</div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── VERIFY TAB ── */}
      {tab === "verify" && (
        <div className="card">
          <h2>Verify a Discovery</h2>

          <label className="field-label">
            Researcher Wallet Address
            <input type="text" className="text-input" placeholder="Solana wallet pubkey"
              value={verifyWalletInput} onChange={(e) => setVerifyWalletInput(e.target.value)} />
          </label>

          <label className="field-label" style={{ marginTop: "1rem" }}>
            File Hash (SHA-256 hex)
            <input type="text" className="text-input mono" placeholder="64-character hex string"
              value={verifyHashInput} onChange={(e) => setVerifyHashInput(e.target.value)} />
          </label>

          <div className="or-divider">— or upload the file to auto-fill hash —</div>

          <div className="drop-zone" style={{ padding: "1.25rem" }} onClick={() => verifyFileRef.current?.click()}>
            <p>Drop file here to compute hash</p>
            <input ref={verifyFileRef} type="file" style={{ display: "none" }}
              onChange={(e) => e.target.files?.[0] && handleVerifyFileSelect(e.target.files[0])} />
          </div>

          <button className="btn" style={{ marginTop: "1.25rem" }}
            disabled={verifying || !verifyHashInput || !verifyWalletInput} onClick={verifyDiscovery}>
            {verifying ? <><span className="spinner" />Verifying…</> : "Verify on Solana"}
          </button>

          {verifyError && <p className="error">{verifyError}</p>}

          {verifyResult && (
            verifyResult.found ? (
              <div className="certificate" style={{ marginTop: "1.25rem" }}>
                <div className="verify-badge valid">Verified on-chain</div>
                <div className="cert-row">
                  <span className="cert-label">Certificate ID (PDA)</span>
                  <span className="cert-value mono">{verifyResult.pda}</span>
                </div>
                <div className="cert-row">
                  <span className="cert-label">Researcher</span>
                  <span className="cert-value mono">{verifyResult.researcher}</span>
                </div>
                <div className="cert-row">
                  <span className="cert-label">Registered</span>
                  <span className="cert-value">{new Date(verifyResult.timestamp! * 1000).toUTCString()}</span>
                </div>
                <div className="cert-row">
                  <span className="cert-label">Metadata</span>
                  <div className="cert-value">{renderMetadata(verifyResult.metadata!)}</div>
                </div>
              </div>
            ) : (
              <div className="verify-badge invalid" style={{ marginTop: "1rem" }}>Not found on-chain</div>
            )
          )}
        </div>
      )}

      {/* ── FEED TAB ── */}
      {tab === "feed" && (
        <div>
          <div className="feed-header">
            <span className="feed-title">Recent Discoveries</span>
            <button className="btn-ghost" onClick={loadFeed} disabled={feedLoading}>
              {feedLoading ? <><span className="spinner spinner-sm" />Loading…</> : "Refresh"}
            </button>
          </div>

          {qvacOnline && (
            <div className="search-bar">
              <input
                type="text"
                className="text-input search-input"
                placeholder="AI semantic search — e.g. RNA cancer genomics"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSemanticSearch()}
              />
              <button className="btn-ai search-btn" disabled={searching || !searchQuery.trim()} onClick={runSemanticSearch}>
                {searching ? <span className="spinner" /> : "Search"}
              </button>
              {searchQuery && (
                <button className="btn-ghost" onClick={clearSearch}>Clear</button>
              )}
            </div>
          )}

          {feedError && <p className="error" style={{ marginBottom: "1rem" }}>{feedError}</p>}

          {feedLoading && feed.length === 0 && (
            <div className="feed-empty"><span className="spinner spinner-lg" /></div>
          )}

          {!feedLoading && feed.length === 0 && !feedError && (
            <div className="feed-empty">No discoveries registered yet.</div>
          )}

          {feed.map((entry) => (
            <div key={entry.pda} className="feed-card">
              <div className="feed-card-top">
                <span className="feed-badge">{metaField(entry.metadata, "analysis_type").replace(/_/g, " ")}</span>
                <span className="feed-date">{new Date(entry.timestamp * 1000).toLocaleDateString()}</span>
              </div>

              <div className="feed-row">
                <span className="feed-label">Researcher</span>
                <span className="feed-value mono">{truncate(entry.researcher)}</span>
              </div>
              <div className="feed-row">
                <span className="feed-label">Hash</span>
                <span className="feed-value mono">{truncate(entry.fileHash, 10)}</span>
              </div>
              <div className="feed-row">
                <span className="feed-label">Tool</span>
                <span className="feed-value">{metaField(entry.metadata, "tool")} {metaField(entry.metadata, "version")}</span>
              </div>
              {metaField(entry.metadata, "description") !== "—" && (
                <div className="feed-row">
                  <span className="feed-label">Description</span>
                  <span className="feed-value">{metaField(entry.metadata, "description")}</span>
                </div>
              )}
              {entry._score !== undefined && (
                <div className="feed-row">
                  <span className="feed-label">AI relevance</span>
                  <span className="feed-value feed-score">{(entry._score * 100).toFixed(0)}%</span>
                </div>
              )}

              <a
                className="feed-explorer-link"
                href={`https://explorer.solana.com/address/${entry.pda}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
              >
                View certificate →
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

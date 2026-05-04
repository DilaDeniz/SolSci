import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import idl from "../idl/solsci.json";

const PROGRAM_ID    = new PublicKey((idl as any).address);
const QVAC_BASE_URL = "http://localhost:3001";
const META_LIMIT    = 512;
const IS_MOBILE     = /iPhone|iPad|Android|Mobile/i.test(navigator.userAgent);

const ANALYSIS_TYPES = [
  // Life sciences
  "whole_genome_sequencing",
  "rna_sequencing",
  "single_cell_sequencing",
  "proteomics",
  "metabolomics",
  "metagenomics",
  "epigenomics",
  "chip_seq",
  "neuroscience",
  "ecology",
  "clinical_trial",
  // Physical sciences
  "spectroscopy",
  "crystallography",
  "particle_physics",
  "astrophysics",
  "atmospheric_science",
  "ocean_science",
  "quantum_experiment",
  // Computational
  "machine_learning",
  "benchmark",
  "simulation",
  "dataset",
  // Other
  "chemistry",
  "materials_science",
  "social_science",
  "economics",
  "experiment",
  "other",
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

function typeLabel(t: string) {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function readTextSample(file: File, bytes = 4096): Promise<string> {
  const slice = file.slice(0, bytes);
  const buf   = await slice.arrayBuffer();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
  catch { return ""; }
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function byteLen(s: string) {
  return new TextEncoder().encode(s).length;
}

function readonlyWallet(pk: PublicKey) {
  return {
    publicKey:           pk,
    signTransaction:     async (t: any) => t,
    signAllTransactions: async (ts: any) => ts,
  };
}

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

// ── Copy hook ─────────────────────────────────────────────────────────────────

function useCopy() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    });
  }, []);
  return { copy, copiedKey };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { connection } = useConnection();
  const wallet         = useWallet();
  const [tab, setTab]  = useState<Tab>("register");
  const { copy, copiedKey } = useCopy();

  // ── QVAC health ───────────────────────────────────────────────────────────
  const [qvacOnline, setQvacOnline] = useState(false);
  useEffect(() => {
    fetch(`${QVAC_BASE_URL}/api/health`, { signal: AbortSignal.timeout(600) })
      .then((r) => setQvacOnline(r.ok))
      .catch(() => setQvacOnline(false));
  }, []);

  // ── Register state ────────────────────────────────────────────────────────
  const [file, setFile]               = useState<File | null>(null);
  const [fileHash, setFileHash]       = useState("");
  const [hashBytes, setHashBytes]     = useState<Uint8Array | null>(null);
  const [analysisType, setAnalysisType] = useState("experiment");
  const [toolName, setToolName]       = useState("");
  const [toolVersion, setToolVersion] = useState("");
  const [description, setDescription] = useState("");
  const [publicUrl, setPublicUrl]     = useState("");
  const [status, setStatus]           = useState("");
  const [error, setError]             = useState("");
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [registering, setRegistering] = useState(false);
  const [dragging, setDragging]       = useState(false);
  const [suggesting, setSuggesting]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── STT state ────────────────────────────────────────────────────────────
  const [recording, setRecording]     = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef   = useRef<BlobPart[]>([]);

  // ── OCR state ────────────────────────────────────────────────────────────
  const [ocrRunning, setOcrRunning]   = useState(false);
  const [ocrText, setOcrText]         = useState("");

  // ── Verify state ──────────────────────────────────────────────────────────
  const [verifyHash,    setVerifyHash]    = useState("");
  const [verifyWallet,  setVerifyWallet]  = useState("");
  const [verifyResult,  setVerifyResult]  = useState<VerifyResult | null>(null);
  const [verifyError,   setVerifyError]   = useState("");
  const [verifying,     setVerifying]     = useState(false);
  const [fetchVerifying, setFetchVerifying] = useState(false);
  const verifyFileRef = useRef<HTMLInputElement>(null);

  // ── Feed state ────────────────────────────────────────────────────────────
  const [feed,        setFeed]        = useState<FeedEntry[]>([]);
  const [feedRaw,     setFeedRaw]     = useState<FeedEntry[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError,   setFeedError]   = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searching,   setSearching]   = useState(false);

  // ── Live metadata byte count ──────────────────────────────────────────────
  const metadataBytes = useMemo(() => {
    const obj = {
      analysis_type: analysisType,
      ...(toolName    ? { tool: toolName }       : {}),
      ...(toolVersion ? { version: toolVersion } : {}),
      ...(description ? { description }          : {}),
      ...(file ? { file_name: file.name, file_size_bytes: file.size } : {}),
    };
    return byteLen(JSON.stringify(obj));
  }, [analysisType, toolName, toolVersion, description, file]);

  // ── Core helpers ──────────────────────────────────────────────────────────

  async function hashFile(f: File): Promise<Uint8Array> {
    const buf = await f.arrayBuffer();
    return new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
  }

  function bytesToHex(b: Uint8Array) {
    return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
  }

  const getProgram = useCallback(() => {
    const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
    return new Program(idl as Idl, provider);
  }, [connection, wallet]);

  function metaField(metaStr: string, key: string): string {
    try { return JSON.parse(metaStr)[key] ?? ""; }
    catch { return ""; }
  }

  function renderMeta(metaStr: string) {
    try {
      const obj = JSON.parse(metaStr);
      return (
        <dl className="meta-dl">
          {Object.entries(obj).filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="meta-row">
              <dt>{k.replace(/_/g, " ")}</dt>
              <dd>{String(v)}</dd>
            </div>
          ))}
        </dl>
      );
    } catch {
      return <span>{metaStr}</span>;
    }
  }

  // ── QVAC: AI metadata suggest ────────────────────────────────────────────

  const suggestWithAI = useCallback(async (overrideSample?: string) => {
    if (!file || !qvacOnline) return;
    setSuggesting(true);
    setError("");
    try {
      const fileSample = overrideSample ?? await readTextSample(file);
      const res = await fetch(`${QVAC_BASE_URL}/api/suggest`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ fileName: file.name, fileSample }),
      });
      const s = await res.json();
      if (s.analysis_type) setAnalysisType(s.analysis_type);
      if (s.tool)          setToolName(s.tool);
      if (s.version)       setToolVersion(s.version);
      if (s.description)   setDescription(s.description);
    } catch (e: any) {
      setError(`AI suggest failed: ${e.message}`);
    } finally {
      setSuggesting(false);
    }
  }, [file, qvacOnline]);

  // ── QVAC: Speech-to-text ────────────────────────────────────────────────

  const toggleRecording = useCallback(async () => {
    if (recording) {
      // Stop recording → send to Whisper
      mediaRecorderRef.current?.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr     = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setTranscribing(true);
        try {
          const blob   = new Blob(audioChunksRef.current, { type: mr.mimeType });
          const ab     = await blob.arrayBuffer();
          const b64    = btoa(String.fromCharCode(...new Uint8Array(ab)));
          const res    = await fetch(`${QVAC_BASE_URL}/api/transcribe`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ audio: b64 }),
          });
          const { text } = await res.json();
          if (text) setDescription((prev) => prev ? `${prev} ${text}` : text);
        } catch (e: any) {
          setError(`Transcription failed: ${e.message}`);
        } finally {
          setTranscribing(false);
        }
      };

      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch (e: any) {
      setError(`Microphone access denied: ${e.message}`);
    }
  }, [recording]);

  // ── QVAC: OCR → then AI suggest ─────────────────────────────────────────

  const runOcrAndSuggest = useCallback(async () => {
    if (!file || !qvacOnline) return;
    setOcrRunning(true);
    setError("");
    try {
      const b64 = await fileToBase64(file);
      const res = await fetch(`${QVAC_BASE_URL}/api/ocr`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ image: b64 }),
      });
      const { text, error: ocrErr } = await res.json();
      if (ocrErr) throw new Error(ocrErr);
      setOcrText(text ?? "");
      // Feed OCR'd text into AI suggest as the file sample
      await suggestWithAI(text ?? "");
    } catch (e: any) {
      setError(`OCR failed: ${e.message}`);
    } finally {
      setOcrRunning(false);
    }
  }, [file, qvacOnline, suggestWithAI]);

  // ── Register ──────────────────────────────────────────────────────────────

  const handleFileSelect = useCallback(async (f: File) => {
    setFile(f);
    setFileHash("");
    setHashBytes(null);
    setCertificate(null);
    setError("");
    setOcrText("");
    setPublicUrl("");
    setStatus("Hashing…");
    try {
      const bytes = await hashFile(f);
      setHashBytes(bytes);
      setFileHash(bytesToHex(bytes));
      setStatus("");
    } catch {
      setError("Failed to hash file.");
      setStatus("");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]);
  }, [handleFileSelect]);

  const registerDiscovery = useCallback(async () => {
    if (!wallet.publicKey || !hashBytes || !file) return;
    setError("");
    setRegistering(true);
    setStatus("Building transaction…");
    try {
      const program  = getProgram();
      const metadata = JSON.stringify({
        analysis_type: analysisType,
        ...(toolName    ? { tool: toolName }       : {}),
        ...(toolVersion ? { version: toolVersion } : {}),
        ...(description ? { description }          : {}),
        ...(publicUrl   ? { url: publicUrl }       : {}),
        file_name:       file.name,
        file_size_bytes: file.size,
      });

      if (byteLen(metadata) > META_LIMIT) {
        setError("Metadata too long (> 512 bytes). Shorten description or file name.");
        setRegistering(false);
        setStatus("");
        return;
      }

      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("discovery"), wallet.publicKey.toBuffer(), Buffer.from(hashBytes)],
        PROGRAM_ID
      );

      setStatus("Waiting for wallet approval…");
      const txSig = await (program.methods as any)
        .registerDiscovery(Array.from(hashBytes), metadata)
        .accounts({ researcher: wallet.publicKey, discoveryRecord: pda, systemProgram: SystemProgram.programId })
        .rpc({ commitment: "confirmed" });

      setStatus("Confirming…");
      const record = await (program.account as any).discoveryRecord.fetch(pda);
      setCertificate({ pda: pda.toBase58(), txSig, fileHash, timestamp: record.timestamp.toNumber(), metadata });
      setStatus("");
    } catch (e: any) {
      setError(e?.message ?? "Transaction failed.");
      setStatus("");
    } finally {
      setRegistering(false);
    }
  }, [wallet.publicKey, hashBytes, file, analysisType, toolName, toolVersion, description, fileHash, getProgram]);

  // ── Verify ────────────────────────────────────────────────────────────────

  const handleVerifyFileSelect = useCallback(async (f: File) => {
    const bytes = await hashFile(f);
    setVerifyHash(bytesToHex(bytes));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const runVerify = useCallback(async () => {
    setVerifyError("");
    setVerifyResult(null);
    const hashHex = verifyHash.trim().toLowerCase();
    if (hashHex.length !== 64 || !/^[0-9a-f]+$/.test(hashHex)) {
      setVerifyError("Paste a valid 64-character hex hash.");
      return;
    }
    let researcherKey: PublicKey;
    try { researcherKey = new PublicKey(verifyWallet.trim()); }
    catch { setVerifyError("Invalid wallet address."); return; }

    setVerifying(true);
    try {
      const provider = new AnchorProvider(
        connection,
        wallet.publicKey ? (wallet as any) : readonlyWallet(researcherKey),
        { commitment: "confirmed" }
      );
      const program = new Program(idl as Idl, provider);
      const [pda]   = PublicKey.findProgramAddressSync(
        [Buffer.from("discovery"), researcherKey.toBuffer(), Buffer.from(hashHex, "hex")],
        PROGRAM_ID
      );
      const record = await (program.account as any).discoveryRecord.fetch(pda);
      setVerifyResult({ found: true, pda: pda.toBase58(), researcher: record.researcher.toBase58(), timestamp: record.timestamp.toNumber(), metadata: record.metadata });
    } catch (e: any) {
      if (e?.message?.includes("Account does not exist")) setVerifyResult({ found: false });
      else setVerifyError(e?.message ?? "Verification failed.");
    } finally {
      setVerifying(false);
    }
  }, [verifyHash, verifyWallet, connection, wallet]);

  // Auto-fetch file from URL in record metadata, hash it, compare to stored hash
  const fetchAndVerify = useCallback(async (recordUrl: string, storedHash: string, researcherAddr: string) => {
    setFetchVerifying(true);
    setVerifyError("");
    try {
      const res  = await fetch(recordUrl);
      if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
      const buf  = await res.arrayBuffer();
      const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
      const hex  = Array.from(hash).map((x) => x.toString(16).padStart(2, "0")).join("");
      if (hex !== storedHash) {
        setVerifyError(`Hash mismatch — file at URL does not match on-chain record.\nExpected: ${storedHash}\nGot: ${hex}`);
      } else {
        setVerifyHash(hex);
        setVerifyWallet(researcherAddr);
      }
    } catch (e: any) {
      setVerifyError(`Could not fetch file: ${e.message}`);
    } finally {
      setFetchVerifying(false);
    }
  }, []);

  // ── Feed ──────────────────────────────────────────────────────────────────

  const loadFeed = useCallback(async () => {
    setFeedLoading(true);
    setFeedError("");
    setSearchQuery("");
    try {
      const pk = wallet.publicKey ?? PublicKey.default;
      const provider = new AnchorProvider(
        connection,
        wallet.publicKey ? (wallet as any) : readonlyWallet(pk),
        { commitment: "confirmed" }
      );
      const program  = new Program(idl as Idl, provider);
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
      setFeedError(e?.message ?? "Failed to load.");
    } finally {
      setFeedLoading(false);
    }
  }, [connection, wallet]);

  const runSemanticSearch = useCallback(async () => {
    if (!searchQuery.trim() || !qvacOnline) return;
    setSearching(true);
    try {
      const res = await fetch(`${QVAC_BASE_URL}/api/search`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ query: searchQuery, discoveries: feedRaw }),
      });
      setFeed(await res.json());
    } catch (e: any) {
      setFeedError(`AI search failed: ${e.message}`);
    } finally {
      setSearching(false);
    }
  }, [searchQuery, qvacOnline, feedRaw]);

  useEffect(() => { if (tab === "feed") loadFeed(); }, [tab]); // eslint-disable-line

  // ── Derived ───────────────────────────────────────────────────────────────

  const metaOver  = metadataBytes > META_LIMIT;
  const metaPct   = Math.min(metadataBytes / META_LIMIT, 1);
  const fileIsImg = file ? isImageFile(file) : false;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="app">

      {/* ── Header ── */}
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-mark">◈</span>
            <span className="logo-text">SolSci</span>
            <span className="logo-tag">devnet</span>
          </div>
          <div className="header-right">
            {qvacOnline && <span className="pill pill-green">AI local</span>}
            <WalletMultiButton />
          </div>
        </div>
      </header>

      {/* ── Mobile notice ── */}
      {IS_MOBILE && !wallet.connected && (
        <div className="notice">
          <strong>Mobile:</strong> open this URL inside the <strong>Phantom</strong> or <strong>Solflare</strong> app browser, or connect via the button above.
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="tabs-bar">
        {(["register", "verify", "feed"] as Tab[]).map((t) => (
          <button key={t} className={`tab-btn${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <main className="main">

        {/* ══════════════ REGISTER ══════════════ */}
        {tab === "register" && (
          <div className="pane">
            <h2 className="pane-title">Register a discovery</h2>
            <p className="pane-sub">Any research output — data files, code, results, documents, images. The file stays on your device; only its SHA-256 hash is stored on Solana.</p>

            {/* Step 1 — file */}
            <div className="step">
              <div className="step-head">
                <span className="step-num">1</span>
                <span className="step-label">Select file</span>
              </div>
              <div
                className={`dropzone${dragging ? " over" : ""}${file ? " has-file" : ""}`}
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
              >
                <input ref={inputRef} type="file" style={{ display: "none" }}
                  onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])} />
                {file ? (
                  <div className="dropzone-file">
                    <span className="file-icon">{fileIsImg ? "🖼️" : "📄"}</span>
                    <div>
                      <div className="file-name">{file.name}</div>
                      <div className="file-size">{(file.size / 1024).toFixed(1)} KB{fileIsImg ? " · image" : ""}</div>
                    </div>
                  </div>
                ) : (
                  <div className="dropzone-empty">
                    <span className="drop-icon">↑</span>
                    <span>Drop any research file here, or tap to browse</span>
                    <span className="drop-hint">PDF, CSV, JSON, images, code — anything · Images support OCR</span>
                  </div>
                )}
              </div>
              {fileHash && (
                <div className="hash-box">
                  <span className="hash-label">SHA-256</span>
                  <span className="hash-val">{fileHash}</span>
                  <button className="copy-btn" title="Copy hash"
                    onClick={() => copy(fileHash, "hash")}>
                    {copiedKey === "hash" ? "✓" : "⎘"}
                  </button>
                </div>
              )}
            </div>

            {/* Step 2 — metadata */}
            {file && (
              <div className="step">
                <div className="step-head">
                  <span className="step-num">2</span>
                  <span className="step-label">Describe your research</span>
                  {qvacOnline && (
                    <div className="step-actions">
                      {fileIsImg ? (
                        /* Image file: OCR → AI suggest */
                        <button className="btn-ai" disabled={ocrRunning || suggesting} onClick={runOcrAndSuggest}>
                          {ocrRunning
                            ? <><span className="spin" /> Reading…</>
                            : suggesting
                            ? <><span className="spin" /> Thinking…</>
                            : "✦ OCR + AI suggest"}
                        </button>
                      ) : (
                        /* Non-image: regular AI suggest */
                        <button className="btn-ai" disabled={suggesting} onClick={() => suggestWithAI()}>
                          {suggesting ? <><span className="spin" /> Thinking…</> : "✦ Suggest with AI"}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* OCR result preview */}
                {ocrText && (
                  <div className="ocr-preview">
                    <span className="ocr-label">OCR extracted</span>
                    <span className="ocr-snippet">{ocrText.slice(0, 200)}{ocrText.length > 200 ? "…" : ""}</span>
                  </div>
                )}

                <div className="fields">
                  <label className="field">
                    <span>Research type</span>
                    <select value={analysisType} onChange={(e) => setAnalysisType(e.target.value)}>
                      {ANALYSIS_TYPES.map((t) => (
                        <option key={t} value={t}>{typeLabel(t)}</option>
                      ))}
                    </select>
                  </label>

                  <div className="field-row">
                    <label className="field">
                      <span>Tool / software</span>
                      <input type="text" value={toolName} placeholder="e.g. Python, R, MATLAB" onChange={(e) => setToolName(e.target.value)} />
                    </label>
                    <label className="field">
                      <span>Version</span>
                      <input type="text" value={toolVersion} placeholder="e.g. 3.11.0" onChange={(e) => setToolVersion(e.target.value)} />
                    </label>
                  </div>

                  {/* Description with mic button */}
                  <label className="field">
                    <span>Description <span className="field-opt">(optional)</span></span>
                    <div className="desc-row">
                      <input
                        type="text"
                        value={description}
                        placeholder="One sentence about what this output contains"
                        onChange={(e) => setDescription(e.target.value)}
                      />
                      {qvacOnline && (
                        <button
                          className={`mic-btn${recording ? " recording" : ""}${transcribing ? " transcribing" : ""}`}
                          title={recording ? "Stop recording" : "Record description (Whisper STT)"}
                          disabled={transcribing}
                          onClick={toggleRecording}
                        >
                          {transcribing
                            ? <span className="spin spin-sm" />
                            : recording
                            ? <MicIcon active />
                            : <MicIcon />}
                        </button>
                      )}
                    </div>
                    {recording && (
                      <div className="mic-hint">
                        <span className="rec-dot" /> Recording… tap again to stop
                      </div>
                    )}
                    {transcribing && (
                      <div className="mic-hint">Transcribing with Whisper…</div>
                    )}
                  </label>

                  <label className="field">
                    <span>Public file URL <span className="field-opt">(optional — lets others auto-verify)</span></span>
                    <input
                      type="url"
                      value={publicUrl}
                      placeholder="https://github.com/you/repo/blob/main/results.csv"
                      onChange={(e) => setPublicUrl(e.target.value)}
                    />
                  </label>

                  {/* Live byte counter */}
                  <div className="meta-counter">
                    <div className="meta-bar">
                      <div className="meta-bar-fill" style={{
                        width: `${metaPct * 100}%`,
                        background: metaOver ? "#f87171" : metaPct > 0.8 ? "#fbbf24" : "#14f195"
                      }} />
                    </div>
                    <span className={`meta-count${metaOver ? " over" : ""}`}>
                      {metadataBytes} / {META_LIMIT} bytes
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3 — register */}
            {hashBytes && (
              <div className="step">
                <div className="step-head">
                  <span className="step-num">3</span>
                  <span className="step-label">Register on Solana</span>
                </div>

                {!wallet.connected ? (
                  <div className="wallet-prompt">
                    <p>Connect your wallet to sign the transaction.</p>
                    <WalletMultiButton />
                  </div>
                ) : (
                  <button className="btn-primary" disabled={registering || metaOver} onClick={registerDiscovery}>
                    {registering ? <><span className="spin" />{status || "Registering…"}</> : "Register discovery →"}
                  </button>
                )}

                {status && !registering && <p className="msg-info">{status}</p>}
                {error  && <p className="msg-error">{error}</p>}
              </div>
            )}

            {/* Certificate */}
            {certificate && (
              <div className="cert">
                <div className="cert-header">
                  <span className="cert-icon">✓</span>
                  <span>Certificate of Discovery</span>
                </div>
                <div className="cert-body">
                  <CertRow label="Certificate (PDA)" value={certificate.pda} mono
                    onCopy={() => copy(certificate.pda, "pda")} copied={copiedKey === "pda"} />
                  <CertRow label="Transaction"
                    value={<a href={`https://explorer.solana.com/tx/${certificate.txSig}?cluster=devnet`} target="_blank" rel="noreferrer">{certificate.txSig.slice(0, 20)}… ↗</a>}
                    onCopy={() => copy(certificate.txSig, "tx")} copied={copiedKey === "tx"} />
                  <CertRow label="File hash" value={certificate.fileHash} mono
                    onCopy={() => copy(certificate.fileHash, "cert-hash")} copied={copiedKey === "cert-hash"} />
                  <CertRow label="Timestamp" value={new Date(certificate.timestamp * 1000).toUTCString()} />
                  <CertRow label="Metadata" value={renderMeta(certificate.metadata)} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════ VERIFY ══════════════ */}
        {tab === "verify" && (
          <div className="pane">
            <h2 className="pane-title">Verify a discovery</h2>
            <p className="pane-sub">Check whether a file's hash exists on-chain. Paste the hash or drop the original file.</p>

            <div className="fields">
              <label className="field">
                <span>Researcher wallet address</span>
                <input type="text" value={verifyWallet} placeholder="Solana public key" onChange={(e) => setVerifyWallet(e.target.value)} />
              </label>
              <label className="field">
                <span>File hash (SHA-256 hex)</span>
                <input type="text" className="mono" value={verifyHash} placeholder="64-character hex" onChange={(e) => setVerifyHash(e.target.value)} />
              </label>
            </div>

            <div className="divider">— or drop the file to auto-fill hash —</div>

            <div className="dropzone small" onClick={() => verifyFileRef.current?.click()}>
              <input ref={verifyFileRef} type="file" style={{ display: "none" }}
                onChange={(e) => e.target.files?.[0] && handleVerifyFileSelect(e.target.files[0])} />
              <span>↑ Drop file here</span>
            </div>

            <button className="btn-primary" style={{ marginTop: "1.25rem" }}
              disabled={verifying || !verifyHash || !verifyWallet} onClick={runVerify}>
              {verifying ? <><span className="spin" />Verifying…</> : "Verify →"}
            </button>

            {verifyError && <p className="msg-error">{verifyError}</p>}

            {verifyResult && (
              verifyResult.found ? (
                <div className="cert" style={{ marginTop: "1.5rem" }}>
                  <div className="cert-header valid">
                    <span className="cert-icon">✓</span>
                    <span>Verified on-chain</span>
                  </div>
                  <div className="cert-body">
                    <CertRow label="Certificate (PDA)" value={verifyResult.pda!} mono
                      onCopy={() => copy(verifyResult.pda!, "v-pda")} copied={copiedKey === "v-pda"} />
                    <CertRow label="Researcher" value={verifyResult.researcher!} mono
                      onCopy={() => copy(verifyResult.researcher!, "v-res")} copied={copiedKey === "v-res"} />
                    <CertRow label="Registered" value={new Date(verifyResult.timestamp! * 1000).toUTCString()} />
                    <CertRow label="Metadata" value={renderMeta(verifyResult.metadata!)} />
                  </div>
                  {/* Auto-verify from URL if researcher included one */}
                  {metaField(verifyResult.metadata!, "url") && (
                    <div className="fetch-verify-row">
                      <span className="fetch-verify-hint">
                        File URL on record —
                      </span>
                      <a
                        href={metaField(verifyResult.metadata!, "url")}
                        target="_blank" rel="noreferrer"
                        className="fetch-verify-link"
                      >
                        {metaField(verifyResult.metadata!, "url").slice(0, 50)}…
                      </a>
                      <button
                        className="btn-ai"
                        disabled={fetchVerifying}
                        onClick={() => fetchAndVerify(
                          metaField(verifyResult!.metadata!, "url"),
                          verifyHash,
                          verifyResult!.researcher!,
                        )}
                      >
                        {fetchVerifying
                          ? <><span className="spin" /> Fetching…</>
                          : "↓ Fetch file & verify hash"}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="not-found">No record found on-chain for this hash + wallet.</div>
              )
            )}
          </div>
        )}

        {/* ══════════════ FEED ══════════════ */}
        {tab === "feed" && (
          <div className="pane">
            <div className="feed-top">
              <h2 className="pane-title" style={{ margin: 0 }}>Discoveries</h2>
              <button className="btn-ghost" onClick={loadFeed} disabled={feedLoading}>
                {feedLoading ? <><span className="spin spin-sm" />Loading</> : "Refresh"}
              </button>
            </div>

            {qvacOnline && (
              <div className="search-row">
                <input type="text" className="search-input" value={searchQuery}
                  placeholder="AI semantic search — e.g. RNA cancer genomics"
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runSemanticSearch()} />
                <button className="btn-ai" disabled={searching || !searchQuery.trim()} onClick={runSemanticSearch}>
                  {searching ? <span className="spin" /> : "Search"}
                </button>
                {searchQuery && <button className="btn-ghost" onClick={() => { setSearchQuery(""); setFeed(feedRaw); }}>Clear</button>}
              </div>
            )}

            {feedError && <p className="msg-error">{feedError}</p>}

            {feedLoading && feed.length === 0 && (
              <div className="feed-empty"><span className="spin spin-lg" /></div>
            )}
            {!feedLoading && feed.length === 0 && !feedError && (
              <div className="feed-empty">No discoveries registered yet.</div>
            )}

            <div className="feed-list">
              {feed.map((entry) => {
                const type = metaField(entry.metadata, "analysis_type");
                const tool = metaField(entry.metadata, "tool");
                const ver  = metaField(entry.metadata, "version");
                const desc = metaField(entry.metadata, "description");
                return (
                  <div key={entry.pda} className="feed-card">
                    <div className="feed-card-top">
                      {type && <span className="pill pill-purple">{typeLabel(type)}</span>}
                      <span className="feed-date">{new Date(entry.timestamp * 1000).toLocaleDateString()}</span>
                      {entry._score !== undefined && (
                        <span className="pill pill-green">{(entry._score * 100).toFixed(0)}% match</span>
                      )}
                    </div>
                    {desc && <p className="feed-desc">{desc}</p>}
                    <div className="feed-meta">
                      <FeedMeta label="Researcher" value={truncate(entry.researcher)} mono />
                      <FeedMeta label="Hash" value={truncate(entry.fileHash, 10)} mono />
                      {(tool || ver) && <FeedMeta label="Tool" value={[tool, ver].filter(Boolean).join(" ")} />}
                    </div>
                    <div className="feed-card-footer">
                      <a className="feed-link" href={`https://explorer.solana.com/address/${entry.pda}?cluster=devnet`} target="_blank" rel="noreferrer">
                        View certificate ↗
                      </a>
                      {metaField(entry.metadata, "url") && (
                        <a className="feed-link" href={metaField(entry.metadata, "url")} target="_blank" rel="noreferrer">
                          Source file ↗
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MicIcon({ active }: { active?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={active ? "#f87171" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="17" x2="12" y2="22" />
      <line x1="8"  y1="22" x2="16" y2="22" />
    </svg>
  );
}

function CertRow({
  label, value, mono, onCopy, copied
}: {
  label: string; value: any; mono?: boolean; onCopy?: () => void; copied?: boolean;
}) {
  return (
    <div className="cert-row">
      <span className="cert-key">{label}</span>
      <span className={`cert-val${mono ? " mono" : ""}`}>{value}</span>
      {onCopy && (
        <button className="copy-btn" title="Copy" onClick={onCopy}>
          {copied ? "✓" : "⎘"}
        </button>
      )}
    </div>
  );
}

function FeedMeta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="feed-meta-row">
      <span className="feed-meta-key">{label}</span>
      <span className={`feed-meta-val${mono ? " mono" : ""}`}>{value}</span>
    </div>
  );
}

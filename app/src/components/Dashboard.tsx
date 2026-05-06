import React, { useEffect, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { IS_MOBILE, META_LIMIT, ANALYSIS_TYPES, QVAC_BASE_URL } from "../lib/constants";
import type { Tab } from "../lib/constants";
import { buildShareUrl, bytesToHex, hashFile, metaField, requestAirdrop, truncate, typeLabel } from "../lib/utils";
import {
  CertRow, DemoWalkthrough, FeedMeta, IpfsIcon, MicIcon, OrcidInline,
  TranslateIcon, Tutorial, renderMeta, useCopy,
} from "./ui";
import { useRegister } from "../hooks/useRegister";
import { useVerify }   from "../hooks/useVerify";
import { useFeed }     from "../hooks/useFeed";

export default function Dashboard() {
  const { connection } = useConnection();
  const wallet         = useWallet();
  const [tab, setTab]  = useState<Tab>("register");
  const { copy, copiedKey } = useCopy();

  const [qvacOnline,   setQvacOnline]   = useState(false);
  const [airdropping,  setAirdropping]  = useState(false);
  const [airdropMsg,   setAirdropMsg]   = useState("");

  useEffect(() => {
    fetch(`${QVAC_BASE_URL}/api/health`, { signal: AbortSignal.timeout(600) })
      .then((r) => setQvacOnline(r.ok))
      .catch(() => setQvacOnline(false));
  }, []);

  const handleAirdrop = async () => {
    if (!wallet.publicKey) return;
    setAirdropping(true);
    setAirdropMsg("");
    try {
      await requestAirdrop(connection as any, wallet.publicKey);
      setAirdropMsg("2 SOL airdrop alındı ✓");
      setTimeout(() => setAirdropMsg(""), 3000);
    } catch {
      setAirdropMsg("Airdrop başarısız — devnet kalabalık, tekrar dene");
      setTimeout(() => setAirdropMsg(""), 4000);
    } finally {
      setAirdropping(false);
    }
  };

  const reg    = useRegister(connection, wallet, qvacOnline);
  const ver    = useVerify(connection, wallet);
  const feed   = useFeed(connection, wallet, qvacOnline);

  const loadDemo = async () => {
    const res     = await fetch("/demo/rna_seq_demo.csv");
    const text    = await res.text();
    const blob    = new Blob([text], { type: "text/csv" });
    const file    = new File([blob], "rna_seq_demo.csv", { type: "text/csv" });
    await reg.handleFileSelect(file);
    reg.setAnalysisType("rna_sequencing");
    reg.setToolName("DESeq2");
    reg.setToolVersion("1.42.0");
    reg.setDescription("Differential expression analysis of cancer suppressor genes in breast tissue samples");
    setTab("register");
  };

  // Walkthrough step handler — drives tab switches in sync with overlay
  const handleWalkStep = async (step: number) => {
    if (step === 0) { await loadDemo(); }
    if (step === 2) { setTab("register"); }
    if (step === 3) {
      setTab("verify");
      // pre-fill verify with demo hash so the form looks ready
      ver.setVerifyWallet(wallet.publicKey?.toBase58() ?? "");
    }
    if (step === 4) { setTab("feed"); feed.loadFeed(); }
    if (step === -1) { setTab("register"); }
  };

  const verifyFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (tab === "feed") feed.loadFeed(); }, [tab]); // eslint-disable-line

  // Auto-fill verify form from share URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash   = params.get("hash");
    const wallet = params.get("wallet");
    if (hash && wallet) {
      ver.setVerifyHash(hash);
      ver.setVerifyWallet(wallet);
      setTab("verify");
    }
  }, []); // eslint-disable-line

  const metaOver = reg.metadataBytes > META_LIMIT;
  const metaPct  = Math.min(reg.metadataBytes / META_LIMIT, 1);

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
            <button className="btn-demo" onClick={loadDemo} title="Demo veriyi yükle ve formu doldur">
              ✦ Demo
            </button>
            <DemoWalkthrough onStep={handleWalkStep} />
            {wallet.connected && (
              <button className="btn-ghost airdrop-btn" disabled={airdropping} onClick={handleAirdrop} title="Devnet airdrop — 2 SOL">
                {airdropping ? <><span className="spin spin-sm" /> Airdrop…</> : "⬇ 2 SOL"}
              </button>
            )}
            <WalletMultiButton />
          </div>
          {airdropMsg && <div className="airdrop-toast">{airdropMsg}</div>}
        </div>
      </header>

      {IS_MOBILE && !wallet.connected && (
        <div className="notice">
          <strong>Mobile:</strong> open this URL inside the <strong>Phantom</strong> or <strong>Solflare</strong> app browser, or connect via the button above.
        </div>
      )}

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

            <Tutorial />

            {/* Step 1 — file */}
            <div className="step">
              <div className="step-head">
                <span className="step-num">1</span>
                <span className="step-label">Select file</span>
              </div>
              <div
                className={`dropzone${reg.dragging ? " over" : ""}${reg.file ? " has-file" : ""}`}
                onClick={() => reg.inputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); reg.setDragging(true); }}
                onDragLeave={() => reg.setDragging(false)}
                onDrop={(e) => { e.preventDefault(); reg.setDragging(false); if (e.dataTransfer.files[0]) reg.handleFileSelect(e.dataTransfer.files[0]); }}
              >
                <input ref={reg.inputRef} type="file" style={{ display: "none" }}
                  onChange={(e) => e.target.files?.[0] && reg.handleFileSelect(e.target.files[0])} />
                {reg.file ? (
                  <div className="dropzone-file">
                    <span className="file-icon">{reg.fileIsImg ? "🖼️" : "📄"}</span>
                    <div>
                      <div className="file-name">{reg.file.name}</div>
                      <div className="file-size">{(reg.file.size / 1024).toFixed(1)} KB{reg.fileIsImg ? " · image" : ""}</div>
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
              {reg.fileHash && (
                <div className="hash-box">
                  <span className="hash-label">SHA-256</span>
                  <span className="hash-val">{reg.fileHash}</span>
                  <button className="copy-btn" title="Copy hash" onClick={() => copy(reg.fileHash, "hash")}>
                    {copiedKey === "hash" ? "✓" : "⎘"}
                  </button>
                </div>
              )}
            </div>

            {/* Step 2 — metadata */}
            {reg.file && (
              <div className="step">
                <div className="step-head">
                  <span className="step-num">2</span>
                  <span className="step-label">Describe your research</span>
                  {qvacOnline && (
                    <div className="step-actions">
                      {reg.fileIsImg ? (
                        <button className="btn-ai" disabled={reg.ocrRunning || reg.suggesting} onClick={reg.runOcrAndSuggest}>
                          {reg.ocrRunning ? <><span className="spin" /> Reading…</>
                            : reg.suggesting ? <><span className="spin" /> Thinking…</>
                            : "✦ OCR + AI suggest"}
                        </button>
                      ) : (
                        <button className="btn-ai" disabled={reg.suggesting} onClick={() => reg.suggestWithAI()}>
                          {reg.suggesting ? <><span className="spin" /> Thinking…</> : "✦ Suggest with AI"}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {reg.ocrText && (
                  <div className="ocr-preview">
                    <span className="ocr-label">OCR extracted</span>
                    <span className="ocr-snippet">{reg.ocrText.slice(0, 200)}{reg.ocrText.length > 200 ? "…" : ""}</span>
                  </div>
                )}

                <div className="fields">
                  <label className="field">
                    <span>Research type</span>
                    <select value={reg.analysisType} onChange={(e) => reg.setAnalysisType(e.target.value)}>
                      {ANALYSIS_TYPES.map((t) => (
                        <option key={t} value={t}>{typeLabel(t)}</option>
                      ))}
                    </select>
                  </label>

                  <div className="field-row">
                    <label className="field">
                      <span>Tool / software</span>
                      <input type="text" value={reg.toolName} placeholder="e.g. Python, R, MATLAB" onChange={(e) => reg.setToolName(e.target.value)} />
                    </label>
                    <label className="field">
                      <span>Version</span>
                      <input type="text" value={reg.toolVersion} placeholder="e.g. 3.11.0" onChange={(e) => reg.setToolVersion(e.target.value)} />
                    </label>
                  </div>

                  <label className="field">
                    <span>Description <span className="field-opt">(optional — any language, translate ↔ EN on-device)</span></span>
                    <div className="desc-row">
                      <input type="text" value={reg.description} placeholder="One sentence about what this output contains"
                        onChange={(e) => reg.setDescription(e.target.value)} />
                      {qvacOnline && (
                        <>
                          <button
                            className={`mic-btn${reg.recording ? " recording" : ""}${reg.transcribing ? " transcribing" : ""}`}
                            title={reg.recording ? "Stop recording" : "Record description (Whisper STT)"}
                            disabled={reg.transcribing}
                            onClick={reg.toggleRecording}
                          >
                            {reg.transcribing ? <span className="spin spin-sm" />
                              : reg.recording ? <MicIcon active />
                              : <MicIcon />}
                          </button>
                          {reg.description.trim() && (
                            <button className="mic-btn" title="Translate description to English (on-device)"
                              disabled={reg.translating} onClick={reg.translateDescription}>
                              {reg.translating ? <span className="spin spin-sm" /> : <TranslateIcon />}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    {reg.recording    && <div className="mic-hint"><span className="rec-dot" /> Recording… tap again to stop</div>}
                    {reg.transcribing && <div className="mic-hint">Transcribing with Whisper…</div>}
                  </label>

                  <label className="field">
                    <span>Public file URL <span className="field-opt">(optional — lets others auto-verify)</span></span>
                    <div className="desc-row">
                      <input type="url" value={reg.publicUrl} placeholder="https://ipfs.io/ipfs/… or any direct link"
                        onChange={(e) => { reg.setPublicUrl(e.target.value); }} />
                      {qvacOnline && (
                        <button className="mic-btn" title="Pin file to IPFS and fill URL automatically"
                          disabled={reg.ipfsUploading} onClick={reg.uploadFileToIpfs}>
                          {reg.ipfsUploading ? <span className="spin spin-sm" /> : <IpfsIcon />}
                        </button>
                      )}
                    </div>
                    {reg.ipfsCid && (
                      <div className="mic-hint">Pinned ✓ CID: <span className="mono">{reg.ipfsCid.slice(0, 20)}…</span></div>
                    )}
                  </label>

                  <div className="field-row">
                    <label className="field">
                      <span>ORCID iD <span className="field-opt">(optional)</span></span>
                      <input type="text" value={reg.orcidId} placeholder="0000-0000-0000-0000" maxLength={19}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/[^0-9X]/gi, "");
                          const parts  = digits.match(/.{1,4}/g) ?? [];
                          reg.setOrcidId(parts.join("-").slice(0, 19));
                        }} />
                    </label>
                    <label className="field">
                      <span>Email <span className="field-opt">(optional)</span></span>
                      <input type="email" value={reg.authorEmail} placeholder="you@institution.edu"
                        onChange={(e) => reg.setAuthorEmail(e.target.value)} />
                    </label>
                  </div>
                  {(reg.orcidId || reg.authorEmail) && (
                    <div className="identity-hint">
                      Stored on-chain and linked to your wallet signature — verifiable without any external authority.
                    </div>
                  )}

                  <label className="field">
                    <span>Cites <span className="field-opt">(optional — paste certificate PDAs this work builds on)</span></span>
                    <div className="desc-row">
                      <input type="text" className="mono" value={reg.citeInput} placeholder="Certificate PDA address"
                        onChange={(e) => reg.setCiteInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && reg.citeInput.trim()) {
                            try {
                              new PublicKey(reg.citeInput.trim());
                              if (!reg.citedPdas.includes(reg.citeInput.trim()))
                                reg.setCitedPdas((p) => [...p, reg.citeInput.trim()]);
                              reg.setCiteInput("");
                            } catch { /* invalid key */ }
                          }
                        }}
                      />
                      <button className="mic-btn" title="Add citation" disabled={!reg.citeInput.trim()}
                        onClick={() => {
                          try {
                            new PublicKey(reg.citeInput.trim());
                            if (!reg.citedPdas.includes(reg.citeInput.trim()))
                              reg.setCitedPdas((p) => [...p, reg.citeInput.trim()]);
                            reg.setCiteInput("");
                          } catch { /* invalid */ }
                        }}
                      >+</button>
                    </div>
                    {reg.citedPdas.length > 0 && (
                      <div className="cite-list">
                        {reg.citedPdas.map((pda) => (
                          <div key={pda} className="cite-chip">
                            <span className="mono">{truncate(pda, 6)}</span>
                            <button onClick={() => reg.setCitedPdas((p) => p.filter((x) => x !== pda))}>×</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </label>

                  <div className="meta-counter">
                    <div className="meta-bar">
                      <div className="meta-bar-fill" style={{
                        width: `${metaPct * 100}%`,
                        background: metaOver ? "#f87171" : metaPct > 0.8 ? "#fbbf24" : "#14f195",
                      }} />
                    </div>
                    <span className={`meta-count${metaOver ? " over" : ""}`}>
                      {reg.metadataBytes} / {META_LIMIT} bytes
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3 — register */}
            {reg.hashBytes && (
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
                  <button className="btn-primary" disabled={reg.registering || metaOver} onClick={reg.registerDiscovery}>
                    {reg.registering ? <><span className="spin" />{reg.status || "Registering…"}</> : "Register discovery →"}
                  </button>
                )}
                {reg.status && !reg.registering && <p className="msg-info">{reg.status}</p>}
                {reg.error  && <p className="msg-error">{reg.error}</p>}
              </div>
            )}

            {reg.certificate && (
              <div className="cert">
                <div className="cert-header">
                  <span className="cert-icon">✓</span>
                  <span>Certificate of Discovery</span>
                </div>
                <div className="cert-body">
                  <CertRow label="Certificate (PDA)" value={reg.certificate.pda} mono
                    onCopy={() => copy(reg.certificate!.pda, "pda")} copied={copiedKey === "pda"} />
                  <CertRow label="Transaction"
                    value={<a href={`https://explorer.solana.com/tx/${reg.certificate.txSig}?cluster=devnet`} target="_blank" rel="noreferrer">{reg.certificate.txSig.slice(0, 20)}… ↗</a>}
                    onCopy={() => copy(reg.certificate!.txSig, "tx")} copied={copiedKey === "tx"} />
                  <CertRow label="File hash" value={reg.certificate.fileHash} mono
                    onCopy={() => copy(reg.certificate!.fileHash, "cert-hash")} copied={copiedKey === "cert-hash"} />
                  <CertRow label="Timestamp" value={new Date(reg.certificate.timestamp * 1000).toUTCString()} />
                  <CertRow label="Metadata" value={renderMeta(reg.certificate.metadata)} />
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
                <input type="text" value={ver.verifyWallet} placeholder="Solana public key"
                  onChange={(e) => ver.setVerifyWallet(e.target.value)} />
              </label>
              <label className="field">
                <span>File hash (SHA-256 hex)</span>
                <input type="text" className="mono" value={ver.verifyHash} placeholder="64-character hex"
                  onChange={(e) => ver.setVerifyHash(e.target.value)} />
              </label>
            </div>

            <div className="divider">— or drop the file to auto-fill hash —</div>

            <div className="dropzone small" onClick={() => verifyFileRef.current?.click()}>
              <input ref={verifyFileRef} type="file" style={{ display: "none" }}
                onChange={(e) => e.target.files?.[0] && ver.handleVerifyFileSelect(e.target.files[0])} />
              <span>↑ Drop file here</span>
            </div>

            <button className="btn-primary" style={{ marginTop: "1.25rem" }}
              disabled={ver.verifying || !ver.verifyHash || !ver.verifyWallet} onClick={ver.runVerify}>
              {ver.verifying ? <><span className="spin" />Verifying…</> : "Verify →"}
            </button>

            {ver.verifyError && <p className="msg-error">{ver.verifyError}</p>}

            {ver.verifyResult && (
              ver.verifyResult.found ? (
                <div className="cert" style={{ marginTop: "1.5rem" }}>
                  <div className="cert-header valid">
                    <span className="cert-icon">✓</span>
                    <span>Verified on-chain</span>
                    <button className="share-btn" title="Paylaş"
                      onClick={() => {
                        const url = buildShareUrl(ver.verifyHash, ver.verifyResult!.researcher!);
                        navigator.clipboard.writeText(url);
                      }}>
                      {copiedKey === "share" ? "✓ Kopyalandı" : "⬡ Paylaş"}
                    </button>
                  </div>
                  <div className="cert-body">
                    <CertRow label="Certificate (PDA)" value={ver.verifyResult.pda!} mono
                      onCopy={() => copy(ver.verifyResult!.pda!, "v-pda")} copied={copiedKey === "v-pda"} />
                    <CertRow label="Researcher" value={ver.verifyResult.researcher!} mono
                      onCopy={() => copy(ver.verifyResult!.researcher!, "v-res")} copied={copiedKey === "v-res"} />
                    {ver.orcidName && (
                      <CertRow label="Name (ORCID)"
                        value={
                          <a href={`https://orcid.org/${metaField(ver.verifyResult.metadata!, "orcid")}`}
                            target="_blank" rel="noreferrer" className="orcid-link">
                            {ver.orcidName} ↗
                          </a>
                        }
                      />
                    )}
                    {metaField(ver.verifyResult.metadata!, "email") && (
                      <CertRow label="Email" value={metaField(ver.verifyResult.metadata!, "email")} />
                    )}
                    {ver.verifyResult.owner && ver.verifyResult.owner !== ver.verifyResult.researcher && (
                      <CertRow label="Current owner" value={ver.verifyResult.owner} mono
                        onCopy={() => copy(ver.verifyResult!.owner!, "v-own")} copied={copiedKey === "v-own"} />
                    )}
                    <CertRow label="Registered" value={new Date(ver.verifyResult.timestamp! * 1000).toUTCString()} />
                    <CertRow label="Endorsements" value={String(ver.verifyResult.endorsementCount ?? 0)} />
                    <CertRow label="Metadata" value={renderMeta(ver.verifyResult.metadata!)} />
                  </div>

                  {/* ── Explorer panel ── */}
                  <div className="explorer-panel">
                    <div className="explorer-label">Zincirde Doğrulandı</div>
                    <div className="explorer-pda">{ver.verifyResult.pda}</div>
                    <div className="explorer-actions">
                      <a
                        className="explorer-btn"
                        href={`https://explorer.solana.com/address/${ver.verifyResult.pda}?cluster=devnet`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Solana Explorer'da Gör ↗
                      </a>
                      <a
                        className="explorer-btn explorer-btn-ghost"
                        href={`https://solscan.io/account/${ver.verifyResult.pda}?cluster=devnet`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Solscan ↗
                      </a>
                    </div>
                    <div className="explorer-meta">
                      <span>Program: <span className="mono">8cmvWB8S…NykbH</span></span>
                      <span>Network: <span className="pill pill-purple" style={{fontSize:"0.65rem",padding:"0.1rem 0.4rem"}}>devnet</span></span>
                      <span>{new Date(ver.verifyResult.timestamp! * 1000).toLocaleString("tr-TR")}</span>
                    </div>
                  </div>

                  {metaField(ver.verifyResult.metadata!, "url") && (
                    <div className="fetch-verify-row">
                      <span className="fetch-verify-hint">File URL on record —</span>
                      <a href={metaField(ver.verifyResult.metadata!, "url")} target="_blank" rel="noreferrer" className="fetch-verify-link">
                        {metaField(ver.verifyResult.metadata!, "url").slice(0, 50)}…
                      </a>
                      <button className="btn-ai" disabled={ver.fetchVerifying}
                        onClick={() => ver.fetchAndVerify(
                          metaField(ver.verifyResult!.metadata!, "url"),
                          ver.verifyHash,
                          ver.verifyResult!.researcher!,
                        )}
                      >
                        {ver.fetchVerifying ? <><span className="spin" /> Fetching…</> : "↓ Fetch file & verify hash"}
                      </button>
                    </div>
                  )}

                  {/* Endorse — shown to non-owner connected wallets */}
                  {wallet.connected && wallet.publicKey?.toBase58() !== (ver.verifyResult.owner ?? ver.verifyResult.researcher) && (
                    <div className="transfer-section">
                      <div className="transfer-header">Peer endorsement</div>
                      {ver.endorseDone ? (
                        <p className="msg-info">Endorsement recorded on-chain. Total: {ver.verifyResult.endorsementCount}</p>
                      ) : (
                        <>
                          <button className="btn-primary" disabled={ver.endorsing} onClick={ver.endorseDiscovery}>
                            {ver.endorsing ? <><span className="spin" />Endorsing…</> : "✦ Endorse this discovery →"}
                          </button>
                          {ver.endorseError && <p className="msg-error">{ver.endorseError}</p>}
                          <p className="transfer-hint">One endorsement per wallet. Stored immutably on-chain.</p>
                        </>
                      )}
                    </div>
                  )}

                  {/* Transfer — shown to current owner only */}
                  {wallet.connected && wallet.publicKey?.toBase58() === (ver.verifyResult.owner ?? ver.verifyResult.researcher) && (
                    <div className="transfer-section">
                      <div className="transfer-header">Transfer ownership</div>
                      {ver.transferDone ? (
                        <p className="msg-info">Ownership transferred to {ver.transferTo.trim()}.</p>
                      ) : (
                        <>
                          <div className="transfer-row">
                            <input type="text" className="mono" value={ver.transferTo}
                              placeholder="New owner wallet address"
                              onChange={(e) => ver.setTransferTo(e.target.value)} />
                            <button className="btn-primary" disabled={ver.transferring || !ver.transferTo.trim()}
                              onClick={ver.transferDiscovery}>
                              {ver.transferring ? <><span className="spin" />Transferring…</> : "Transfer →"}
                            </button>
                          </div>
                          {ver.transferError && <p className="msg-error">{ver.transferError}</p>}
                          <p className="transfer-hint">The original researcher is preserved on-chain — only the owner changes.</p>
                        </>
                      )}
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
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                {wallet.connected && (
                  <button
                    className={`btn-ghost${feed.mineOnly ? " active" : ""}`}
                    onClick={feed.toggleMine}
                    title="Sadece kendi keşiflerini göster"
                  >
                    {feed.mineOnly ? "◈ Benimkiler" : "◈ Benimkiler"}
                  </button>
                )}
                <button className="btn-ghost" onClick={feed.loadFeed} disabled={feed.feedLoading}>
                  {feed.feedLoading ? <><span className="spin spin-sm" />Loading</> : "Refresh"}
                </button>
              </div>
            </div>

            {qvacOnline && (
              <div className="search-row">
                <input type="text" className="search-input" value={feed.searchQuery}
                  placeholder="AI semantic search — e.g. RNA cancer genomics"
                  onChange={(e) => feed.setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && feed.runSemanticSearch()} />
                <button className="btn-ai" disabled={feed.searching || !feed.searchQuery.trim()} onClick={feed.runSemanticSearch}>
                  {feed.searching ? <span className="spin" /> : "Search"}
                </button>
                {feed.searchQuery && <button className="btn-ghost" onClick={feed.clearSearch}>Clear</button>}
              </div>
            )}

            {feed.feedError && <p className="msg-error">{feed.feedError}</p>}

            {feed.feedLoading && feed.feed.length === 0 && (
              <div className="feed-empty"><span className="spin spin-lg" /></div>
            )}
            {!feed.feedLoading && feed.feed.length === 0 && !feed.feedError && (
              <div className="feed-empty">No discoveries registered yet.</div>
            )}

            <div className="feed-list">
              {feed.feed.map((entry) => {
                const type = metaField(entry.metadata, "analysis_type");
                const tool = metaField(entry.metadata, "tool");
                const ver  = metaField(entry.metadata, "version");
                const desc = metaField(entry.metadata, "description");
                return (
                  <div key={entry.pda} className="feed-card">
                    <div className="feed-card-top">
                      {type && <span className="pill pill-purple">{typeLabel(type)}</span>}
                      <span className="feed-date">{new Date(entry.timestamp * 1000).toLocaleDateString()}</span>
                      {entry.endorsementCount > 0 && (
                        <span className="pill pill-gold" title="Peer endorsements">✦ {entry.endorsementCount}</span>
                      )}
                      {entry._score !== undefined && (
                        <span className="pill pill-green">{(entry._score * 100).toFixed(0)}% match</span>
                      )}
                    </div>
                    {desc && <p className="feed-desc">{desc}</p>}
                    <div className="feed-meta">
                      <FeedMeta label="Researcher" value={truncate(entry.researcher)} mono />
                      <OrcidInline metadata={entry.metadata} />
                      <FeedMeta label="Hash" value={truncate(entry.fileHash, 10)} mono />
                      {(tool || ver) && <FeedMeta label="Tool" value={[tool, ver].filter(Boolean).join(" ")} />}
                    </div>
                    {(() => {
                      try {
                        const cites: string[] = JSON.parse(entry.metadata)?.cites ?? [];
                        if (cites.length === 0) return null;
                        return (
                          <div className="feed-cites">
                            <span className="feed-cites-label">Cites</span>
                            {cites.map((c) => (
                              <a key={c} className="feed-link mono" href={`https://explorer.solana.com/address/${c}?cluster=devnet`} target="_blank" rel="noreferrer">
                                {truncate(c, 6)} ↗
                              </a>
                            ))}
                          </div>
                        );
                      } catch { return null; }
                    })()}
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

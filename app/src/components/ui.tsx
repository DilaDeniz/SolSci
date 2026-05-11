import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { resolveOrcid } from "../lib/utils";

// ── useCopy ───────────────────────────────────────────────────────────────────

export function useCopy() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    });
  }, []);
  return { copy, copiedKey };
}

// ── Icons ─────────────────────────────────────────────────────────────────────

export function MicIcon({ active }: { active?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke={active ? "#f87171" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="17" x2="12" y2="22" />
      <line x1="8"  y1="22" x2="16" y2="22" />
    </svg>
  );
}

export function IpfsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

export function TranslateIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 8l6 6" />
      <path d="M4 14l6-6 2-3" />
      <path d="M2 5h12" />
      <path d="M7 2h1" />
      <path d="M22 22l-5-10-5 10" />
      <path d="M14 18h6" />
    </svg>
  );
}

// ── CertRow ───────────────────────────────────────────────────────────────────

export function CertRow({
  label, value, mono, onCopy, copied,
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

// ── FeedMeta ──────────────────────────────────────────────────────────────────

export function FeedMeta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="feed-meta-row">
      <span className="feed-meta-key">{label}</span>
      <span className={`feed-meta-val${mono ? " mono" : ""}`}>{value}</span>
    </div>
  );
}

// ── OrcidInline ───────────────────────────────────────────────────────────────

export function OrcidInline({ metadata }: { metadata: string }) {
  const [name, setName] = useState("");
  const orcid = useMemo(() => {
    try { return JSON.parse(metadata)?.orcid ?? ""; }
    catch { return ""; }
  }, [metadata]);

  useEffect(() => {
    if (!orcid) return;
    resolveOrcid(orcid).then(setName);
  }, [orcid]);

  if (!orcid) return null;
  return (
    <div className="feed-meta-row">
      <span className="feed-meta-key">ORCID</span>
      <a className="feed-meta-val orcid-link" href={`https://orcid.org/${orcid}`} target="_blank" rel="noreferrer">
        {name || orcid} ↗
      </a>
    </div>
  );
}

// ── renderMeta ────────────────────────────────────────────────────────────────

export function renderMeta(metaStr: string) {
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

// ── Tutorial ──────────────────────────────────────────────────────────────────

const TUTORIAL_STEPS = [
  {
    icon: "📄",
    title: "Select a file",
    desc: "Any research output — CSV, PDF, image, code. The file stays on your device.",
  },
  {
    icon: "✏️",
    title: "Describe it",
    desc: "Enter the research type and tool. AI can auto-fill these fields, or use voice dictation.",
  },
  {
    icon: "⛓️",
    title: "Write to chain",
    desc: "Sign with your wallet. SHA-256 hash + metadata is written to Solana. ~$0.001 — 400ms.",
  },
  {
    icon: "✓",
    title: "Certificate",
    desc: "Immutable timestamp. Anyone can verify the file is original from the Verify tab.",
  },
];

export function Tutorial() {
  const [open, setOpen] = useState(false);
  return (
    <div className="tutorial-wrap">
      <button className="tutorial-toggle" onClick={() => setOpen((p) => !p)}>
        {open ? "▲ How it works" : "▼ How it works"}
      </button>
      {open && (
        <div className="tutorial-steps">
          {TUTORIAL_STEPS.map((s, i) => (
            <div key={i} className="tutorial-step">
              <div className="tutorial-icon">{s.icon}</div>
              <div>
                <div className="tutorial-step-title">{i + 1}. {s.title}</div>
                <div className="tutorial-step-desc">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── DemoWalkthrough ───────────────────────────────────────────────────────────

const WALK_STEPS = [
  {
    duration: 3000,
    title: "File selection",
    desc: "Research output loading. The file stays on your device — only the SHA-256 fingerprint is computed.",
  },
  {
    duration: 3500,
    title: "Metadata",
    desc: "Research type, tool, and description filled in. AI can auto-fill these fields — no data goes to the cloud.",
  },
  {
    duration: 3000,
    title: "Register on Solana",
    desc: "Hash + metadata written to chain with your wallet signature. Cost ~$0.001, time 400ms.",
  },
  {
    duration: 3500,
    title: "Verification",
    desc: "Anyone can verify the discovery hasn't been tampered with using just the hash and wallet address.",
  },
  {
    duration: 3000,
    title: "Peer endorsement & Feed",
    desc: "Other researchers endorse the discovery on-chain. All discoveries are listed in a public, AI-searchable feed.",
  },
];

export function DemoWalkthrough({
  onStep,
}: {
  onStep: (step: number) => void;
}) {
  const [running, setRunning]   = useState(false);
  const [step,    setStep]      = useState(-1);
  const timerRef                = useRef<ReturnType<typeof setTimeout> | null>(null);

  const advance = useCallback((current: number) => {
    const next = current + 1;
    if (next >= WALK_STEPS.length) {
      setStep(-1);
      setRunning(false);
      onStep(-1);
      return;
    }
    setStep(next);
    onStep(next);
    timerRef.current = setTimeout(() => advance(next), WALK_STEPS[next].duration);
  }, [onStep]);

  const start = useCallback(() => {
    if (running) return;
    setRunning(true);
    setStep(0);
    onStep(0);
    timerRef.current = setTimeout(() => advance(0), WALK_STEPS[0].duration);
  }, [running, advance, onStep]);

  const stop = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setRunning(false);
    setStep(-1);
    onStep(-1);
  }, [onStep]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  if (!running) {
    return (
      <button className="btn-walkthrough" onClick={start} title="Auto walkthrough for demo recording">
        ▶ Walkthrough
      </button>
    );
  }

  const current = WALK_STEPS[step] ?? WALK_STEPS[0];
  const pct     = ((step + 1) / WALK_STEPS.length) * 100;

  return (
    <div className="walkthrough-overlay">
      <div className="walkthrough-card">
        <div className="walkthrough-progress">
          <div className="walkthrough-bar" style={{ width: `${pct}%` }} />
        </div>
        <div className="walkthrough-counter">{step + 1} / {WALK_STEPS.length}</div>
        <div className="walkthrough-title">{current.title}</div>
        <div className="walkthrough-desc">{current.desc}</div>
        <button className="walkthrough-stop" onClick={stop}>■ Stop</button>
      </div>
    </div>
  );
}

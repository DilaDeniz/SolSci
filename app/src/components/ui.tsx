import React, { useState, useEffect, useMemo, useCallback } from "react";
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

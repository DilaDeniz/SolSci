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
    title: "Dosyayı seç",
    desc: "Herhangi bir araştırma çıktısı — CSV, PDF, görsel, kod. Dosya cihazında kalır.",
  },
  {
    icon: "✏️",
    title: "Açıkla",
    desc: "Araştırma tipini ve aracını gir. AI ile otomatik doldurabilir veya sesle dikte edebilirsin.",
  },
  {
    icon: "⛓️",
    title: "Zincire yaz",
    desc: "Cüzdanınla imzala. SHA-256 hash + metadata Solana'ya yazılır. ~0.001 $ — 400 ms.",
  },
  {
    icon: "✓",
    title: "Sertifika",
    desc: "Değiştirilemez zaman damgası. Herkes Verify tab'ından dosyanın orijinal olduğunu kontrol edebilir.",
  },
];

export function Tutorial() {
  const [open, setOpen] = useState(false);
  return (
    <div className="tutorial-wrap">
      <button className="tutorial-toggle" onClick={() => setOpen((p) => !p)}>
        {open ? "▲ Nasıl çalışır?" : "▼ Nasıl çalışır?"}
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
    title: "Dosya seçimi",
    desc: "Araştırma çıktısı yükleniyor. Dosya cihazda kalıyor — sadece SHA-256 parmak izi hesaplanıyor.",
  },
  {
    duration: 3500,
    title: "Metadata girişi",
    desc: "Araştırma tipi, araç ve açıklama girildi. AI bu alanları otomatik doldurabilir — hiçbir veri buluta gitmiyor.",
  },
  {
    duration: 3000,
    title: "Solana'ya kayıt",
    desc: "Cüzdan imzasıyla hash + metadata zincire yazılıyor. İşlem maliyeti ~0.001 $, süresi 400 ms.",
  },
  {
    duration: 3500,
    title: "Doğrulama",
    desc: "Herhangi biri hash + cüzdan adresiyle keşfin değiştirilmediğini saniyeler içinde doğrulayabilir.",
  },
  {
    duration: 3000,
    title: "Peer endorsement & Feed",
    desc: "Başka araştırmacılar keşfi imzalar. Tüm keşifler herkese açık feed'de listelenir, AI ile aranabilir.",
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
      <button className="btn-walkthrough" onClick={start} title="Demo videosu için otomatik tur">
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
        <button className="walkthrough-stop" onClick={stop}>■ Durdur</button>
      </div>
    </div>
  );
}

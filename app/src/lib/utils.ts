import { PublicKey } from "@solana/web3.js";

// ── ORCID ─────────────────────────────────────────────────────────────────────

const orcidCache = new Map<string, string>();

export async function resolveOrcid(orcidId: string): Promise<string> {
  if (orcidCache.has(orcidId)) return orcidCache.get(orcidId)!;
  try {
    const res  = await fetch(`https://pub.orcid.org/v3.0/${orcidId}/person`, {
      headers: { Accept: "application/json" },
      signal:  AbortSignal.timeout(4000),
    });
    if (!res.ok) return "";
    const data   = await res.json();
    const given  = data?.name?.["given-names"]?.value ?? "";
    const family = data?.name?.["family-name"]?.value ?? "";
    const name   = [given, family].filter(Boolean).join(" ");
    orcidCache.set(orcidId, name);
    return name;
  } catch {
    return "";
  }
}

// ── String helpers ────────────────────────────────────────────────────────────

export function truncate(s: string, n = 8): string {
  return s.length <= n * 2 + 3 ? s : `${s.slice(0, n)}…${s.slice(-n)}`;
}

export function typeLabel(t: string): string {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function byteLen(s: string): number {
  return new TextEncoder().encode(s).length;
}

export function metaField(metaStr: string, key: string): string {
  try { return JSON.parse(metaStr)[key] ?? ""; }
  catch { return ""; }
}

export function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

// ── File helpers ──────────────────────────────────────────────────────────────

export async function hashFile(f: File): Promise<Uint8Array> {
  const buf = await f.arrayBuffer();
  return new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
}

export async function readTextSample(file: File, bytes = 4096): Promise<string> {
  const slice = file.slice(0, bytes);
  const buf   = await slice.arrayBuffer();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
  catch { return ""; }
}

export async function fileToBase64(file: File): Promise<string> {
  const buf   = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary  = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

// ── Wallet helpers ────────────────────────────────────────────────────────────

export function readonlyWallet(pk: PublicKey) {
  return {
    publicKey:           pk,
    signTransaction:     async (t: any) => t,
    signAllTransactions: async (ts: any) => ts,
  };
}

export async function requestAirdrop(
  connection: { requestAirdrop: (pk: PublicKey, lamports: number) => Promise<string>; confirmTransaction: (sig: string, commitment: string) => Promise<any> },
  publicKey: PublicKey,
): Promise<void> {
  const sig = await connection.requestAirdrop(publicKey, 2 * 1_000_000_000);
  await connection.confirmTransaction(sig, "confirmed");
}

// ── Share URL ─────────────────────────────────────────────────────────────────

export function buildShareUrl(hashHex: string, researcherAddress: string): string {
  const base = typeof window !== "undefined" ? window.location.origin + window.location.pathname : "";
  return `${base}?tab=verify&hash=${hashHex}&wallet=${researcherAddress}`;
}

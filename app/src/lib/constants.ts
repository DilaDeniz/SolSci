import { PublicKey } from "@solana/web3.js";
import idl from "../idl/solsci.json";

export const PROGRAM_ID    = new PublicKey((idl as any).address);
export const QVAC_BASE_URL = "http://localhost:3001";
export const META_LIMIT    = 512;
export const IS_MOBILE     = /iPhone|iPad|Android|Mobile/i.test(navigator.userAgent);

export const ANALYSIS_TYPES = [
  // Life sciences
  "whole_genome_sequencing", "rna_sequencing", "single_cell_sequencing",
  "proteomics", "metabolomics", "metagenomics", "epigenomics", "chip_seq",
  "neuroscience", "ecology", "clinical_trial",
  // Physical sciences
  "spectroscopy", "crystallography", "particle_physics", "astrophysics",
  "atmospheric_science", "ocean_science", "quantum_experiment",
  // Computational
  "machine_learning", "benchmark", "simulation", "dataset",
  // Other
  "chemistry", "materials_science", "social_science", "economics",
  "experiment", "other",
] as const;

// ── Shared types ──────────────────────────────────────────────────────────────

export interface Certificate {
  pda: string;
  txSig: string;
  fileHash: string;
  timestamp: number;
  metadata: string;
}

export interface VerifyResult {
  found: boolean;
  pda?: string;
  researcher?: string;
  owner?: string;
  timestamp?: number;
  metadata?: string;
  endorsementCount?: number;
  fileHashHex?: string;
}

export interface FeedEntry {
  pda: string;
  researcher: string;
  owner: string;
  fileHash: string;
  timestamp: number;
  metadata: string;
  endorsementCount: number;
  _score?: number;
}

export type Tab = "register" | "verify" | "feed";

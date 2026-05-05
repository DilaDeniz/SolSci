/**
 * QVAC local LLM metadata assistant.
 * Reads the first 4 KB of a research file and asks Llama 3.2 1B to suggest
 * structured metadata fields. Everything runs on-device — no data is uploaded.
 */

import Qvac from "@qvac/sdk";
import { readFileSync } from "fs";
import { basename, extname } from "path";
import { llmQueue } from "./queue.js";

// Must stay in sync with ANALYSIS_TYPES in app/src/components/Dashboard.tsx
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

const SYSTEM_PROMPT = `You are a scientific metadata assistant that works across all research disciplines — biology, physics, chemistry, astronomy, climate science, computer science, social science, and more.

Given a research file name, its extension, and an optional content preview, output a JSON object with these fields:
- analysis_type: one of [${ANALYSIS_TYPES.join(", ")}] — pick the closest match
- tool: the software or pipeline likely used to produce this file (e.g. "Python", "R", "STAR", "MATLAB", "Jupyter")
- version: a plausible version string (e.g. "3.11.0") or "unknown"
- description: one sentence describing what this file likely contains

Respond with ONLY valid JSON, no prose, no markdown fences.`;

function buildPrompt(fileName, fileSample) {
  const ext   = extname(fileName);
  const lines = fileSample ? fileSample.slice(0, 1000) : "";
  return `File name: ${fileName}\nExtension: ${ext}\nContent preview:\n${lines}`;
}

export async function suggestMetadata(filePath, fileSample) {
  const fileName = basename(filePath);
  return llmQueue.run(() => _suggestMetadata(fileName, fileSample));
}

async function _suggestMetadata(fileName, fileSample) {
  const qvac = new Qvac();
  await qvac.loadModel("inference");

  let fullText = "";
  try {
    const stream = await qvac.completion({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user",   content: buildPrompt(fileName, fileSample) },
      ],
      temperature: 0.2,
      maxTokens: 256,
    });

    for await (const chunk of stream) {
      fullText += chunk.content ?? "";
    }
  } finally {
    await qvac.unloadModel("inference");
  }

  // Extract JSON — model may occasionally wrap it in markdown fences
  const jsonMatch = fullText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Model returned non-JSON: ${fullText}`);

  const parsed = JSON.parse(jsonMatch[0]);

  // Normalise analysis_type against the allowed list
  if (!ANALYSIS_TYPES.includes(parsed.analysis_type)) {
    parsed.analysis_type = "other";
  }

  return {
    analysis_type: parsed.analysis_type ?? "other",
    tool:          parsed.tool          ?? "",
    version:       parsed.version       ?? "",
    description:   parsed.description   ?? "",
  };
}

// CLI usage: node src/assist.js <file-path>
if (process.argv[2]) {
  const filePath = process.argv[2];
  let sample = "";
  try {
    const buf = readFileSync(filePath);
    sample = buf.slice(0, 4096).toString("utf8", 0, 4096);
  } catch {
    // binary file — use filename only
  }

  suggestMetadata(filePath, sample)
    .then((m) => console.log(JSON.stringify(m, null, 2)))
    .catch((e) => { console.error(e.message); process.exit(1); });
}

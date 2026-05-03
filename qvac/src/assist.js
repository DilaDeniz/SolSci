/**
 * QVAC local LLM metadata assistant.
 * Reads the first 4 KB of a research file and asks Llama 3.2 1B to suggest
 * structured metadata fields. Everything runs on-device — no data is uploaded.
 */

import Qvac from "@qvac/sdk";
import { readFileSync } from "fs";
import { basename, extname } from "path";

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
  "other",
];

const SYSTEM_PROMPT = `You are a bioinformatics metadata assistant.
Given a research file name, extension, and an optional content preview, output a JSON object with these fields:
- analysis_type: one of [${ANALYSIS_TYPES.join(", ")}]
- tool: the likely tool or pipeline name (e.g. "STAR", "BWA", "Salmon", "fastp")
- version: a plausible tool version string (e.g. "2.7.10a") or "unknown"
- description: one sentence describing what this output likely contains

Respond with ONLY valid JSON, no prose.`;

function buildPrompt(fileName, fileSample) {
  const ext = extname(fileName);
  const lines = fileSample ? fileSample.slice(0, 1000) : "";
  return `File name: ${fileName}\nExtension: ${ext}\nContent preview:\n${lines}`;
}

export async function suggestMetadata(filePath, fileSample) {
  const fileName = basename(filePath);
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

  // Extract JSON from the response (model may wrap it in markdown fences)
  const jsonMatch = fullText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Model returned non-JSON: ${fullText}`);

  const parsed = JSON.parse(jsonMatch[0]);

  // Validate and normalise analysis_type
  if (!ANALYSIS_TYPES.includes(parsed.analysis_type)) {
    parsed.analysis_type = "genomic_analysis";
  }

  return {
    analysis_type: parsed.analysis_type ?? "genomic_analysis",
    tool:          parsed.tool        ?? "unknown",
    version:       parsed.version     ?? "unknown",
    description:   parsed.description ?? "",
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
    // binary file — just use the name
  }

  suggestMetadata(filePath, sample)
    .then((m) => console.log(JSON.stringify(m, null, 2)))
    .catch((e) => { console.error(e.message); process.exit(1); });
}

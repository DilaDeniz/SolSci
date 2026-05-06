import {
  loadModel, completion, unloadModel,
  LLAMA_3_2_1B_INST_Q4_0,
} from "@qvac/sdk";
import { readFileSync } from "fs";
import { basename, extname } from "path";
import { llmQueue } from "./queue.js";

const ANALYSIS_TYPES = [
  "whole_genome_sequencing","rna_sequencing","single_cell_sequencing",
  "proteomics","metabolomics","metagenomics","epigenomics","chip_seq",
  "neuroscience","ecology","clinical_trial","spectroscopy","crystallography",
  "particle_physics","astrophysics","atmospheric_science","ocean_science",
  "quantum_experiment","machine_learning","benchmark","simulation","dataset",
  "chemistry","materials_science","social_science","economics","experiment","other",
];

const SYSTEM_PROMPT = `You are a scientific metadata assistant. Given a research file name and optional content preview, output ONLY valid JSON with these fields:
- analysis_type: one of [${ANALYSIS_TYPES.join(", ")}]
- tool: software likely used (e.g. "Python", "R", "MATLAB")
- version: version string or "unknown"
- description: one sentence about the file contents
No prose, no markdown fences.`;

export async function suggestMetadata(filePath, fileSample) {
  const fileName = basename(filePath);
  return llmQueue.run(() => _suggestMetadata(fileName, fileSample));
}

async function _suggestMetadata(fileName, fileSample) {
  const modelId = await loadModel({ modelSrc: LLAMA_3_2_1B_INST_Q4_0, modelType: "llm" });
  let fullText = "";
  try {
    const ext     = extname(fileName);
    const preview = fileSample ? fileSample.slice(0, 1000) : "";
    const userMsg = `File name: ${fileName}\nExtension: ${ext}\nContent preview:\n${preview}`;

    const result = completion({
      modelId,
      history: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user",   content: userMsg },
      ],
      stream: true,
    });

    for await (const token of result.tokenStream) {
      fullText += token ?? "";
    }
  } finally {
    await unloadModel({ modelId });
  }

  const jsonMatch = fullText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Model returned non-JSON: ${fullText}`);

  const parsed = JSON.parse(jsonMatch[0]);
  if (!ANALYSIS_TYPES.includes(parsed.analysis_type)) parsed.analysis_type = "other";

  return {
    analysis_type: parsed.analysis_type ?? "other",
    tool:          parsed.tool          ?? "",
    version:       parsed.version       ?? "",
    description:   parsed.description   ?? "",
  };
}

if (process.argv[2]) {
  const filePath = process.argv[2];
  let sample = "";
  try { sample = readFileSync(filePath).slice(0, 4096).toString("utf8"); } catch {}
  suggestMetadata(filePath, sample)
    .then((m) => console.log(JSON.stringify(m, null, 2)))
    .catch((e) => { console.error(e.message); process.exit(1); });
}

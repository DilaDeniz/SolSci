import { loadModel, embed, unloadModel, GTE_LARGE_FP16 } from "@qvac/sdk";
import { embedQueue } from "./queue.js";

const SCORE_THRESHOLD = 0.15;

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-10);
}

function discoveryText(entry) {
  try {
    const m = JSON.parse(entry.metadata);
    return [
      m.analysis_type?.replace(/_/g, " ") ?? "",
      m.tool        ?? "",
      m.version     ?? "",
      m.description ?? "",
    ].filter(Boolean).join(" ");
  } catch {
    return entry.metadata ?? "";
  }
}

export async function semanticSearch(query, discoveries) {
  if (!discoveries.length) return [];
  return embedQueue.run(() => _semanticSearch(query, discoveries));
}

async function _semanticSearch(query, discoveries) {
  const modelId = await loadModel({
    modelSrc: GTE_LARGE_FP16,
    modelType: "embeddings",
  });
  try {
    const texts = [query, ...discoveries.map(discoveryText)];

    // Batch embed all texts at once
    const { embedding: vectors } = await embed({ modelId, text: texts });

    const queryVec = Array.isArray(vectors[0]) ? vectors[0] : vectors;
    const docVecs  = Array.isArray(vectors[0]) ? vectors.slice(1) : [];

    // If batch returned flat (single text mode), fall back to sequential
    if (docVecs.length === 0) {
      const results = [];
      for (let i = 0; i < discoveries.length; i++) {
        const { embedding: dv } = await embed({ modelId, text: discoveryText(discoveries[i]) });
        results.push({ ...discoveries[i], _score: cosine(queryVec, dv) });
      }
      return results.sort((a, b) => b._score - a._score);
    }

    const scored = discoveries.map((entry, i) => ({
      ...entry,
      _score: cosine(queryVec, docVecs[i]),
    }));

    const filtered = scored.filter((e) => e._score >= SCORE_THRESHOLD);
    return (filtered.length > 0 ? filtered : scored).sort((a, b) => b._score - a._score);
  } finally {
    await unloadModel({ modelId });
  }
}

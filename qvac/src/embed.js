/**
 * QVAC embedding-based semantic search over discovery metadata.
 * Computes cosine similarity between a query embedding and a set of
 * pre-embedded discovery records entirely on-device.
 */

import Qvac from "@qvac/sdk";

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
      m.tool ?? "",
      m.version ?? "",
      m.description ?? "",
      m.reference_genome ?? "",
    ].filter(Boolean).join(" ");
  } catch {
    return entry.metadata ?? "";
  }
}

/**
 * Rank `discoveries` by semantic similarity to `query`.
 * Returns the same array sorted by descending similarity score.
 */
export async function semanticSearch(query, discoveries) {
  if (!discoveries.length) return [];

  const qvac = new Qvac();
  await qvac.loadModel("embed");

  try {
    const texts  = discoveries.map(discoveryText);
    const inputs = [query, ...texts];

    const vectors = await Promise.all(
      inputs.map((t) => qvac.embed({ input: t }))
    );

    const queryVec = vectors[0];
    return discoveries
      .map((entry, i) => ({
        ...entry,
        _score: cosine(queryVec, vectors[i + 1]),
      }))
      .sort((a, b) => b._score - a._score);
  } finally {
    await qvac.unloadModel("embed");
  }
}

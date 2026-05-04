/**
 * QVAC embedding-based semantic search over discovery metadata.
 * Computes cosine similarity between a query embedding and a set of
 * pre-embedded discovery records entirely on-device.
 */

import Qvac from "@qvac/sdk";

const SCORE_THRESHOLD = 0.15; // discard near-zero similarity matches

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
      m.tool          ?? "",
      m.version       ?? "",
      m.description   ?? "",
    ].filter(Boolean).join(" ");
  } catch {
    return entry.metadata ?? "";
  }
}

/**
 * Rank `discoveries` by semantic similarity to `query`.
 * Returns entries with _score >= SCORE_THRESHOLD, sorted descending.
 * Falls back to the original order if the query produces no results above threshold.
 */
export async function semanticSearch(query, discoveries) {
  if (!discoveries.length) return [];

  const qvac = new Qvac();
  await qvac.loadModel("embed");

  try {
    const texts   = discoveries.map(discoveryText);
    const inputs  = [query, ...texts];
    const vectors = await Promise.all(inputs.map((t) => qvac.embed({ input: t })));

    const queryVec = vectors[0];
    const scored   = discoveries.map((entry, i) => ({
      ...entry,
      _score: cosine(queryVec, vectors[i + 1]),
    }));

    const filtered = scored
      .filter((e) => e._score >= SCORE_THRESHOLD)
      .sort((a, b) => b._score - a._score);

    // If nothing clears the threshold, return all sorted by score anyway
    return filtered.length > 0
      ? filtered
      : scored.sort((a, b) => b._score - a._score);
  } finally {
    await qvac.unloadModel("embed");
  }
}

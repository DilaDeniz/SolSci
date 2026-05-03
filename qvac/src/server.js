/**
 * SolSci QVAC local AI server.
 * Runs on http://localhost:3001 — all inference is on-device via QVAC SDK.
 *
 * Endpoints:
 *   POST /api/suggest   { fileName, fileSample? } → metadata suggestion JSON
 *   POST /api/search    { query, discoveries[] }  → discoveries ranked by similarity
 *   GET  /api/health                              → { ok: true }
 */

import express from "express";
import cors    from "cors";
import { suggestMetadata } from "./assist.js";
import { semanticSearch  } from "./embed.js";

const app  = express();
const PORT = 3001;

app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json({ limit: "1mb" }));

// ── Health ────────────────────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ── Metadata suggestion ───────────────────────────────────────────────────────

app.post("/api/suggest", async (req, res) => {
  const { fileName, fileSample } = req.body ?? {};

  if (!fileName || typeof fileName !== "string") {
    return res.status(400).json({ error: "fileName required" });
  }

  try {
    const suggestion = await suggestMetadata(fileName, fileSample ?? "");
    res.json(suggestion);
  } catch (err) {
    console.error("[suggest]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Semantic search ───────────────────────────────────────────────────────────

app.post("/api/search", async (req, res) => {
  const { query, discoveries } = req.body ?? {};

  if (!query || !Array.isArray(discoveries)) {
    return res.status(400).json({ error: "query and discoveries[] required" });
  }

  try {
    const ranked = await semanticSearch(query, discoveries);
    res.json(ranked);
  } catch (err) {
    console.error("[search]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`SolSci QVAC server running on http://localhost:${PORT}`);
  console.log("  POST /api/suggest  — AI metadata suggestions (Llama 3.2 1B, local)");
  console.log("  POST /api/search   — semantic search over discoveries (embeddings, local)");
});

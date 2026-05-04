/**
 * SolSci QVAC local AI server.
 * Runs on http://localhost:3001 — all inference is on-device via QVAC SDK.
 *
 * Endpoints:
 *   GET  /api/health                              → { ok: true }
 *   POST /api/suggest   { fileName, fileSample? } → metadata suggestion JSON
 *   POST /api/search    { query, discoveries[] }  → discoveries ranked by similarity
 *   POST /api/transcribe { audio: base64 }        → { text } (Whisper STT)
 *   POST /api/ocr       { image: base64 }         → { text } (on-device OCR)
 *   POST /api/translate { text }                  → { text } (on-device translation → English)
 */

import express from "express";
import cors    from "cors";
import { suggestMetadata }       from "./assist.js";
import { semanticSearch }        from "./embed.js";
import { transcribeAudio }       from "./transcribe.js";
import { extractTextFromImage }  from "./ocr.js";
import { translateToEnglish }    from "./translate.js";

const app  = express();
const PORT = 3001;

const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://solsci-app.vercel.app",
];

app.use(cors({
  origin: (origin, cb) => cb(null, !origin || ALLOWED_ORIGINS.includes(origin)),
}));

// 10 MB body limit — audio recordings and images can be several MB as base64
app.use(express.json({ limit: "10mb" }));

// ── Health ────────────────────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ── Metadata suggestion ───────────────────────────────────────────────────────

app.post("/api/suggest", async (req, res) => {
  const { fileName, fileSample } = req.body ?? {};
  if (!fileName || typeof fileName !== "string") {
    return res.status(400).json({ error: "fileName required" });
  }
  try {
    res.json(await suggestMetadata(fileName, fileSample ?? ""));
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
    res.json(await semanticSearch(query, discoveries));
  } catch (err) {
    console.error("[search]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Speech-to-text (Whisper) ──────────────────────────────────────────────────

app.post("/api/transcribe", async (req, res) => {
  const { audio } = req.body ?? {};
  if (!audio || typeof audio !== "string") {
    return res.status(400).json({ error: "audio (base64) required" });
  }
  try {
    const buffer = Buffer.from(audio, "base64");
    const text   = await transcribeAudio(buffer);
    res.json({ text });
  } catch (err) {
    console.error("[transcribe]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── OCR ───────────────────────────────────────────────────────────────────────

app.post("/api/ocr", async (req, res) => {
  const { image } = req.body ?? {};
  if (!image || typeof image !== "string") {
    return res.status(400).json({ error: "image (base64) required" });
  }
  try {
    const buffer = Buffer.from(image, "base64");
    const text   = await extractTextFromImage(buffer);
    res.json({ text });
  } catch (err) {
    console.error("[ocr]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Translation ───────────────────────────────────────────────────────────────

app.post("/api/translate", async (req, res) => {
  const { text } = req.body ?? {};
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "text required" });
  }
  try {
    const translated = await translateToEnglish(text);
    res.json({ text: translated });
  } catch (err) {
    console.error("[translate]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`SolSci QVAC server  →  http://localhost:${PORT}`);
  console.log("  GET  /api/health      — server status");
  console.log("  POST /api/suggest     — AI metadata suggestions (Llama 3.2 1B)");
  console.log("  POST /api/search      — semantic search (embeddings)");
  console.log("  POST /api/transcribe  — speech-to-text (Whisper, local)");
  console.log("  POST /api/ocr         — image OCR (ONNX, local)");
  console.log("  POST /api/translate   — translate any language → English (local)");
});

import { loadModel, ocr, unloadModel, OCR_LATIN_RECOGNIZER_1 } from "@qvac/sdk";
import { ocrQueue } from "./queue.js";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

export async function extractTextFromImage(imageBuffer) {
  return ocrQueue.run(() => _extractTextFromImage(imageBuffer));
}

async function _extractTextFromImage(imageBuffer) {
  // OCR model needs a file path, not a buffer — write to temp file
  const tmpPath = join(tmpdir(), `solsci_ocr_${Date.now()}.png`);
  writeFileSync(tmpPath, imageBuffer);

  const modelId = await loadModel({
    modelSrc:    OCR_LATIN_RECOGNIZER_1,
    modelType:   "ocr",
    modelConfig: { langList: ["en"], useGPU: true },
  });
  try {
    const { blocks } = ocr({ modelId, image: tmpPath });
    const result = await blocks;
    return result
      .map((b) => (b.text ?? "").trim())
      .filter(Boolean)
      .join("\n");
  } finally {
    await unloadModel({ modelId });
    try { unlinkSync(tmpPath); } catch {}
  }
}

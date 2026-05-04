/**
 * QVAC OCR — extract text from images entirely on-device via onnx-ocr.
 * Accepts any image Buffer (PNG, JPEG, TIFF, BMP) and returns the extracted text.
 * Useful for processing photos of printed papers, lab notebooks, or screenshots.
 */

import Qvac from "@qvac/sdk";

/**
 * Extract all text from an image buffer.
 * @param {Buffer} imageBuffer  Raw image bytes.
 * @returns {Promise<string>}   Extracted text, blocks joined by newlines.
 */
export async function extractTextFromImage(imageBuffer) {
  const qvac = new Qvac();
  await qvac.loadModel("ocr");

  try {
    const result = qvac.ocr({ image: imageBuffer });

    // result.blocks is a Promise<OcrBlock[]>; each block has a .text property
    const blocks = await result.blocks;

    return blocks
      .map((b) => (b.text ?? b.content ?? "").trim())
      .filter(Boolean)
      .join("\n");
  } finally {
    await qvac.unloadModel("ocr");
  }
}

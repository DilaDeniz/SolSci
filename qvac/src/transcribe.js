import { loadModel, transcribe, unloadModel, WHISPER_TINY } from "@qvac/sdk";
import { llmQueue } from "./queue.js";

export async function transcribeAudio(audioBuffer) {
  return llmQueue.run(() => _transcribeAudio(audioBuffer));
}

async function _transcribeAudio(audioBuffer) {
  const modelId = await loadModel({
    modelSrc: WHISPER_TINY,
    modelType: "whisper",
    modelConfig: {
      audio_format: "f32le",
      strategy:     "greedy",
      language:     "auto",
      translate:    false,
    },
  });
  try {
    const segments = await transcribe({ modelId, audioChunk: audioBuffer });
    if (typeof segments === "string") return segments.trim();
    if (Array.isArray(segments)) {
      return segments.map((s) => (s.text ?? s.content ?? "").trim()).join(" ").trim();
    }
    return String(segments ?? "").trim();
  } finally {
    await unloadModel({ modelId });
  }
}

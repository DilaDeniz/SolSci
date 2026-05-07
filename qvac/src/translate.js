import { loadModel, translate, unloadModel, LLAMA_3_2_1B_INST_Q4_0 } from "@qvac/sdk";
import { llmQueue } from "./queue.js";

export async function translateToEnglish(text) {
  if (!text?.trim()) return "";
  return llmQueue.run(() => _translateToEnglish(text));
}

async function _translateToEnglish(text) {
  const modelId = await loadModel({ modelSrc: LLAMA_3_2_1B_INST_Q4_0, modelType: "llm" });
  try {
    const result = translate({
      modelId,
      text:      text.trim(),
      to:        "en",
      modelType: "llm",
      stream:    false,
    });
    return (await result.text)?.trim() ?? text;
  } finally {
    await unloadModel({ modelId });
  }
}

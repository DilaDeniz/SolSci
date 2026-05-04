/**
 * QVAC translation — convert scientific text to English entirely on-device.
 * Uses the QVAC inference model with a translation-focused system prompt.
 * Accepts any natural language and returns the English equivalent.
 */

import Qvac from "@qvac/sdk";

const SYSTEM_PROMPT = `You are a scientific translator. Your job is to translate the user's text into clear, accurate English.

Rules:
- Preserve all scientific terminology, numbers, units, and proper nouns exactly.
- Output ONLY the English translation — no explanations, no preamble, no quotes.
- If the input is already in English, return it unchanged.`;

/**
 * Translate arbitrary text to English using the on-device LLM.
 * @param {string} text   Input text in any language.
 * @returns {Promise<string>}  English translation.
 */
export async function translateToEnglish(text) {
  if (!text || !text.trim()) return "";

  const qvac = new Qvac();
  await qvac.loadModel("inference");

  let result = "";
  try {
    const stream = await qvac.completion({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user",   content: text.trim() },
      ],
      temperature: 0.1,
      maxTokens:   512,
    });

    for await (const chunk of stream) {
      result += chunk.content ?? "";
    }
  } finally {
    await qvac.unloadModel("inference");
  }

  return result.trim();
}

/**
 * QVAC Whisper speech-to-text.
 * Accepts an audio Buffer (WebM, WAV, MP3, OGG) and returns a transcript string.
 * Everything runs on-device via whispercpp — no audio is ever uploaded.
 */

import Qvac from "@qvac/sdk";

/**
 * Transcribe an audio buffer to text.
 * @param {Buffer} audioBuffer  Raw audio bytes from MediaRecorder or a file.
 * @returns {Promise<string>}   Transcript, or empty string on silence.
 */
export async function transcribeAudio(audioBuffer) {
  const qvac = new Qvac();
  await qvac.loadModel("transcription");

  try {
    const result = await qvac.transcribe({ audio: audioBuffer });

    // SDK may return a plain string or an array of timed segments
    if (typeof result === "string") {
      return result.trim();
    }
    if (Array.isArray(result)) {
      return result.map((s) => (s.text ?? s.content ?? "").trim()).join(" ").trim();
    }
    return String(result ?? "").trim();
  } finally {
    await qvac.unloadModel("transcription");
  }
}

/**
 * Lightweight async queue — ensures only one LLM/model call runs at a time.
 * Any call that arrives while the model is busy waits its turn in order.
 *
 * Usage:
 *   const result = await llmQueue.run(() => expensiveModelCall());
 */

class AsyncQueue {
  #running = false;
  #queue   = [];

  get size() { return this.#queue.length + (this.#running ? 1 : 0); }

  run(fn) {
    return new Promise((resolve, reject) => {
      this.#queue.push({ fn, resolve, reject });
      this.#tick();
    });
  }

  async #tick() {
    if (this.#running || this.#queue.length === 0) return;
    this.#running = true;
    const { fn, resolve, reject } = this.#queue.shift();
    try {
      resolve(await fn());
    } catch (err) {
      reject(err);
    } finally {
      this.#running = false;
      this.#tick();
    }
  }
}

export const llmQueue   = new AsyncQueue(); // inference + transcription + translation
export const embedQueue = new AsyncQueue(); // embeddings (separate model)
export const ocrQueue   = new AsyncQueue(); // OCR model

import { initWhisper, type WhisperContext } from 'whisper.rn';
import { ensureModel, type ModelSpec } from '../llm/modelDownloader';
import { WHISPER_MODEL } from '../../models/catalog';

/**
 * On-device speech-to-text via whisper.cpp (whisper.rn). Tiny English model
 * downloaded at runtime with the same pinned SHA-256 verification as the LLM
 * models. Single-flight; no cloud anywhere in the path.
 */
export class WhisperService {
  private context: WhisperContext | null = null;
  private operation: Promise<unknown> | null = null;
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = (): string => `${this.isLoaded()}:${this.busy}`;
  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
  get busy(): boolean {
    return this.operation !== null;
  }
  isLoaded(): boolean {
    return this.context !== null;
  }

  private async exclusive<T>(run: () => Promise<T>): Promise<T> {
    if (this.operation) throw new Error('Speech service is busy');
    this.operation = run();
    this.notify();
    try {
      return (await this.operation) as T;
    } finally {
      this.operation = null;
      this.notify();
    }
  }

  get spec(): ModelSpec {
    return WHISPER_MODEL;
  }

  /** Loads the context without taking the single-flight lock (internal). */
  private async ensureLoaded(): Promise<void> {
    if (this.context) return;
    const path = await ensureModel(WHISPER_MODEL);
    this.context = await initWhisper({ filePath: path });
  }

  async load(): Promise<void> {
    if (this.context) return;
    await this.exclusive(() => this.ensureLoaded());
  }

  /** Transcribe raw 16 kHz mono float32 PCM samples. */
  async transcribe(samples: Float32Array): Promise<string> {
    return this.exclusive(async () => {
      if (!this.context) await this.ensureLoaded();
      const context = this.context!;
      const buffer = new ArrayBuffer(samples.length * 4);
      new Float32Array(buffer).set(samples);
      const { promise } = context.transcribeData(buffer, { language: 'en' });
      const { result } = await promise;
      return result.trim();
    });
  }

  async unload(): Promise<void> {
    await this.exclusive(async () => {
      if (this.context) {
        const context = this.context;
        this.context = null;
        await context.release();
      }
    });
  }
}

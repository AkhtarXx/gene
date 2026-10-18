import { initLlama, type LlamaContext, type ContextParams } from 'llama.rn';
import { ensureModel, type ModelSpec } from '../llm/modelDownloader';

/**
 * Dedicated on-device embedding model (nomic-embed-text-v1.5-GGUF, 768-dim).
 * Kept separate from the chat model because embeddings require `embedding:true`
 * at load and a different GGUF. nomic models REQUIRE task prefixes.
 */
export class EmbeddingService {
  private ctx: LlamaContext | null = null;
  private dim = 768;
  private loadedSpecId: string | null = null;
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
    return this.ctx !== null;
  }

  private async exclusive<T>(run: () => Promise<T>): Promise<T> {
    if (this.operation) throw new Error('Embedding service is busy');
    this.operation = run();
    this.notify();
    try {
      return (await this.operation) as T;
    } finally {
      this.operation = null;
      this.notify();
    }
  }

  async load(spec: ModelSpec, extra?: Partial<ContextParams>): Promise<void> {
    if (!spec.isEmbedding) throw new Error('An embedding model is required');
    if (this.ctx) {
      if (this.loadedSpecId === spec.id) return;
      throw new Error('Another embedding model is loaded. Disable memory before switching models.');
    }
    await this.exclusive(async () => {
      const path = await ensureModel(spec);
      this.ctx = await initLlama({
        n_ctx: 2048,
        n_gpu_layers: 0,
        n_threads: 6,
        use_mlock: false,
        pooling_type: 'mean',
        ...extra,
        model: path,
        embedding: true,
      });
      this.loadedSpecId = spec.id;
    });
  }

  get dimension(): number {
    return this.dim;
  }

  /** Embed text. Queries must use the `search_query:` prefix per nomic spec. */
  async embed(text: string, isQuery = false): Promise<number[]> {
    return this.exclusive(async () => {
      if (!this.ctx) throw new Error('Embedding model not loaded');
      const prefixed = `${isQuery ? 'search_query: ' : 'search_document: '}${text}`;
      const { embedding } = await this.ctx.embedding(prefixed);
      if (embedding.length !== this.dim || !embedding.every(Number.isFinite))
        throw new Error('Invalid embedding dimensions or values');
      return embedding;
    });
  }

  async unload(): Promise<void> {
    await this.exclusive(async () => {
      if (this.ctx) {
        const ctx = this.ctx;
        this.ctx = null;
        this.loadedSpecId = null;
        await ctx.release();
      }
    });
  }
}

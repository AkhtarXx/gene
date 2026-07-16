import { initLlama, type LlamaContext, type InitParams } from 'llama.rn';
import { ensureModel, type ModelSpec } from '../llm/modelDownloader';

/**
 * Dedicated on-device embedding model (nomic-embed-text-v1.5-GGUF, 768-dim).
 * Kept separate from the chat model because embeddings require `embedding:true`
 * at load and a different GGUF. nomic models REQUIRE task prefixes.
 */
export class EmbeddingService {
  private ctx: LlamaContext | null = null;
  private dim = 768;

  async load(spec: ModelSpec, extra?: Partial<InitParams>): Promise<void> {
    if (this.ctx) return;
    const path = await ensureModel(spec);
    this.ctx = await initLlama({
      model: path,
      embedding: true,
      n_ctx: 8192,
      n_gpu_layers: -1,
      use_mlock: true,
      ...extra,
    });
  }

  get dimension(): number {
    return this.dim;
  }

  /** Embed text. Queries must use the `search_query:` prefix per nomic spec. */
  async embed(text: string, isQuery = false): Promise<number[]> {
    if (!this.ctx) throw new Error('Embedding model not loaded');
    const prefixed = `${isQuery ? 'search_query: ' : 'search_document: '}${text}`;
    const { embedding } = await this.ctx.embedding(prefixed);
    return embedding;
  }

  async unload(): Promise<void> {
    if (this.ctx) {
      await this.ctx.close();
      this.ctx = null;
    }
  }
}

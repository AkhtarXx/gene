import { initLlama, type LlamaContext, type InitParams } from 'llama.rn';
import type { ToolDefinition, ToolCall } from '../../types/tool';
import { ensureModel, type ModelSpec } from './modelDownloader';

export { type ModelSpec };

function parseArgs(a: unknown): Record<string, unknown> {
  if (a == null) return {};
  if (typeof a === 'string') {
    try {
      return JSON.parse(a);
    } catch {
      return {};
    }
  }
  return a as Record<string, unknown>;
}

export class LLMEngineService {
  private context: LlamaContext | null = null;
  private loadedSpec: ModelSpec | null = null;
  /** Single-flight guard: only one completion may run at a time. */
  private inflight: Promise<unknown> | null = null;

  async loadModel(spec: ModelSpec, extra?: Partial<InitParams>): Promise<void> {
    if (this.context && this.loadedSpec?.id === spec.id) return;

    const path = await ensureModel(spec);
    if (this.context) await this.context.close();

    this.context = await initLlama({
      model: path,
      n_ctx: 4096,
      n_gpu_layers: -1,
      n_batch: 512,
      use_mlock: true,
      embedding: true,
      ...extra,
    });
    this.loadedSpec = spec;
  }

  isLoaded(): boolean {
    return this.context !== null;
  }

  get loadedModelId(): string | null {
    return this.loadedSpec?.id ?? null;
  }

  /**
   * Completion with optional tool definitions. Returns text plus any tool
   * calls the model emitted (parsed by llama.rn). When `onToken` is provided,
   * llama.rn streams decoded token text to it live (2nd positional callback).
   */
  async complete(opts: {
    messages: { role: 'system' | 'user' | 'assistant' | 'tool'; content: string }[];
    tools?: ToolDefinition[];
    temperature?: number;
    maxTokens?: number;
    onToken?: (token: string) => void;
  }): Promise<{ text: string; toolCalls: ToolCall[] }> {
    if (!this.context) throw new Error('Model not loaded');

    const run = () =>
      this.context!.completion(
        {
          messages: opts.messages,
          tools:
            opts.tools?.map((t) => ({
              type: 'function' as const,
              function: {
                name: t.name,
                description: t.description,
                parameters: {
                  type: 'object',
                  properties: Object.fromEntries(
                    t.parameters.map((p) => [p.name, { type: p.type, description: p.description }])
                  ),
                  required: t.parameters.filter((p) => p.required).map((p) => p.name),
                },
              },
            })) ?? [],
          tool_choice: 'auto',
          jinja: true,
          temperature: opts.temperature ?? 0.7,
          n_predict: opts.maxTokens ?? 512,
        },
        (data: { token?: string }) => {
          if (data.token) opts.onToken?.(data.token);
        },
      );

    const { text, tool_calls } = (await this.singleFlight(run)) as {
      text?: string;
      tool_calls?: unknown[];
    };

    const toolCalls: ToolCall[] = Array.isArray(tool_calls)
      ? tool_calls.map((c: any) => ({
          name: c.function?.name,
          arguments: parseArgs(c.function?.arguments),
        }))
      : [];
    return { text: text ?? '', toolCalls };
  }

  /** Abort an in-flight completion (llama.rn stopCompletion). */
  async stop(): Promise<void> {
    if (this.context) await this.context.stopCompletion();
  }

  private async singleFlight<T>(fn: () => Promise<T>): Promise<T> {
    if (this.inflight) {
      throw new Error('A completion is already in progress');
    }
    this.inflight = fn();
    try {
      return await this.inflight;
    } finally {
      this.inflight = null;
    }
  }

  async embeddings(text: string): Promise<number[]> {
    if (!this.context) throw new Error('Model not loaded');
    const { embedding } = await this.context.embedding(text);
    return embedding;
  }

  async unload(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
      this.loadedSpec = null;
    }
  }
}

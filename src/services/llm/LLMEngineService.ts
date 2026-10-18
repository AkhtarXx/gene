import { initLlama, getBackendDevicesInfo, type LlamaContext, type ContextParams } from 'llama.rn';
import { Platform } from 'react-native';
import type { ChatMessage, ToolDefinition, ToolCall } from '../../types/tool';
import { ensureModel, type ModelSpec } from './modelDownloader';
import { checkAbort } from '../async';

export { type ModelSpec };

interface Acceleration {
  devices?: string[];
  n_gpu_layers: number;
  enabled: boolean;
}

/**
 * Detect a usable GPU/NPU backend and prefer it when present.
 * iOS: Metal needs no device list, just n_gpu_layers > 0 (llama.cpp falls
 * back to CPU gracefully when no Metal device exists).
 * Android: OpenCL (Adreno) first — more stable — then Hexagon HTP, both
 * selected by concrete device names. No capable device -> pure CPU.
 */
export async function detectAcceleration(): Promise<Acceleration> {
  if (Platform.OS === 'ios') return { n_gpu_layers: 99, enabled: true };
  try {
    const infos = await getBackendDevicesInfo();
    const opencl = infos
      .filter((d) => !d.deviceName.startsWith('HTP') && /opencl|gpu/i.test(`${d.backend} ${d.type ?? ''}`))
      .map((d) => d.deviceName);
    if (opencl.length > 0) return { devices: opencl, n_gpu_layers: 99, enabled: true };
    const htp = infos.filter((d) => d.deviceName.startsWith('HTP')).map((d) => d.deviceName);
    if (htp.length > 0) return { devices: htp, n_gpu_layers: 99, enabled: true };
  } catch (error) {
    console.warn('[llm] backend detection failed, using CPU:', (error as Error).message);
  }
  return { n_gpu_layers: 0, enabled: false };
}

export function parseArgs(a: unknown): Record<string, unknown> {
  if (a == null) return {};
  if (typeof a === 'string') {
    try {
      const parsed = JSON.parse(a);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error('Invalid tool arguments');
      return parsed;
    } catch {
      throw new Error('Invalid tool arguments');
    }
  }
  if (typeof a !== 'object' || Array.isArray(a)) throw new Error('Invalid tool arguments');
  return a as Record<string, unknown>;
}

export class LLMEngineService {
  private context: LlamaContext | null = null;
  private loadedSpec: ModelSpec | null = null;
  /** Single-flight guard: only one completion may run at a time. */
  private inflight: Promise<unknown> | null = null;
  /** Single-flight guard for model loading (prevents double initLlama). */
  private loadInflight: Promise<void> | null = null;
  private loadingId: string | null = null;
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = (): string => `${this.loadedModelId ?? ''}:${this.loadingId ?? ''}:${Boolean(this.inflight)}`;
  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
  get busy(): boolean {
    return Boolean(this.loadInflight || this.inflight);
  }

  async loadModel(spec: ModelSpec, extra?: Partial<ContextParams>): Promise<void> {
    if (spec.isEmbedding) throw new Error('Use the embedding service for embedding models');
    if (this.loadInflight) {
      if (this.loadingId === spec.id) return this.loadInflight;
      throw new Error('Another model is loading. Wait before switching models.');
    }
    if (this.inflight) throw new Error('Stop generation before switching models');
    if (this.context && this.loadedSpec?.id === spec.id) return;
    this.loadingId = spec.id;

    this.loadInflight = (async () => {
      const path = await ensureModel(spec);
      const previous = this.context;
      this.context = null;
      this.loadedSpec = null;
      this.notify();
      if (previous) await previous.release();

      const base = {
        n_ctx: 4096,
        n_threads: 6,
        n_batch: 512,
        use_mlock: false,
        ...extra,
        model: path,
      };
      const accel = await detectAcceleration();
      try {
        this.context = await initLlama({
          ...base,
          n_gpu_layers: accel.n_gpu_layers,
          ...(accel.devices ? { devices: accel.devices } : {}),
        });
      } catch (error) {
        if (!accel.enabled) throw error;
        console.warn('[llm] accelerated load failed, retrying on CPU:', (error as Error).message);
        this.context = await initLlama({ ...base, n_gpu_layers: 0 });
      }
      this.loadedSpec = spec;
    })();
    this.notify();
    try {
      await this.loadInflight;
    } finally {
      this.loadInflight = null;
      this.loadingId = null;
      this.notify();
    }
  }

  isLoaded(): boolean {
    return this.context !== null && !this.loadInflight;
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
    messages: ChatMessage[];
    tools?: ToolDefinition[];
    temperature?: number;
    maxTokens?: number;
    onToken?: (token: string) => void;
    signal?: AbortSignal;
  }): Promise<{
    text: string;
    toolCalls: ToolCall[];
    timings: { tokensPerSecond: number; tokens: number; ms: number } | null;
  }> {
    checkAbort(opts.signal);
    if (!this.context || this.loadInflight) throw new Error('Model not loaded');
    const context = this.context;
    const onAbort = () => {
      // The JSI stop method can return void despite its Promise declaration.
      // Our async wrapper normalizes that return and catches synchronous errors.
      void this.stop().catch(() => {});
    };

    // Forward the FILTERED parsed content as deltas when llama.rn provides it
    // (keeps reasoning/tool-call syntax out of the chat bubble). Falls back to
    // the final parsed answer when `content` is not populated per event.
    let lastContent = '';
    const forwardToken = (data: { token?: string; content?: string }) => {
      if (!opts.onToken) return;
      const parsed = typeof data.content === 'string' ? data.content : '';
      if (parsed.length > lastContent.length && parsed.startsWith(lastContent)) {
        opts.onToken(parsed.slice(lastContent.length));
        lastContent = parsed;
      }
    };

    const run = () =>
      context.completion(
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
        (data: { token?: string; content?: string }) => {
          if (opts.signal?.aborted) {
            onAbort();
            return;
          }
          forwardToken(data);
        }
      );

    opts.signal?.addEventListener('abort', onAbort, { once: true });
    let result: {
      text?: string;
      content?: string;
      tool_calls?: unknown[];
      timings?: { predicted_per_second?: number; predicted_n?: number; predicted_ms?: number };
    };
    try {
      result = await this.singleFlight(run);
      checkAbort(opts.signal);
    } finally {
      opts.signal?.removeEventListener('abort', onAbort);
    }
    const { text, content, tool_calls, timings } = result as {
      text?: string;
      content?: string;
      tool_calls?: unknown[];
      timings?: { predicted_per_second?: number; predicted_n?: number; predicted_ms?: number };
    };

    const toolCalls: ToolCall[] = Array.isArray(tool_calls)
      ? tool_calls.map((c: any) => ({
          id: c.id,
          name: c.function?.name,
          arguments: parseArgs(c.function?.arguments),
        }))
      : [];
    const stats = timings?.predicted_n
      ? {
          tokensPerSecond: Math.round((timings.predicted_per_second ?? 0) * 10) / 10,
          tokens: timings.predicted_n,
          ms: timings.predicted_ms ?? 0,
        }
      : null;
    return { text: content ?? text ?? '', toolCalls, timings: stats };
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
    this.notify();
    try {
      return (await this.inflight) as T;
    } finally {
      this.inflight = null;
      this.notify();
    }
  }

  async embeddings(text: string): Promise<number[]> {
    if (!this.context || this.loadInflight) throw new Error('Model not loaded');
    const context = this.context;
    const { embedding } = await this.singleFlight(() => context.embedding(text));
    return embedding;
  }

  async clearCache(): Promise<void> {
    if (this.loadInflight) throw new Error('Wait for the model to finish loading');
    const context = this.context;
    if (context) await this.singleFlight(() => context.clearCache(true));
  }

  async unload(): Promise<void> {
    if (this.busy) throw new Error('Wait for model operations before unloading');
    if (this.context) {
      const context = this.context;
      this.context = null;
      this.loadedSpec = null;
      this.loadingId = 'unloading';
      this.loadInflight = context.release();
      this.notify();
      try {
        await this.loadInflight;
      } finally {
        this.loadInflight = null;
        this.loadingId = null;
        this.notify();
      }
    }
  }
}

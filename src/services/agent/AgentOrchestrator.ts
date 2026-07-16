import type { ToolCall, ToolDefinition } from '../../types/tool';
import { LLMEngineService } from '../llm/LLMEngineService';
import { ToolRegistry } from './ToolRegistry';
import { SecurityGate } from '../security/SecurityGate';
import { requestConfirm } from '../../ui/confirmBridge';

export interface OrchestratorConfig {
  maxIterations: number;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
}

export interface RunOptions {
  /** Called with incremental, decoded token text of the final user-facing
   * answer as it is generated (live streaming). */
  onToken?: (text: string) => void;
  /** Called when the agent invokes a device tool, with the tool name and the
   * resulting JSON/text (lets the UI show "used tool X" lines). */
  onToolActivity?: (toolName: string, result: string) => void;
}

const DEFAULT_CONFIG: OrchestratorConfig = {
  maxIterations: 6,
  maxTokens: 512,
  temperature: 0.7,
  systemPrompt:
    'You are a private on-device assistant. Use the provided tools to act on the user\'s device only when needed. Never invent tool calls.',
};

/**
 * Owns the agentic loop: system prompt + tools -> LLM -> parse tool calls ->
 * Security Gate -> execute native tool -> feed result back -> repeat until the
 * model returns a final answer or maxIterations is hit. The loop itself runs
 * here; the model never touches the OS directly.
 */
export class AgentOrchestrator {
  private readonly engine: LLMEngineService;
  private readonly registry: ToolRegistry;
  private readonly gate: SecurityGate;
  private readonly config: OrchestratorConfig;

  constructor(
    engine: LLMEngineService,
    registry: ToolRegistry,
    gate: SecurityGate,
    config: Partial<OrchestratorConfig> = {}
  ) {
    this.engine = engine;
    this.registry = registry;
    this.gate = gate;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async run(userMessage: string, opts: RunOptions = {}): Promise<string> {
    if (!this.engine.isLoaded()) {
      const msg = 'Model not loaded.';
      opts.onToken?.(msg);
      return msg;
    }
    const messages: { role: 'system' | 'user' | 'assistant' | 'tool'; content: string }[] = [
      { role: 'system', content: this.config.systemPrompt },
      { role: 'user', content: userMessage },
    ];

    // We only stream the FINAL user-facing answer live (intermediate tool-call
    // turns are short and we consume their parsed tool_calls, not display text).
    // `streaming` flips true after the first tool-call round, so the next
    // (usually final) turn streams token-by-token to the UI.
    let streaming = false;

    for (let i = 0; i < this.config.maxIterations; i++) {
      const { text, toolCalls } = await this.engine.complete({
        messages,
        tools: this.registry.list(),
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens,
        onToken: streaming ? (t) => opts.onToken?.(t) : undefined,
      });

      if (toolCalls.length === 0) {
        if (!streaming) opts.onToken?.(text);
        return text;
      }

      streaming = true;
      for (const call of toolCalls) {
        const result = await this.dispatch(call);
        opts.onToolActivity?.(call.name, result);
        messages.push({ role: 'assistant', content: JSON.stringify(call) });
        messages.push({ role: 'tool', content: result });
      }
    }
    const stopMsg = 'Stopped: maximum steps reached without a final answer.';
    opts.onToken?.(stopMsg);
    return stopMsg;
  }

  /**
   * Resolve a tool call, run it through the Security Gate (confirmation +
   * taint checks), then execute the native handler. The gate can veto or
   * require confirmation; if denied, the model receives a denial string.
   */
  private async dispatch(call: ToolCall): Promise<string> {
    const tool: ToolDefinition | undefined = this.registry.get(call.name);
    if (!tool) {
      return `Error: unknown tool "${call.name}".`;
    }
    const decision = await this.gate.authorize(tool, call.arguments, {
      taintedArgs: false,
      confirm: async (t) =>
        requestConfirm({
          title: `Allow action: ${t.name}?`,
          message: 'This action will run on your device.',
          details: t.description,
        }),
    });
    if (!decision.allowed) {
      return `Action denied: ${decision.reason}`;
    }
    try {
      return await tool.execute(call.arguments);
    } catch (err) {
      return `Tool error: ${(err as Error).message}`;
    }
  }
}

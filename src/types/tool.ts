export type ToolRisk = 'read' | 'write' | 'destructive';

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  risk: ToolRisk;
  parameters: ToolParameter[];
  /** Only outbound phone handoffs with exact app-authored receipt literals. */
  resultPolicy?: 'fixed-phone-receipt';
  /** Personal APK screen actions are reviewed by the native accessibility overlay. */
  confirmationPolicy?: 'native-screen-review';
  /**
   * Native handler. Runs behind the Security Gate. Must NEVER call OS APIs
   * directly outside of this function, and must return a short string/JSON
   * result to feed back into the model context.
   */
  execute: (args: Record<string, unknown>, signal?: AbortSignal) => Promise<string>;
}

export interface ToolCall {
  id?: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: { id?: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
  name?: string;
}

export interface CompletionResult {
  text: string;
  toolCalls: ToolCall[];
}

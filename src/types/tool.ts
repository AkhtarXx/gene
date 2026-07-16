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
  /**
   * Native handler. Runs behind the Security Gate. Must NEVER call OS APIs
   * directly outside of this function, and must return a short string/JSON
   * result to feed back into the model context.
   */
  execute: (args: Record<string, unknown>) => Promise<string>;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface CompletionResult {
  text: string;
  toolCalls: ToolCall[];
}

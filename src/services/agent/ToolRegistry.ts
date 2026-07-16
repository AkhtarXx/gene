import type { ToolDefinition } from '../../types/tool';

/**
 * Deny-by-default registry of agent tools. Nothing is callable unless it is
 * explicitly registered here. Tools carry a risk tier so the Security Gate can
 * decide whether a confirmation prompt is required.
 */
export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  registerAll(tools: ToolDefinition[]): void {
    tools.forEach((t) => this.register(t));
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  /** Tools the model is allowed to see in its catalog (all registered). */
  toChatTools() {
    return this.list().map((t) => ({
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
    }));
  }
}

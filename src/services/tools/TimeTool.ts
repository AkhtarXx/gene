import type { ToolDefinition } from '../../types/tool';

/**
 * Current date/time tool. Small local models hallucinate time constantly; a
 * deterministic read tool is the cheapest fix. No OS permission required.
 */
export const timeTool: ToolDefinition = {
  name: 'get_current_time',
  description:
    'Returns the current date and time (ISO 8601, unix epoch and local string). Use whenever the user asks about the current time, date or day.',
  risk: 'read',
  parameters: [],
  execute: async () => {
    const now = new Date();
    return JSON.stringify({
      iso: now.toISOString(),
      epoch: now.getTime(),
      local: now.toString(),
    });
  },
};

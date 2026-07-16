import type { ToolDefinition, ToolRisk } from '../../types/tool';

export interface AuthorizationDecision {
  allowed: boolean;
  reason: string;
  /** True when a human confirmation prompt is required before execution. */
  requiresConfirmation: boolean;
}

/**
 * Single chokepoint that gates every side-effecting action. Read/search tools
 * pass autonomously; write/destructive tools require confirmation and an audit
 * entry. Untrusted-derived arguments are rejected before any OS call.
 */
export class SecurityGate {
  private auditLog: { name: string; risk: ToolRisk; at: number; allowed: boolean }[] = [];

  async authorize(
    tool: ToolDefinition,
    args: Record<string, unknown>,
    opts: { taintedArgs?: boolean; confirm: (tool: ToolDefinition) => Promise<boolean> } = {
      taintedArgs: false,
      confirm: async () => true,
    }
  ): Promise<AuthorizationDecision> {
    // Privileged sinks refuse tainted (untrusted-origin) arguments deterministically.
    if (opts.taintedArgs && tool.risk !== 'read') {
      this.log(tool, false);
      return { allowed: false, reason: 'Refused: untrusted content cannot drive side effects.', requiresConfirmation: false };
    }

    if (tool.risk === 'destructive' || tool.risk === 'write') {
      const ok = await opts.confirm(tool);
      if (!ok) {
        this.log(tool, false);
        return { allowed: false, reason: 'User denied confirmation.', requiresConfirmation: true };
      }
    }

    this.log(tool, true);
    return { allowed: true, reason: 'authorized', requiresConfirmation: false };
  }

  private log(tool: ToolDefinition, allowed: boolean): void {
    this.auditLog.push({ name: tool.name, risk: tool.risk, at: Date.now(), allowed });
  }

  getAudit(): readonly { name: string; risk: ToolRisk; at: number; allowed: boolean }[] {
    return this.auditLog;
  }
}

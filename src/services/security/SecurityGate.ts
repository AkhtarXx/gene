import type { ToolDefinition, ToolRisk } from '../../types/tool';

export function usesNativeScreenReview(tool: ToolDefinition): boolean {
  return (
    tool.risk === 'write' &&
    tool.confirmationPolicy === 'native-screen-review' &&
    (tool.name === 'device_act' || tool.name === 'device_open_app')
  );
}

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

  constructor(
    private readonly persist?: (entry: { name: string; risk: ToolRisk; at: number; allowed: boolean }) => void
  ) {}

  async authorize(
    tool: ToolDefinition,
    args: Record<string, unknown>,
    opts: {
      taintedArgs?: boolean;
      signal?: AbortSignal;
      confirm: (tool: ToolDefinition, args: Record<string, unknown>) => Promise<boolean>;
    } = {
      taintedArgs: false,
      confirm: async () => false,
    }
  ): Promise<AuthorizationDecision> {
    if (opts.signal?.aborted)
      return { allowed: false, reason: 'Action cancelled.', requiresConfirmation: false };
    for (const parameter of tool.parameters) {
      const value = args[parameter.name];
      if (value === undefined && !parameter.required) continue;
      const valid =
        parameter.type === 'array'
          ? Array.isArray(value)
          : parameter.type === 'object'
            ? value !== null && typeof value === 'object' && !Array.isArray(value)
            : typeof value === parameter.type && (parameter.type !== 'number' || Number.isFinite(value));
      if (!valid) {
        this.log(tool, false);
        return { allowed: false, reason: `Invalid argument: ${parameter.name}`, requiresConfirmation: false };
      }
    }
    // Privileged sinks refuse tainted (untrusted-origin) arguments deterministically.
    const nativeReview = usesNativeScreenReview(tool);
    if (opts.taintedArgs && tool.risk !== 'read' && !nativeReview) {
      this.log(tool, false);
      return {
        allowed: false,
        reason: 'Refused: untrusted content cannot drive side effects.',
        requiresConfirmation: false,
      };
    }

    // This delegates approval, never execution. These two registered adapters
    // can only invoke the native service, which checks session/app/snapshot and
    // requires its own visible Allow-once panel. Their actual outcome is audited
    // by the adapter; no premature "allowed" entry is recorded here.
    if (nativeReview)
      return { allowed: true, reason: 'Native screen review required.', requiresConfirmation: true };

    if (tool.risk === 'destructive' || tool.risk === 'write') {
      const ok = await opts.confirm(tool, args);
      if (opts.signal?.aborted)
        return { allowed: false, reason: 'Action cancelled.', requiresConfirmation: false };
      if (!ok) {
        this.log(tool, false);
        return { allowed: false, reason: 'User denied confirmation.', requiresConfirmation: true };
      }
    }

    this.log(tool, true);
    return { allowed: true, reason: 'authorized', requiresConfirmation: false };
  }

  recordNativeReview(tool: ToolDefinition, allowed: boolean): void {
    if (!usesNativeScreenReview(tool)) throw new Error('Not a native review tool.');
    this.log(tool, allowed);
  }

  private log(tool: ToolDefinition, allowed: boolean): void {
    const entry = { name: tool.name, risk: tool.risk, at: Date.now(), allowed };
    this.auditLog.push(entry);
    if (this.auditLog.length > 500) this.auditLog.shift();
    try {
      this.persist?.(entry);
    } catch {
      // Persistence must never break the gate.
    }
  }

  getAudit(): readonly { name: string; risk: ToolRisk; at: number; allowed: boolean }[] {
    return this.auditLog.map((entry) => ({ ...entry }));
  }
}

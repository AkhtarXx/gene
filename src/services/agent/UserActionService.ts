import type { ToolRegistry } from './ToolRegistry';
import type { SecurityGate } from '../security/SecurityGate';
import { requestConfirm } from '../../ui/confirmBridge';
import { abortable, checkAbort } from '../async';

/** Explicit user-filled shortcuts share confirmation/audit and a native-work
 * lock with chat. Cancelling a wait never releases an unfinished native call. */
export class UserActionService {
  private active: AbortController | null = null;
  private pending = new Set<Promise<string>>();
  private listeners = new Set<() => void>();
  constructor(
    private readonly tools: ToolRegistry,
    private readonly gate: SecurityGate,
    private readonly agentBusy: () => boolean
  ) {}
  get busy(): boolean {
    return this.active !== null || this.pending.size > 0;
  }
  getSnapshot = (): boolean => this.busy;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
  cancel(): void {
    this.active?.abort();
  }

  async run(
    name: string,
    args: Record<string, unknown>,
    prompt: { title: string; message: string }
  ): Promise<string | null> {
    if (this.busy || this.agentBusy()) throw new Error('Wait for the current action to finish.');
    const tool = this.tools.get(name);
    if (!tool || tool.risk === 'read') throw new Error('This shortcut is unavailable.');
    // Only explicit form values enter here, never model/RAG/external results.
    const snapshot = Object.freeze(JSON.parse(JSON.stringify(args))) as Record<string, unknown>;
    const controller = new AbortController();
    this.active = controller;
    const { signal } = controller;
    this.notify();
    try {
      const decision = await abortable(
        this.gate.authorize(tool, snapshot, {
          signal,
          taintedArgs: false,
          confirm: () => requestConfirm({ ...prompt, details: JSON.stringify(snapshot, null, 2), signal }),
        }),
        signal
      );
      checkAbort(signal);
      if (!decision.allowed) return null;
      const native = Promise.resolve().then(() => {
        checkAbort(signal);
        return tool.execute(snapshot, signal);
      });
      this.pending.add(native);
      const settled = () => {
        this.pending.delete(native);
        this.notify();
      };
      void native.then(settled, settled);
      return await abortable(native, signal);
    } finally {
      this.active = null;
      this.notify();
    }
  }
}

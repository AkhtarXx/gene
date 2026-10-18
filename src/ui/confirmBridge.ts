export type ConfirmRequest = { title: string; message: string; details?: string; signal?: AbortSignal };
type ConfirmFn = (r: ConfirmRequest) => Promise<boolean>;

let handler: ConfirmFn | null = null;

/** UI layer registers the real prompt here; non-React classes call requestConfirm. */
export function setConfirmHandler(fn: ConfirmFn | null): void {
  handler = fn;
}

/** Resolves to false if no UI handler is registered (safe default = deny). */
export function requestConfirm(r: ConfirmRequest): Promise<boolean> {
  return handler && !r.signal?.aborted ? handler(r) : Promise.resolve(false);
}

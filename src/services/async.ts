/** Reject a wait promptly on cancellation; the underlying native call may still settle. */
export function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('Operation cancelled');
}

export function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new Error('Operation cancelled'));
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

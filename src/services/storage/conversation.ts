import type { MessageMeta, StoredMessage } from './AppStore';

/** New conversations use the default catalog. Explicit saved choices fail
 * closed: newly added tools never become enabled without the user's choice. */
export function parseToolPreferences(value: string | null, names: string[]): Record<string, boolean> {
  if (value === null) return Object.fromEntries(names.map((name) => [name, true]));
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    parsed = null;
  }
  const valid = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
  return Object.fromEntries(
    names.map((name) => [name, valid && (parsed as Record<string, unknown>)[name] === true])
  );
}

export function parseMessageMeta(value: string | null): MessageMeta {
  try {
    const parsed = JSON.parse(value ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return {
      tainted: typeof parsed.tainted === 'boolean' ? parsed.tainted : undefined,
      error: parsed.error === true,
      activities: Array.isArray(parsed.activities)
        ? parsed.activities.filter((item: unknown) => {
            const activity = item as { name?: unknown; result?: unknown } | null;
            return activity && typeof activity.name === 'string' && typeof activity.result === 'string';
          })
        : undefined,
      stats:
        parsed.stats && Number.isFinite(parsed.stats.tokens) && Number.isFinite(parsed.stats.tokensPerSecond)
          ? parsed.stats
          : undefined,
    };
  } catch {
    return {};
  }
}

export function conversationTurns(
  rows: StoredMessage[]
): { user: string; assistant: string; tainted: boolean }[] {
  const turns: { user: string; assistant: string; tainted: boolean }[] = [];
  for (const row of rows) {
    if (row.role === 'user') turns.push({ user: row.content, assistant: '', tainted: false });
    else if (turns.length) {
      const turn = turns[turns.length - 1];
      turn.assistant += row.content;
      turn.tainted ||= parseMessageMeta(row.meta).tainted !== false;
    }
  }
  return turns.filter((turn) => turn.user && turn.assistant);
}

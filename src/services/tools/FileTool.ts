import * as FileSystem from 'expo-file-system';
import type { ToolDefinition } from '../../types/tool';

const SANDBOX = FileSystem.documentDirectory!;
const MAX_WRITE_BYTES = 1_000_000;

/**
 * Only allow paths inside the app sandbox. Normalizes `..`/`.` segments so a
 * traversals like "../../etc/passwd" cannot escape the sandbox (startsWith
 * alone is NOT sufficient because it does not canonicalize parent dirs).
 */
function safePath(path: string): string {
  const clean = String(path)
    .split('/')
    .filter((p) => p !== '..' && p !== '.')
    .join('/');
  const full = SANDBOX + clean;
  if (!full.startsWith(SANDBOX)) throw new Error('path_outside_sandbox');
  return full;
}

/**
 * File tools operate only within the app's private Documents directory.
 * Read is a `read` tier; write is a `write` tier requiring confirmation.
 */
export const fileRead: ToolDefinition = {
  name: 'file_read',
  description: 'Reads a UTF-8 text file from the app sandbox (relative path). Returns the file content.',
  risk: 'read',
  parameters: [
    { name: 'path', type: 'string', description: 'Relative path inside the app sandbox, e.g. "notes/memo.txt".', required: true },
  ],
  execute: async (args) => {
    try {
      const full = safePath(String(args.path));
      const info = await FileSystem.getInfoAsync(full);
      if (!info.exists) return JSON.stringify({ ok: false, error: 'file_not_found' });
      const content = await FileSystem.readAsStringAsync(full, { encoding: FileSystem.EncodingType.UTF8 });
      return JSON.stringify({ ok: true, content: content.slice(0, 8000) });
    } catch (e) {
      return JSON.stringify({ ok: false, error: (e as Error).message });
    }
  },
};

export const fileWrite: ToolDefinition = {
  name: 'file_write',
  description: 'Writes UTF-8 text to a file in the app sandbox (relative path). Overwrites if it exists.',
  risk: 'write',
  parameters: [
    { name: 'path', type: 'string', description: 'Relative path inside the app sandbox.', required: true },
    { name: 'content', type: 'string', description: 'Text content to write (max ~1MB).', required: true },
  ],
  execute: async (args) => {
    try {
      const content = String(args.content);
      if (content.length > MAX_WRITE_BYTES) return JSON.stringify({ ok: false, error: 'content_too_large' });
      const full = safePath(String(args.path));
      await FileSystem.writeAsStringAsync(full, content, { encoding: FileSystem.EncodingType.UTF8 });
      return JSON.stringify({ ok: true, path: String(args.path) });
    } catch (e) {
      return JSON.stringify({ ok: false, error: (e as Error).message });
    }
  },
};

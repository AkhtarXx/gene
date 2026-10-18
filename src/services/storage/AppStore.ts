import { open, type DB } from '@op-engineering/op-sqlite';

export interface ConversationRow {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  system_prompt: string;
  tools_json: string | null;
  memory_enabled: number;
}

export interface StoredMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: number;
  meta: string | null;
}

export interface MessageMeta {
  /** Missing on legacy messages: restore conservatively as untrusted. */
  tainted?: boolean;
  activities?: { name: string; result: string }[];
  stats?: { tokensPerSecond: number; tokens: number; ms: number };
  error?: boolean;
}

export interface AuditEntry {
  name: string;
  risk: string;
  at: number;
  allowed: boolean;
}

export interface AuditRow extends AuditEntry {
  id: number;
}

export interface MemoryDocRow {
  docId: string;
  count: number;
  text: string;
}

/** One persistent, WAL-mode SQLite database for conversations, messages,
 *  settings, and the security audit trail. All data stays on-device. */
export class AppStore {
  private db: DB | null = null;
  private initializing: Promise<DB> | null = null;

  private init(): Promise<DB> {
    if (this.db) return Promise.resolve(this.db);
    if (!this.initializing) {
      this.initializing = this.openDatabase().catch((error) => {
        this.initializing = null;
        throw error;
      });
    }
    return this.initializing;
  }

  private async openDatabase(): Promise<DB> {
    const db = open({ name: 'app.db', location: 'default' });
    try {
      await db.execute('PRAGMA journal_mode = WAL;');
      await db.execute(
        `CREATE TABLE IF NOT EXISTS conversations (
           id TEXT PRIMARY KEY,
           title TEXT NOT NULL,
           created_at INTEGER NOT NULL,
           updated_at INTEGER NOT NULL,
           system_prompt TEXT NOT NULL DEFAULT '',
           tools_json TEXT,
           memory_enabled INTEGER NOT NULL DEFAULT 1
         );`
      );
      await db.execute(
        `CREATE TABLE IF NOT EXISTS messages (
           id TEXT PRIMARY KEY,
           conversation_id TEXT NOT NULL,
           role TEXT NOT NULL,
           content TEXT NOT NULL,
           created_at INTEGER NOT NULL,
           meta TEXT
         );`
      );
      await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id, created_at);'
      );
      await db.execute(
        `CREATE TABLE IF NOT EXISTS settings (
           key TEXT PRIMARY KEY,
           value TEXT NOT NULL
         );`
      );
      await db.execute(
        `CREATE TABLE IF NOT EXISTS audit (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           name TEXT NOT NULL,
           risk TEXT NOT NULL,
           at INTEGER NOT NULL,
           allowed INTEGER NOT NULL
         );`
      );
      this.db = db;
      return db;
    } catch (error) {
      await db.closeAsync();
      this.db = null;
      throw error;
    }
  }

  // ---------------------------------------------------------------- settings

  async getSetting(key: string): Promise<string | null> {
    const db = await this.init();
    const rows = await db.execute('SELECT value FROM settings WHERE key = ?;', [key]);
    const row = rows.rows?.[0] as { value?: string } | undefined;
    return row?.value ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    const db = await this.init();
    await db.execute(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;',
      [key, value]
    );
  }

  // ---------------------------------------------------------- conversations

  async createConversation(
    id: string,
    title: string,
    initial: { system_prompt?: string; tools_json?: string | null; memory_enabled?: boolean } = {}
  ): Promise<void> {
    const db = await this.init();
    const now = Date.now();
    await db.execute(
      'INSERT INTO conversations (id, title, created_at, updated_at, system_prompt, tools_json, memory_enabled) VALUES (?, ?, ?, ?, ?, ?, ?);',
      [
        id,
        title,
        now,
        now,
        initial.system_prompt ?? '',
        initial.tools_json ?? null,
        initial.memory_enabled === false ? 0 : 1,
      ]
    );
  }

  async listConversations(): Promise<ConversationRow[]> {
    const db = await this.init();
    const rows = await db.execute('SELECT * FROM conversations ORDER BY updated_at DESC;');
    return (rows.rows ?? []).map((row: any) => row as ConversationRow);
  }

  async getConversation(id: string): Promise<ConversationRow | null> {
    const db = await this.init();
    const rows = await db.execute('SELECT * FROM conversations WHERE id = ?;', [id]);
    const row = (rows.rows ?? [])[0];
    return row ? (row as unknown as ConversationRow) : null;
  }

  async renameConversation(id: string, title: string): Promise<void> {
    const db = await this.init();
    await db.execute('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?;', [
      title,
      Date.now(),
      id,
    ]);
  }

  async updateConversation(
    id: string,
    fields: { system_prompt?: string; tools_json?: string | null; memory_enabled?: boolean }
  ): Promise<void> {
    const db = await this.init();
    await db.transaction(async (tx) => {
      if (fields.system_prompt !== undefined) {
        await tx.execute('UPDATE conversations SET system_prompt = ? WHERE id = ?;', [
          fields.system_prompt,
          id,
        ]);
      }
      if (fields.tools_json !== undefined) {
        await tx.execute('UPDATE conversations SET tools_json = ? WHERE id = ?;', [fields.tools_json, id]);
      }
      if (fields.memory_enabled !== undefined) {
        await tx.execute('UPDATE conversations SET memory_enabled = ? WHERE id = ?;', [
          fields.memory_enabled ? 1 : 0,
          id,
        ]);
      }
      await tx.execute('UPDATE conversations SET updated_at = ? WHERE id = ?;', [Date.now(), id]);
    });
  }

  async touchConversation(id: string): Promise<void> {
    const db = await this.init();
    await db.execute('UPDATE conversations SET updated_at = ? WHERE id = ?;', [Date.now(), id]);
  }

  async deleteConversation(id: string): Promise<void> {
    const db = await this.init();
    await db.transaction(async (tx) => {
      await tx.execute('DELETE FROM messages WHERE conversation_id = ?;', [id]);
      await tx.execute('DELETE FROM conversations WHERE id = ?;', [id]);
    });
  }

  // -------------------------------------------------------------- messages

  async listMessages(conversationId: string): Promise<StoredMessage[]> {
    const db = await this.init();
    const rows = await db.execute(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC;',
      [conversationId]
    );
    return (rows.rows ?? []).map((row: any) => row as StoredMessage);
  }

  async appendMessage(
    conversationId: string,
    message: { id: string; role: 'user' | 'assistant'; content: string; meta?: MessageMeta }
  ): Promise<void> {
    const db = await this.init();
    await db.execute(
      'INSERT INTO messages (id, conversation_id, role, content, created_at, meta) VALUES (?, ?, ?, ?, ?, ?);',
      [
        message.id,
        conversationId,
        message.role,
        message.content,
        Date.now(),
        message.meta ? JSON.stringify(message.meta) : null,
      ]
    );
    await db.execute('UPDATE conversations SET updated_at = ? WHERE id = ?;', [Date.now(), conversationId]);
  }

  async updateMessage(id: string, fields: { content?: string; meta?: MessageMeta | null }): Promise<void> {
    const db = await this.init();
    if (fields.content !== undefined) {
      await db.execute('UPDATE messages SET content = ? WHERE id = ?;', [fields.content, id]);
    }
    if (fields.meta !== undefined) {
      await db.execute('UPDATE messages SET meta = ? WHERE id = ?;', [
        fields.meta ? JSON.stringify(fields.meta) : null,
        id,
      ]);
    }
  }

  async deleteMessagesAfter(conversationId: string, messageId: string): Promise<void> {
    const db = await this.init();
    await db.execute(
      'DELETE FROM messages WHERE conversation_id = ? AND rowid >= (SELECT rowid FROM messages WHERE conversation_id = ? AND id = ?);',
      [conversationId, conversationId, messageId]
    );
  }

  /** Persist a conservative assistant placeholder before inference starts. */
  async beginExchange(
    conversationId: string,
    user: { id: string; content: string },
    assistantId: string
  ): Promise<void> {
    const db = await this.init();
    await db.transaction(async (tx) => {
      const now = Date.now();
      await tx.execute(
        'INSERT INTO messages (id, conversation_id, role, content, created_at, meta) VALUES (?, ?, ?, ?, ?, ?);',
        [user.id, conversationId, 'user', user.content, now, null]
      );
      await tx.execute(
        'INSERT INTO messages (id, conversation_id, role, content, created_at, meta) VALUES (?, ?, ?, ?, ?, ?);',
        [
          assistantId,
          conversationId,
          'assistant',
          'Response interrupted. You can retry this message.',
          now,
          JSON.stringify({ tainted: true, error: true }),
        ]
      );
      await tx.execute('UPDATE conversations SET updated_at = ? WHERE id = ?;', [now, conversationId]);
    });
  }

  // ----------------------------------------------------------------- audit

  async appendAudit(entry: AuditEntry): Promise<void> {
    const db = await this.init();
    await db.execute('INSERT INTO audit (name, risk, at, allowed) VALUES (?, ?, ?, ?);', [
      entry.name,
      entry.risk,
      entry.at,
      entry.allowed ? 1 : 0,
    ]);
  }

  async listAudit(limit = 200): Promise<AuditRow[]> {
    const db = await this.init();
    const rows = await db.execute('SELECT * FROM audit ORDER BY id DESC LIMIT ?;', [limit]);
    return (rows.rows ?? []).map((row: any) => ({ ...row, allowed: Boolean(row.allowed) }));
  }

  async clearAudit(): Promise<void> {
    const db = await this.init();
    await db.execute('DELETE FROM audit;');
  }

  // ----------------------------------------------------------- export/wipe

  async exportAll(): Promise<string> {
    const db = await this.init();
    const conversations = await this.listConversations();
    const messages: StoredMessage[] = [];
    for (const conversation of conversations) {
      messages.push(...(await this.listMessages(conversation.id)));
    }
    const audit = await this.listAudit(10000);
    const settings: Record<string, string> = {};
    const settingRows = await db.execute('SELECT * FROM settings;');
    for (const row of (settingRows.rows ?? []) as { key: string; value: string }[]) {
      settings[row.key] = row.value;
    }
    return JSON.stringify(
      { exported_at: new Date().toISOString(), conversations, messages, audit, settings },
      null,
      2
    );
  }

  async wipeAll(): Promise<void> {
    const db = await this.init();
    await db.transaction(async (tx) => {
      await tx.execute('DELETE FROM messages;');
      await tx.execute('DELETE FROM conversations;');
      await tx.execute('DELETE FROM audit;');
      await tx.execute('DELETE FROM settings;');
    });
  }

  /** Deletes chats/messages but preserves the audit trail and settings. */
  async clearConversations(): Promise<void> {
    const db = await this.init();
    await db.transaction(async (tx) => {
      await tx.execute('DELETE FROM messages;');
      await tx.execute('DELETE FROM conversations;');
    });
  }

  async close(): Promise<void> {
    const db = this.db;
    this.db = null;
    this.initializing = null;
    if (db) await db.closeAsync();
  }
}

export const appStore = new AppStore();

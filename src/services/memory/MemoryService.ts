import { open, type DB } from '@op-engineering/op-sqlite';
import type { EmbeddingService } from './EmbeddingService';

const CHUNK_CHARS = 880;
const OVERLAP_CHARS = 128;
function chunkText(text: string): string[] {
  const chunks: string[] = [];
  for (let start = 0; start < text.length; start += CHUNK_CHARS - OVERLAP_CHARS) {
    const chunk = text.slice(start, start + CHUNK_CHARS).trim();
    if (chunk) chunks.push(chunk);
    if (start + CHUNK_CHARS >= text.length) break;
  }
  return chunks;
}

/** Serializes the whole embedding + SQL operation, including init/close. */
export class MemoryService {
  private db: DB | null = null;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly embeddings: EmbeddingService,
    private readonly name = 'memory',
    private readonly dim = 768
  ) {}

  isReady(): boolean {
    return this.db !== null && this.embeddings.isLoaded();
  }
  private serialized<T>(run: () => Promise<T>): Promise<T> {
    const work = this.tail.then(run);
    this.tail = work.catch(() => {});
    return work;
  }

  init(): Promise<void> {
    return this.serialized(async () => {
      if (this.db) return;
      const db = open({ name: `${this.name}.db`, location: 'default' });
      try {
        await db.execute(`CREATE TABLE IF NOT EXISTS chunks (
          id INTEGER PRIMARY KEY AUTOINCREMENT, doc_id TEXT NOT NULL, text TEXT NOT NULL
        );`);
        await db.execute(
          `CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(embedding float[${this.dim}]);`
        );
        this.db = db;
      } catch (error) {
        await db.closeAsync();
        throw error;
      }
    });
  }

  addDocument(docId: string, text: string): Promise<void> {
    return this.serialized(async () => {
      const db = this.db;
      if (!db) throw new Error('MemoryService not initialized');
      const chunks = chunkText(text);
      // Compute before starting the transaction: either the complete document
      // and its vectors commit, or none of it does.
      const vectors: number[][] = [];
      for (const chunk of chunks) vectors.push(await this.embeddings.embed(chunk, false));
      await db.transaction(async (tx) => {
        for (let i = 0; i < chunks.length; i++) {
          const res = await tx.execute('INSERT INTO chunks (doc_id, text) VALUES (?, ?);', [
            docId,
            chunks[i],
          ]);
          if (!res.insertId) throw new Error('Failed to insert memory chunk');
          await tx.execute('INSERT INTO vec_chunks (rowid, embedding) VALUES (?, ?);', [
            res.insertId,
            JSON.stringify(vectors[i]),
          ]);
        }
      });
    });
  }

  query(text: string, topK = 4): Promise<string[]> {
    return this.serialized(async () => {
      const db = this.db;
      if (!db) throw new Error('MemoryService not initialized');
      if (!Number.isInteger(topK) || topK < 1 || topK > 10) throw new Error('topK must be between 1 and 10');
      const vector = await this.embeddings.embed(text, true);
      const result = await db.execute(
        `SELECT c.text FROM vec_chunks v
        JOIN chunks c ON c.id = v.rowid
        WHERE v.embedding MATCH ? AND k = ? ORDER BY distance LIMIT ?;`,
        [JSON.stringify(vector), topK, topK]
      );
      return result.rows.map((row) => String(row.text));
    });
  }

  /** Grouped view of what is stored, newest first (for the Memory screen). */
  listDocuments(limit = 100): Promise<{ docId: string; count: number; text: string }[]> {
    return this.serialized(async () => {
      const db = this.db;
      if (!db) throw new Error('MemoryService not initialized');
      const result = await db.execute(
        `SELECT c.doc_id AS docId, COUNT(*) AS count, MAX(c.text) AS text
           FROM chunks c GROUP BY c.doc_id ORDER BY MAX(c.id) DESC LIMIT ?;`,
        [limit]
      );
      return (result.rows ?? []).map((row: any) => ({
        docId: String(row.docId),
        count: Number(row.count),
        text: String(row.text).slice(0, 300),
      }));
    });
  }

  deleteDocument(docId: string): Promise<void> {
    return this.serialized(async () => {
      const db = this.db;
      if (!db) throw new Error('MemoryService not initialized');
      await db.transaction(async (tx) => {
        const rows = await tx.execute('SELECT id FROM chunks WHERE doc_id = ?;', [docId]);
        for (const row of rows.rows ?? []) {
          await tx.execute('DELETE FROM vec_chunks WHERE rowid = ?;', [(row as { id: number }).id]);
        }
        await tx.execute('DELETE FROM chunks WHERE doc_id = ?;', [docId]);
      });
    });
  }

  stats(): Promise<{ docs: number; chunks: number }> {
    return this.serialized(async () => {
      const db = this.db;
      if (!db) throw new Error('MemoryService not initialized');
      const result = await db.execute(
        'SELECT COUNT(DISTINCT doc_id) AS docs, COUNT(*) AS chunks FROM chunks;'
      );
      const row = (result.rows ?? [])[0] as { docs: number; chunks: number } | undefined;
      return { docs: Number(row?.docs ?? 0), chunks: Number(row?.chunks ?? 0) };
    });
  }

  clear(): Promise<void> {
    return this.serialized(async () => {
      const db = this.db;
      if (!db) throw new Error('MemoryService not initialized');
      await db.transaction(async (tx) => {
        await tx.execute('DELETE FROM vec_chunks;');
        await tx.execute('DELETE FROM chunks;');
      });
    });
  }

  /** Hard wipe of the memory database — works even when the embedding model
   *  is not loaded (delete-everything must not depend on model state). */
  destroyAll(): Promise<void> {
    return this.serialized(async () => {
      const db = this.db ?? open({ name: `${this.name}.db`, location: 'default' });
      try {
        await db.execute('DROP TABLE IF EXISTS vec_chunks;');
        await db.execute('DROP TABLE IF EXISTS chunks;');
      } finally {
        this.db = null;
        await db.closeAsync();
      }
    });
  }

  close(): Promise<void> {
    return this.serialized(async () => {
      const db = this.db;
      this.db = null;
      try {
        if (db) await db.closeAsync();
      } finally {
        await this.embeddings.unload();
      }
    });
  }
}

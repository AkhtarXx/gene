import { open, type DB } from '@op-engineering/op-sqlite';
import { EmbeddingService } from './EmbeddingService';

/** Approx tokens per chunk + overlap. Edge models' working memory is ~1K tok,
 *  so keep each retrieved region small (research: <=256 tok chunks). */
const CHUNK_TOKENS = 220;
const OVERLAP_TOKENS = 32;
const TOKENS_PER_CHAR = 1 / 4; // rough heuristic for latin text

function chunkText(text: string): string[] {
  const chunkChars = Math.round(CHUNK_TOKENS / TOKENS_PER_CHAR);
  const overlapChars = Math.round(OVERLAP_TOKENS / TOKENS_PER_CHAR);
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkChars, text.length);
    chunks.push(text.slice(start, end).trim());
    if (end === text.length) break;
    start = end - overlapChars;
  }
  return chunks.filter((c) => c.length > 0);
}

/**
 * On-device memory / RAG. Stores document chunks + their embeddings in an
 * op-sqlite database with the compiled-in sqlite-vec extension, and retrieves
 * the top-k most similar chunks for a query — fully offline.
 */
export class MemoryService {
  private db: DB | null = null;
  private readonly embeddings: EmbeddingService;
  private readonly name: string;
  private readonly dim: number;

  constructor(embeddings: EmbeddingService, name = 'memory', dim = 768) {
    this.embeddings = embeddings;
    this.name = name;
    this.dim = dim;
  }

  async init(): Promise<void> {
    this.db = open({ name: `${this.name}.db`, location: 'default' });
    await this.db.execute(
      `CREATE TABLE IF NOT EXISTS chunks (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         doc_id TEXT NOT NULL,
         text TEXT NOT NULL
       );`
    );
    await this.db.execute(
      `CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(embedding float[${this.dim}]);`
    );
  }

  /** Split a document, embed each chunk, and store text + vector. */
  async addDocument(docId: string, text: string): Promise<void> {
    if (!this.db) throw new Error('MemoryService not initialized');
    const chunks = chunkText(text);
    for (const chunk of chunks) {
      const vector = await this.embeddings.embed(chunk, false);
      const res = await this.db.execute(
        `INSERT INTO chunks (doc_id, text) VALUES (?, ?);`,
        [docId, chunk]
      );
      const rowid = (res.insertId as number) ?? 0;
      await this.db.execute(`INSERT INTO vec_chunks (rowid, embedding) VALUES (?, ?);`, [
        rowid,
        JSON.stringify(vector),
      ]);
    }
  }

  /** Retrieve the top-k most similar chunks for a query. */
  async query(text: string, topK = 4): Promise<string[]> {
    if (!this.db) throw new Error('MemoryService not initialized');
    const vector = await this.embeddings.embed(text, true);
    const rows = await this.db.execute(
      `SELECT c.text FROM vec_chunks v
         JOIN chunks c ON c.id = v.rowid
       WHERE v.embedding MATCH ? AND k = ?
       ORDER BY distance LIMIT ?;`,
      [JSON.stringify(vector), topK, topK]
    );
    return (rows.rows ?? []).map((r: any) => r.text as string);
  }

  async close(): Promise<void> {
    await this.embeddings.unload();
    if (this.db) {
      await this.db.closeAsync();
      this.db = null;
    }
  }
}

import * as FileSystem from 'expo-file-system';
import { fileHash } from '@preeternal/react-native-file-hash';

export interface ModelSpec {
  id: string;
  label: string;
  /** HuggingFace repo + filename used for the resolve URL, the SHA-256 API
   * lookup, and (optionally) an independent supply-chain cross-check. */
  repo: string;
  filename: string;
  /** HuggingFace resolve URL (302-redirects to the Xet CDN). */
  url: string;
  /** Pinned SHA-256 (HF `lfs.oid`) for supply-chain safety. Verified live. */
  sha256: string;
  /** Exact GGUF size in bytes (from HF API) — used for RAM tiers + size check. */
  sizeBytes: number;
  paramsB: 0.5 | 1 | 1.5 | 3 | 8;
  /** True for the embedding model (used by MemoryService/RAG). */
  isEmbedding?: boolean;
}

const MODEL_DIR = `${FileSystem.documentDirectory}models/`;
const HF_API = 'https://huggingface.co/api/models';
const operations = new Map<string, Promise<string>>();
const listeners = new Set<() => void>();
const progressListeners = new Map<string, Set<(progress: number) => void>>();
export const subscribeDownloads = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getDownloadSnapshot = (): string => [...operations.keys()].join(',');

export interface HfFileMeta {
  oid: string;
  size: number;
}

/**
 * Fetch the canonical content SHA-256 (`lfs.oid`) + size for a GGUF from the
 * HuggingFace tree API. This is the independent source of truth used to
 * cross-check the pinned hash at download time (no full-file download needed).
 */
export async function fetchHfFileMeta(repo: string, filename: string): Promise<HfFileMeta> {
  // limit=1000 avoids the HF tree API's default 50-entry truncation, which
  // would silently "lose" the target file in repos with many quantizations.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${HF_API}/${repo}/tree/main?limit=1000`, { signal: controller.signal });
    if (!res.ok) throw new Error(`HF API ${res.status} for ${repo}`);
    const tree = (await res.json()) as { path: string; lfs?: { oid: string; size: number } }[];
    const entry = tree.find((d) => d.path === filename);
    if (!entry || !entry.lfs?.oid) {
      throw new Error(`No LFS hash for ${repo}/${filename}`);
    }
    return { oid: entry.lfs.oid, size: entry.lfs.size };
  } finally {
    clearTimeout(timeout);
  }
}

/** Resolve the expected SHA-256: pinned value, else live HF API lookup. */
export async function resolveExpectedSha256(spec: ModelSpec): Promise<string> {
  if (spec.sha256) return spec.sha256;
  const meta = await fetchHfFileMeta(spec.repo, spec.filename);
  return meta.oid;
}

/**
 * Cross-check the pinned hash against the live HF `lfs.oid`. Only runs on a
 * FRESH download (supply-chain revalidation of new bytes). Network/API
 * failures are non-fatal (we already verified the local hash); a real
 * mismatch is fatal and deletes the file.
 */
async function crossCheckHf(spec: ModelSpec, pinned: string): Promise<void> {
  try {
    const meta = await fetchHfFileMeta(spec.repo, spec.filename);
    if (meta.oid.toLowerCase() !== pinned.toLowerCase()) {
      await FileSystem.deleteAsync(modelPath(spec), { idempotent: true });
      throw new Error(`Supply-chain mismatch: HF ${meta.oid} vs pinned ${pinned}`);
    }
    if (spec.sizeBytes && meta.size && meta.size !== spec.sizeBytes) {
      console.warn(`[model] size drift: HF ${meta.size} vs catalog ${spec.sizeBytes}`);
    }
  } catch (e) {
    if ((e as Error).message.includes('Supply-chain')) throw e;
    console.warn('[model] HF cross-check skipped:', (e as Error).message);
  }
}

/** Absolute on-device path for a model (used by UI download + engine load). */
export function modelPath(spec: ModelSpec): string {
  return `${MODEL_DIR}${spec.id}.gguf`;
}

/**
 * Download a model with progress reporting (SDK 53 `createDownloadResumable`).
 * Falls back to logging when the server omits Content-Length. Resolves once
 * the file is fully written (integrity is verified later by ensureModel/load).
 */
export async function downloadModelWithProgress(
  spec: ModelSpec,
  onProgress?: (fraction: number) => void
): Promise<string> {
  const observers = progressListeners.get(spec.id) ?? new Set<(progress: number) => void>();
  progressListeners.set(spec.id, observers);
  if (onProgress) observers.add(onProgress);
  let operation = operations.get(spec.id);
  if (!operation) {
    operation = performDownload(spec, (fraction) => observers.forEach((listener) => listener(fraction)));
    operations.set(spec.id, operation);
    listeners.forEach((listener) => listener());
    const finished = () => {
      operations.delete(spec.id);
      listeners.forEach((listener) => listener());
    };
    void operation.then(finished, finished);
  }
  try {
    return await operation;
  } finally {
    if (onProgress) observers.delete(onProgress);
    if (!observers.size) progressListeners.delete(spec.id);
  }
}

async function performDownload(spec: ModelSpec, onProgress: (fraction: number) => void): Promise<string> {
  await FileSystem.makeDirectoryAsync(MODEL_DIR, { intermediates: true });
  const dest = modelPath(spec);
  const info = await FileSystem.getInfoAsync(dest);
  if (info.exists) {
    // Cache hit: verify locally only — no network, works fully offline.
    const expected = await resolveExpectedSha256(spec);
    await verifyHash(dest, expected);
    await verifySize(dest, spec.sizeBytes);
    return dest;
  }

  const resumable = FileSystem.createDownloadResumable(spec.url, dest, {}, (p) => {
    const { totalBytesWritten, totalBytesExpectedToWrite } = p as {
      totalBytesWritten: number;
      totalBytesExpectedToWrite: number;
    };
    if (totalBytesExpectedToWrite > 0) onProgress?.(totalBytesWritten / totalBytesExpectedToWrite);
    else onProgress?.(-1);
  });
  try {
    const result = await resumable.downloadAsync();
    if (!result || result.status !== 200) {
      await FileSystem.deleteAsync(dest, { idempotent: true });
      throw new Error(`Model download failed: HTTP ${result?.status ?? 'cancelled'}`);
    }
    // Integrity + size check is mandatory even on the UI download path.
    const expected = await resolveExpectedSha256(spec);
    await verifyHash(dest, expected);
    await verifySize(dest, spec.sizeBytes);
    await crossCheckHf(spec, expected);
    return result.uri;
  } catch (error) {
    await FileSystem.deleteAsync(dest, { idempotent: true });
    throw error;
  }
}

/**
 * Runtime GGUF download + pinned SHA-256 verification. Shared by every service
 * that needs a model so the integrity check lives in exactly one place.
 * A tampered/mismatched file is deleted and rejected before it can load.
 */
export async function ensureModel(spec: ModelSpec): Promise<string> {
  return downloadModelWithProgress(spec);
}

async function verifyHash(path: string, expected: string): Promise<void> {
  const hash = await fileHash(path, 'SHA-256');
  if (hash.toLowerCase() !== expected.toLowerCase()) {
    await FileSystem.deleteAsync(path, { idempotent: true });
    throw new Error(`Model integrity check failed (SHA-256 mismatch): ${hash}`);
  }
}

async function verifySize(path: string, expected?: number): Promise<void> {
  if (!expected) return;
  const info = await FileSystem.getInfoAsync(path);
  if (info.exists && 'size' in info && typeof info.size === 'number' && info.size !== expected) {
    await FileSystem.deleteAsync(path, { idempotent: true });
    throw new Error(`Model size mismatch: got ${info.size}, expected ${expected}`);
  }
}

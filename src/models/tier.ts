import { Device } from 'expo-device';
import { CHAT_MODELS, EMBEDDING_MODEL, type ModelSpec } from './catalog';

const GB = 1024 ** 3;

/** Total physical device RAM in bytes (expo-device, synchronous). */
export function deviceRamBytes(): number {
  return Device.totalMemory ?? 0;
}

export function deviceRamGB(): number {
  const b = deviceRamBytes();
  return b > 0 ? Math.round((b / GB) * 10) / 10 : 0;
}

/**
 * Pick the chat model by device RAM tier. <3GB -> 1.5B (broad, safe);
 * >=4GB -> 3B (flagship). Embedding model is cheap on all tiers.
 * Uses a safety margin (not the exact boundary) to avoid OOM.
 */
export function recommendedChatModel(): ModelSpec {
  const ram = deviceRamBytes();
  if (ram >= 4 * GB) {
    return CHAT_MODELS.find((m) => m.paramsB === 3) ?? CHAT_MODELS[0];
  }
  return CHAT_MODELS.find((m) => m.paramsB === 1.5) ?? CHAT_MODELS[0];
}

export const EMBEDDING = EMBEDDING_MODEL;

import type { ModelSpec } from '../services/llm/modelDownloader';

export type { ModelSpec };

/**
 * Pinned on-device model catalog (verified mid-2026).
 *
 * SHA-256 values are the real HuggingFace `lfs.oid`, fetched live from the HF
 * tree API and pinned here for supply-chain safety. At download time the
 * modelDownloader ALSO independently re-fetches `lfs.oid` and cross-checks it
 * against these pins, so a tampered or re-quantized upstream file is rejected.
 *
 * Sizes are exact GGUF bytes (from the HF API). RAM tiers: <3GB total -> 1.5B
 * only; 4-6GB -> 3B; embedding model is cheap on all tiers.
 */
export const CHAT_MODELS: ModelSpec[] = [
  {
    id: 'qwen2.5-1.5b-q4km',
    label: 'Qwen2.5 1.5B (Q4_K_M)',
    repo: 'Qwen/Qwen2.5-1.5B-Instruct-GGUF',
    filename: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    sha256: '6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e',
    sizeBytes: 1_117_320_736,
    paramsB: 1.5,
  },
  {
    id: 'qwen2.5-3b-q4km',
    label: 'Qwen2.5 3B (Q4_K_M)',
    repo: 'Qwen/Qwen2.5-3B-Instruct-GGUF',
    filename: 'qwen2.5-3b-instruct-q4_k_m.gguf',
    url: 'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf',
    sha256: '626b4a6678b86442240e33df819e00132d3ba7dddfe1cdc4fbb18e0a9615c62d',
    sizeBytes: 2_104_932_768,
    paramsB: 3,
  },
];

export const EMBEDDING_MODEL: ModelSpec = {
  id: 'nomic-embed-text-v1.5-q8',
  label: 'nomic-embed-text-v1.5 (Q8_0, 768-dim)',
  repo: 'nomic-ai/nomic-embed-text-v1.5-GGUF',
  filename: 'nomic-embed-text-v1.5.Q8_0.gguf',
  url: 'https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/nomic-embed-text-v1.5.Q8_0.gguf',
  sha256: '3e24342164b3d94991ba9692fdc0dd08e3fd7362e0aacc396a9a5c54a544c3b7',
  sizeBytes: 146_146_432,
  paramsB: 0.5,
  isEmbedding: true,
};

/** Whisper tiny (English) for on-device voice input. whisper.cpp format. */
export const WHISPER_MODEL: ModelSpec = {
  id: 'whisper-tiny-en',
  label: 'Whisper tiny.en (78 MB)',
  repo: 'ggerganov/whisper.cpp',
  filename: 'ggml-tiny.en.bin',
  url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin',
  sha256: '921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f',
  sizeBytes: 77_704_715,
  paramsB: 0.5,
};

/** Minimal ambient types for whisper.rn (its package exports map omits a root
 *  "." entry, so TS cannot resolve the bundled declarations). */
declare module 'whisper.rn' {
  export interface TranscribeResult {
    result: string;
    segments: Record<string, unknown>[];
    isAborted?: boolean;
  }

  export interface TranscribeFileOptions {
    language?: string;
    [key: string]: unknown;
  }

  export interface WhisperContext {
    transcribe(
      filePathOrBase64: string | number,
      options?: TranscribeFileOptions
    ): { stop: () => Promise<void>; promise: Promise<TranscribeResult> };
    transcribeData(
      data: string | ArrayBuffer,
      options?: TranscribeFileOptions
    ): { stop: () => Promise<void>; promise: Promise<TranscribeResult> };
    release(): Promise<void>;
  }

  export interface ContextOptions {
    filePath: string | number;
    isBundleAsset?: boolean;
    useGpu?: boolean;
    useCoreMLIos?: boolean;
    useFlashAttn?: boolean;
    coreMLModelAsset?: unknown;
  }

  export function initWhisper(options: ContextOptions): Promise<WhisperContext>;
  export function releaseAllWhisper(): Promise<void>;
}

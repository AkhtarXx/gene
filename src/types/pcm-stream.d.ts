/** Ambient types for @fugood/react-native-audio-pcm-stream (its bundled
 *  index.d.ts still declares the upstream "react-native-live-audio-stream"
 *  module name, so TS cannot resolve it). */
declare module '@fugood/react-native-audio-pcm-stream' {
  export interface AudioRecordOptions {
    sampleRate: number;
    channels: number;
    bitsPerSample: number;
    /** Android MediaRecorder.AudioSource (6 = VOICE_RECOGNITION). */
    audioSource?: number;
    bufferSize?: number;
  }

  interface AudioRecordStatic {
    init(options: AudioRecordOptions): void;
    start(): void;
    stop(): void;
    /** Emits base64-encoded PCM chunks while recording. */
    on(event: 'data', callback: (data: string) => void): unknown;
  }

  const AudioRecord: AudioRecordStatic;
  export default AudioRecord;
}

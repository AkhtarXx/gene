import { PermissionsAndroid, Platform } from 'react-native';
import AudioRecord from '@fugood/react-native-audio-pcm-stream';

/**
 * Push-to-talk microphone capture. Streams 16 kHz mono 16-bit PCM from the
 * device mic (the same stream lib whisper.rn's author maintains) and returns
 * normalized float32 samples — exactly what whisper.cpp expects. No audio ever
 * leaves the device.
 */

const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

function base64ToBytes(input: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = input.replace(/[^A-Za-z0-9+/]/g, '');
  const length = clean.length;
  const bytes = new Uint8Array(Math.floor((length * 3) / 4));
  let byteIndex = 0;
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < length; i++) {
    const value = alphabet.indexOf(clean[i]);
    if (value === -1) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[byteIndex++] = (buffer >> bits) & 0xff;
    }
  }
  return bytes.subarray(0, byteIndex);
}

export class VoiceRecorder {
  private chunks: Uint8Array[] = [];
  private totalBytes = 0;
  private unsubscribers: (() => void)[] = [];
  private active = false;
  private cancelled = false;
  private starting: Promise<void> | null = null;
  private stopping: Promise<Float32Array> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private readonly onLimit?: () => void) {}

  get isRecording(): boolean {
    return this.active;
  }

  async start(): Promise<void> {
    if (this.active || this.starting || this.stopping) throw new Error('Recorder is busy');
    this.cancelled = false;
    this.starting = this.begin();
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  private async begin(): Promise<void> {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO!);
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        throw new Error('Microphone permission denied');
      }
    }
    if (this.cancelled) return;
    this.chunks = [];
    this.totalBytes = 0;
    AudioRecord.init({
      sampleRate: SAMPLE_RATE,
      channels: CHANNELS,
      bitsPerSample: BITS_PER_SAMPLE,
      audioSource: 6, // VOICE_RECOGNITION
      bufferSize: 4096,
    });
    this.unsubscribers.push(
      AudioRecord.on('data', (base64: string) => {
        const remaining = SAMPLE_RATE * 2 * 60 - this.totalBytes;
        if (remaining <= 0) return;
        const chunk = base64ToBytes(base64).slice(0, remaining);
        this.chunks.push(chunk);
        this.totalBytes += chunk.length;
      }) as unknown as () => void
    );
    AudioRecord.start();
    this.active = true;
    this.timer = setTimeout(() => {
      if (this.onLimit) this.onLimit();
      else void this.stop();
    }, 60_000);
  }

  /** Stops capture and returns the recording as float32 samples. */
  async stop(): Promise<Float32Array> {
    this.cancelled = true;
    if (this.starting) await this.starting.catch(() => {});
    if (this.stopping) return this.stopping;
    if (!this.active) return new Float32Array();
    this.stopping = this.finish();
    try {
      return await this.stopping;
    } finally {
      this.stopping = null;
    }
  }

  private async finish(): Promise<Float32Array> {
    this.active = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    AudioRecord.stop();
    // The native stream may emit a final chunk after stop() returns; give it a
    // beat so the tail of the recording is not lost.
    await new Promise((resolve) => setTimeout(resolve, 150));
    this.unsubscribers.forEach((unsubscribe) => {
      try {
        (unsubscribe as { remove?: () => void }).remove?.();
      } catch {}
    });
    this.unsubscribers = [];
    const merged = new Uint8Array(this.totalBytes);
    let offset = 0;
    for (const chunk of this.chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    this.chunks = [];
    this.totalBytes = 0;
    const samples = new Float32Array(Math.floor(merged.length / 2));
    const view = new DataView(merged.buffer, merged.byteOffset, merged.byteLength);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = view.getInt16(i * 2, true) / 32768;
    }
    return samples;
  }
}

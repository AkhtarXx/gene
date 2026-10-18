import { View, Text, ScrollView, Alert } from 'react-native';
import { useEffect, useState, useSyncExternalStore } from 'react';
import * as FileSystem from 'expo-file-system';
import { useServices } from '../src/ui/ServicesContext';
import { Background3D } from '../src/ui/Background3D';
import { GlassCard } from '../src/ui/GlassCard';
import { AnimatedPress } from '../src/ui/AnimatedPress';
import { radius, space, type, useTheme } from '../src/ui/theme';
import { CHAT_MODELS, EMBEDDING_MODEL, WHISPER_MODEL } from '../src/models/catalog';
import {
  downloadModelWithProgress,
  modelPath,
  type ModelSpec,
  subscribeDownloads,
  getDownloadSnapshot,
} from '../src/services/llm/modelDownloader';
import { deviceRamGB, recommendedChatModel } from '../src/models/tier';

function ModelRow({ spec, recommended }: { spec: ModelSpec; recommended?: boolean }) {
  const { color } = useTheme();
  const { engine, embeddings, memory, orchestrator, speech } = useServices();
  useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  useSyncExternalStore(embeddings.subscribe, embeddings.getSnapshot);
  useSyncExternalStore(speech.subscribe, speech.getSnapshot);
  const agentBusy = useSyncExternalStore(orchestrator.subscribe, orchestrator.getSnapshot);
  const downloading = useSyncExternalStore(subscribeDownloads, getDownloadSnapshot);
  const activeDownload = downloading.split(',').includes(spec.id);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'downloading' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState('');
  const [downloaded, setDownloaded] = useState(false);
  useEffect(() => {
    let active = true;
    FileSystem.getInfoAsync(modelPath(spec))
      .then((info) => {
        if (active) setDownloaded(info.exists && 'size' in info && info.size === spec.sizeBytes);
      })
      .catch(() => {
        if (active) setDownloaded(false);
      });
    return () => {
      active = false;
    };
  }, [spec, status]);
  const busy =
    Boolean(downloading) ||
    agentBusy ||
    engine.busy ||
    embeddings.busy ||
    speech.busy ||
    status === 'downloading' ||
    status === 'loading';
  const ready = spec.isEmbedding
    ? memory.isReady()
    : spec.id === WHISPER_MODEL.id
      ? speech.isLoaded()
      : engine.isLoaded() && engine.loadedModelId === spec.id;

  async function onDownload() {
    if (busy) return;
    setError('');
    setStatus('downloading');
    try {
      await downloadModelWithProgress(spec, setProgress);
      setStatus('idle');
    } catch (e) {
      setError((e as Error).message);
      setStatus('error');
    }
  }
  async function onLoad() {
    if (busy) return;
    setError('');
    setStatus('loading');
    try {
      if (spec.id === WHISPER_MODEL.id) await speech.load();
      else await engine.loadModel(spec);
      setStatus('ready');
    } catch (e) {
      setError((e as Error).message);
      setStatus('error');
    }
  }
  async function onLoadEmbedding() {
    if (busy) return;
    setError('');
    setStatus('loading');
    try {
      await embeddings.load(spec);
      await memory.init();
      setStatus('ready');
    } catch (e) {
      setError((e as Error).message);
      setStatus('error');
    }
  }
  async function onDelete() {
    if (busy) return;
    Alert.alert(
      'Delete model?',
      'The file will be removed from this device. You can download it again any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (orchestrator.busy || engine.busy || embeddings.busy || speech.busy || getDownloadSnapshot()) {
              setError('Wait for the current operation before deleting this model.');
              setStatus('error');
              return;
            }
            setStatus('loading');
            try {
              // Release the context first: the loaded model may be memory-mapped
              // from the file being deleted.
              if (spec.isEmbedding) await memory.close();
              else if (spec.id === WHISPER_MODEL.id) await speech.unload();
              else if (engine.loadedModelId === spec.id) await engine.unload();
              await FileSystem.deleteAsync(modelPath(spec), { idempotent: true });
              setStatus('idle');
              setError('');
            } catch (e) {
              setError((e as Error).message);
              setStatus('error');
            }
          },
        },
      ]
    );
  }

  const pct = progress < 0 ? '…' : `${Math.round(progress * 100)}%`;
  return (
    <GlassCard style={{ marginBottom: space.md }}>
      <Text style={[type.title, { color: color.text }]}>
        {spec.label}
        {recommended ? '  ✦ recommended' : ''}
      </Text>
      <Text style={[type.body, { color: color.textDim, marginTop: space.xs }]}>
        {spec.sizeBytes < 1e9
          ? `${Math.round(spec.sizeBytes / 1e6)} MB`
          : `${(spec.sizeBytes / 1e9).toFixed(2)} GB`}{' '}
        · {ready ? 'Loaded on this device' : downloaded ? 'Downloaded' : 'Not downloaded'}
      </Text>
      {activeDownload && status !== 'downloading' && (
        <Text style={[type.small, { color: color.accent, marginTop: space.sm }]}>
          Download or verification in progress…
        </Text>
      )}

      {status === 'downloading' && (
        <View
          style={{
            height: 6,
            borderRadius: radius.pill,
            backgroundColor: color.surface2,
            marginTop: space.md,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              height: '100%',
              width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`,
              backgroundColor: color.accent,
              borderRadius: radius.pill,
            }}
          />
        </View>
      )}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md }}>
        <AnimatedPress onPress={onDownload} disabled={busy || downloaded}>
          <Text style={{ color: color.accent, paddingHorizontal: space.md, paddingVertical: space.xs }}>
            {status === 'downloading' ? `Downloading ${pct}` : downloaded ? 'Downloaded' : 'Download'}
          </Text>
        </AnimatedPress>
        {!spec.isEmbedding && (
          <AnimatedPress onPress={onLoad} disabled={busy || ready || !downloaded}>
            <Text
              style={{
                color: spec.isEmbedding ? color.textDim : color.accent,
                paddingHorizontal: space.md,
                paddingVertical: space.xs,
              }}
            >
              {spec.id === WHISPER_MODEL.id ? 'Enable voice' : 'Load LLM'}
            </Text>
          </AnimatedPress>
        )}
        {spec.isEmbedding && (
          <AnimatedPress onPress={onLoadEmbedding} disabled={busy || ready || !downloaded}>
            <Text style={{ color: color.accent, paddingHorizontal: space.md, paddingVertical: space.xs }}>
              Enable memory
            </Text>
          </AnimatedPress>
        )}
        {spec.isEmbedding && ready && (
          <AnimatedPress
            disabled={busy}
            onPress={async () => {
              setStatus('loading');
              try {
                await memory.close();
                setStatus('idle');
              } catch (e) {
                setError((e as Error).message);
                setStatus('error');
              }
            }}
          >
            <Text style={{ color: color.accent }}>Disable memory</Text>
          </AnimatedPress>
        )}
        {ready && <Text style={{ color: color.success, paddingHorizontal: space.md }}>Ready</Text>}
        {status === 'error' && (
          <Text style={{ color: color.danger, paddingHorizontal: space.md }}>
            {error || 'Operation failed'}
          </Text>
        )}
        <AnimatedPress onPress={onDelete} disabled={busy || !downloaded}>
          <Text style={{ color: color.textDim, paddingHorizontal: space.md, paddingVertical: space.xs }}>
            Delete file
          </Text>
        </AnimatedPress>
      </View>
    </GlassCard>
  );
}

export default function ModelsScreen() {
  const { color } = useTheme();
  const { engine } = useServices();
  useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const recommendedId = recommendedChatModel().id;
  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <Background3D />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.lg }}>
        <Text style={[type.display, { color: color.text, marginBottom: space.md }]}>Models</Text>
        <Text style={[type.body, { color: color.textDim, marginBottom: space.lg }]}>
          Chat models — device RAM: {deviceRamGB()} GB. Every download is SHA-256 verified before it can load.
        </Text>
        {CHAT_MODELS.map((m) => (
          <ModelRow key={m.id} spec={m} recommended={m.id === recommendedId} />
        ))}
        <Text style={[type.title, { color: color.text, marginVertical: space.md }]}>
          Embedding model (RAG memory)
        </Text>
        <ModelRow spec={EMBEDDING_MODEL} />
        <Text style={[type.body, { color: color.textDim }]}>
          Enable memory to save your messages locally and retrieve them in later chats. Retrieved content
          cannot authorize device actions. Disable memory for a fresh action-only chat; saved messages remain
          on this device.
        </Text>
        <Text style={[type.title, { color: color.text, marginVertical: space.md }]}>
          Speech-to-text (voice input)
        </Text>
        <ModelRow spec={WHISPER_MODEL} />
        <Text style={[type.body, { color: color.textDim }]}>
          Voice transcription runs entirely on-device via whisper.cpp. The mic button in chat needs this
          model.
        </Text>
        <Text style={[type.mono, { color: color.textDim, marginTop: space.md }]}>
          Loaded LLM: {engine.loadedModelId ?? 'none'}
        </Text>
      </ScrollView>
    </View>
  );
}

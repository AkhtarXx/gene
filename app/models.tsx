import { View, Text, ScrollView } from 'react-native';
import { useState } from 'react';
import { useServices } from '../src/ui/ServicesContext';
import { Background3D } from '../src/ui/Background3D';
import { GlassCard } from '../src/ui/GlassCard';
import { AnimatedPress } from '../src/ui/AnimatedPress';
import { color, radius, space, type } from '../src/ui/theme';
import { CHAT_MODELS, EMBEDDING_MODEL } from '../src/models/catalog';
import { downloadModelWithProgress, type ModelSpec } from '../src/services/llm/modelDownloader';
import { deviceRamGB, recommendedChatModel } from '../src/models/tier';

function ModelRow({ spec, recommended }: { spec: ModelSpec; recommended?: boolean }) {
  const { engine, embeddings } = useServices();
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'downloading' | 'loading' | 'ready' | 'error'>('idle');

  async function onDownload() {
    setStatus('downloading');
    try {
      await downloadModelWithProgress(spec, setProgress);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  }
  async function onLoad() {
    setStatus('loading');
    try {
      await engine.loadModel(spec);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }
  async function onLoadEmbedding() {
    setStatus('loading');
    try {
      await embeddings.load(spec);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }

  const pct = progress < 0 ? '…' : `${Math.round(progress * 100)}%`;
  return (
    <GlassCard style={{ marginBottom: space.md }}>
      <Text style={[type.title, { color: color.text }]}>
        {spec.label}
        {recommended ? '  ✦ recommended' : ''}
      </Text>
      <Text style={[type.body, { color: color.textDim, marginTop: space.xs }]}>
        {(spec.sizeBytes / 1e9).toFixed(2)} GB
      </Text>

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
              width: pct as unknown as number,
              backgroundColor: color.accent,
              borderRadius: radius.pill,
            }}
          />
        </View>
      )}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md }}>
        <AnimatedPress onPress={onDownload} disabled={status === 'downloading'}>
          <Text style={{ color: color.accent, paddingHorizontal: space.md, paddingVertical: space.xs }}>
            {status === 'downloading' ? `Downloading ${pct}` : 'Download'}
          </Text>
        </AnimatedPress>
        <AnimatedPress onPress={onLoad} disabled={spec.isEmbedding}>
          <Text style={{ color: spec.isEmbedding ? color.textDim : color.accent, paddingHorizontal: space.md, paddingVertical: space.xs }}>
            Load LLM
          </Text>
        </AnimatedPress>
        {spec.isEmbedding && (
          <AnimatedPress onPress={onLoadEmbedding}>
            <Text style={{ color: color.accent, paddingHorizontal: space.md, paddingVertical: space.xs }}>
              Load Embedding
            </Text>
          </AnimatedPress>
        )}
        {status === 'ready' && <Text style={{ color: color.success, paddingHorizontal: space.md }}>Ready</Text>}
        {status === 'error' && <Text style={{ color: color.danger, paddingHorizontal: space.md }}>Error</Text>}
      </View>
    </GlassCard>
  );
}

export default function ModelsScreen() {
  const { engine } = useServices();
  const recommendedId = recommendedChatModel().id;
  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <Background3D />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.lg }}>
        <Text style={[type.display, { color: color.text, marginBottom: space.md }]}>
          Models
        </Text>
        <Text style={[type.body, { color: color.textDim, marginBottom: space.lg }]}>
          Chat models — device RAM: {deviceRamGB()} GB
        </Text>
        {CHAT_MODELS.map((m) => (
          <ModelRow key={m.id} spec={m} recommended={m.id === recommendedId} />
        ))}
        <Text style={[type.title, { color: color.text, marginVertical: space.md }]}>
          Embedding model (RAG memory)
        </Text>
        <ModelRow spec={EMBEDDING_MODEL} />
        <Text style={[type.mono, { color: color.textDim, marginTop: space.md }]}>
          Loaded LLM: {engine.loadedModelId ?? 'none'}
        </Text>
      </ScrollView>
    </View>
  );
}

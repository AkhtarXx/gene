import { View, Text, Pressable, ScrollView } from 'react-native';
import { useState } from 'react';
import { useServices } from './ServicesContext';
import { CHAT_MODELS, EMBEDDING_MODEL } from '../models/catalog';
import { downloadModelWithProgress, type ModelSpec } from '../services/llm/modelDownloader';
import { deviceRamGB, recommendedChatModel } from '../models/tier';

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
    <View style={{ padding: 12, borderBottomWidth: 1, borderColor: '#eee' }}>
      <Text style={{ fontWeight: '600' }}>{spec.label}{recommended ? '  ✦ recommended' : ''}</Text>
      <Text style={{ color: '#888' }}>{(spec.sizeBytes / 1e9).toFixed(2)} GB</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <Pressable onPress={onDownload} disabled={status === 'downloading'}>
          <Text style={{ color: '#0a7' }}>{status === 'downloading' ? `Downloading ${pct}` : 'Download'}</Text>
        </Pressable>
        <Pressable onPress={onLoad} disabled={spec.isEmbedding}>
          <Text style={{ color: spec.isEmbedding ? '#999' : '#0a7' }}>Load LLM</Text>
        </Pressable>
        {spec.isEmbedding && (
          <Pressable onPress={onLoadEmbedding}>
            <Text style={{ color: '#0a7' }}>Load Embedding</Text>
          </Pressable>
        )}
        {status === 'ready' && <Text style={{ color: '#080' }}>Ready</Text>}
        {status === 'error' && <Text style={{ color: '#c00' }}>Error</Text>}
      </View>
    </View>
  );
}

export default function ModelsScreen() {
  const { engine } = useServices();
  const recommendedId = recommendedChatModel().id;
  return (
    <ScrollView style={{ flex: 1 }}>
      <Text style={{ padding: 12, fontWeight: '700' }}>
        Chat models (download, then Load) — device RAM: {deviceRamGB()} GB
      </Text>
      {CHAT_MODELS.map((m) => (
        <ModelRow key={m.id} spec={m} recommended={m.id === recommendedId} />
      ))}
      <Text style={{ padding: 12, fontWeight: '700' }}>Embedding model (for RAG memory)</Text>
      <ModelRow spec={EMBEDDING_MODEL} />
      <Text style={{ padding: 12, color: '#888' }}>
        Loaded LLM: {engine.loadedModelId ?? 'none'}
      </Text>
    </ScrollView>
  );
}

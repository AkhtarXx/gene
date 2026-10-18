import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useServices } from '../src/ui/ServicesContext';
import { Background3D } from '../src/ui/Background3D';
import { GlassCard } from '../src/ui/GlassCard';
import { AnimatedPress } from '../src/ui/AnimatedPress';
import { space, type, useTheme } from '../src/ui/theme';
import type { MemoryDocRow } from '../src/services/storage/AppStore';

export default function MemoryScreen() {
  const { color } = useTheme();
  const { memory } = useServices();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState<MemoryDocRow[]>([]);
  const [stats, setStats] = useState<{ docs: number; chunks: number }>({ docs: 0, chunks: 0 });

  const refresh = useCallback(() => {
    let active = true;
    setLoading(true);
    setError('');
    void memory
      .init()
      .then(async () => {
        const [documents, counts] = await Promise.all([memory.listDocuments(200), memory.stats()]);
        if (active) {
          setDocs(documents);
          setStats(counts);
        }
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [memory]);

  useFocusEffect(refresh);

  async function deleteDoc(docId: string) {
    try {
      await memory.deleteDocument(docId);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function clearAll() {
    Alert.alert('Clear all memories?', 'This permanently deletes saved notes. Your chat messages are kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear memories',
        style: 'destructive',
        onPress: async () => {
          try {
            await memory.clear();
            refresh();
          } catch (e) {
            setError((e as Error).message);
          }
        },
      },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <Background3D />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        <Text style={[type.display, { color: color.text }]}>Memory</Text>
        {loading && <ActivityIndicator color={color.accent} />}
        {error ? <Text style={{ color: color.danger }}>{error}</Text> : null}
        {!memory.isReady() ? (
          <GlassCard>
            <Text style={[type.body, { color: color.textDim, textAlign: 'center' }]}>
              Retrieval is off. You can still view or delete saved notes below.
            </Text>
            <AnimatedPress onPress={() => router.push('/models')}>
              <Text style={{ color: color.accent }}>Enable memory in Models</Text>
            </AnimatedPress>
          </GlassCard>
        ) : null}
        <>
          <GlassCard>
            <Text style={[type.body, { color: color.textDim }]}>
              {stats.docs} saved notes · {stats.chunks} chunks — all stored locally in a vector database on
              this device.
            </Text>
            {docs.length > 0 && (
              <View style={{ alignItems: 'flex-start', marginTop: space.sm }}>
                <AnimatedPress onPress={clearAll}>
                  <Text style={{ color: color.danger }}>Clear all memories</Text>
                </AnimatedPress>
              </View>
            )}
          </GlassCard>
          {docs.length > 0 && (
            <TextInput
              accessibilityLabel="Search saved memories"
              value={search}
              onChangeText={setSearch}
              placeholder="Search saved notes…"
              placeholderTextColor={color.textDim}
              style={{
                borderRadius: 12,
                padding: space.md,
                color: color.text,
                backgroundColor: color.surface1,
              }}
            />
          )}
          {docs
            .filter((doc) => doc.text.toLowerCase().includes(search.toLowerCase()))
            .map((doc) => (
              <GlassCard key={doc.docId}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[type.small, { color: color.textDim, flex: 1 }]} numberOfLines={3}>
                    {doc.text || doc.docId}
                  </Text>
                  <AnimatedPress accessibilityLabel="Delete saved note" onPress={() => deleteDoc(doc.docId)}>
                    <Ionicons name="trash-outline" size={16} color={color.danger} />
                  </AnimatedPress>
                </View>
                <Text style={[type.small, { color: color.textDim, marginTop: space.xs }]}>
                  {doc.count} chunks
                </Text>
              </GlassCard>
            ))}
          {docs.length === 0 && (
            <GlassCard>
              <Text style={[type.body, { color: color.textDim, textAlign: 'center' }]}>
                Nothing saved yet. Send messages while memory is enabled and they will appear here.
              </Text>
            </GlassCard>
          )}
        </>
      </ScrollView>
    </View>
  );
}

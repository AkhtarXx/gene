import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useServices } from '../src/ui/ServicesContext';
import { Background3D } from '../src/ui/Background3D';
import { GlassCard } from '../src/ui/GlassCard';
import { AnimatedPress } from '../src/ui/AnimatedPress';
import { radius, space, type, useTheme } from '../src/ui/theme';
import type { ConversationRow } from '../src/services/storage/AppStore';

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function HomeScreen() {
  const { color } = useTheme();
  const { store, orchestrator, engine } = useServices();
  useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const busy = useSyncExternalStore(orchestrator.subscribe, orchestrator.getSnapshot);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [renaming, setRenaming] = useState<ConversationRow | null>(null);
  const [renameText, setRenameText] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    store
      .listConversations()
      .then(setConversations)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [store]);

  useFocusEffect(refresh);

  useEffect(() => {
    // First-run onboarding gate.
    store
      .getSetting('onboarded')
      .then((value) => {
        if (value !== '1') router.replace('/onboarding');
      })
      .catch(() => {});
  }, [store, router]);

  async function newChat() {
    if (busy || creating) return;
    setCreating(true);
    setError('');
    try {
      await orchestrator.clearHistory();
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      await store.createConversation(id, 'New chat');
      router.push(`/chat/${id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function deleteConversation(id: string) {
    const conversation = conversations.find((c) => c.id === id);
    Alert.alert(
      'Delete this chat?',
      `"${conversation?.title ?? 'This chat'}" and its messages will be permanently deleted from this device.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await store.deleteConversation(id);
              refresh();
            } catch (e) {
              setError((e as Error).message);
            }
          },
        },
      ]
    );
  }

  async function saveRename() {
    if (!renaming) return;
    const title = renameText.trim() || renaming.title;
    try {
      await store.renameConversation(renaming.id, title);
      setRenaming(null);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <Background3D />
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 96 }}
        data={conversations.filter((conversation) =>
          conversation.title.toLowerCase().includes(search.trim().toLowerCase())
        )}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={{ gap: space.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[type.display, { color: color.text }]}>Gene</Text>
              <AnimatedPress accessibilityLabel="Open settings" onPress={() => router.push('/settings')}>
                <Ionicons name="settings-outline" size={24} color={color.textDim} />
              </AnimatedPress>
            </View>
            <GlassCard>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <Ionicons
                  name={engine.isLoaded() ? 'shield-checkmark-outline' : 'cube-outline'}
                  size={22}
                  color={color.accent}
                />
                <Text style={[type.body, { color: color.text, flex: 1 }]}>
                  {engine.isLoaded() ? 'Ready for a private conversation' : 'Set up your on-device assistant'}
                </Text>
              </View>
              <Text style={[type.small, { color: color.textDim, marginTop: space.sm }]}>
                {engine.isLoaded()
                  ? 'Your model is loaded. Chats and actions run on this phone.'
                  : 'Download a model once, then chat offline. No account needed.'}
              </Text>
              <AnimatedPress onPress={() => router.push('/models')}>
                <Text style={{ color: color.accent }}>
                  {engine.isLoaded() ? 'Manage models' : 'Choose a model →'}
                </Text>
              </AnimatedPress>
            </GlassCard>
            <AnimatedPress onPress={() => router.push('/actions')} accessibilityLabel="Open phone actions">
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.sm,
                  paddingVertical: space.md,
                }}
              >
                <Ionicons name="phone-portrait-outline" size={22} color={color.accent} />
                <Text style={[type.body, { color: color.accent, flex: 1 }]}>
                  Phone actions · no model needed
                </Text>
                <Ionicons name="chevron-forward" size={18} color={color.accent} />
              </View>
            </AnimatedPress>
            <AnimatedPress
              onPress={() => router.push('/control')}
              accessibilityLabel="Open personal phone control"
            >
              <Text style={[type.body, { color: color.accent, paddingVertical: space.md }]}>
                Personal phone control →
              </Text>
            </AnimatedPress>
            {conversations.length > 0 && (
              <TextInput
                accessibilityLabel="Search conversations"
                placeholder="Search conversations…"
                placeholderTextColor={color.textDim}
                value={search}
                onChangeText={setSearch}
                style={{
                  color: color.text,
                  backgroundColor: color.surface1,
                  borderRadius: radius.sm,
                  borderColor: color.border,
                  borderWidth: 1,
                  padding: space.md,
                }}
              />
            )}
            {error ? (
              <Text accessibilityLiveRegion="polite" style={{ color: color.danger }}>
                {error}
              </Text>
            ) : null}
            <Text style={[type.small, { color: color.textDim }]}>YOUR CONVERSATIONS</Text>
          </View>
        }
        ListEmptyComponent={
          <GlassCard style={{ marginTop: space.xl }}>
            <Text style={[type.body, { color: color.textDim, textAlign: 'center' }]}>
              {loading
                ? 'Loading conversations…'
                : search.trim()
                  ? 'No chats match your search.'
                  : 'Your first conversation starts here. Tap New chat below.'}
            </Text>
            {loading && <ActivityIndicator color={color.accent} style={{ marginTop: space.sm }} />}
          </GlassCard>
        }
        renderItem={({ item }) => (
          <GlassCard>
            <AnimatedPress
              style={{ width: '100%' }}
              onPress={() => router.push(`/chat/${item.id}`)}
              onLongPress={() => {
                setRenaming(item);
                setRenameText(item.title);
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text
                  style={[type.body, { color: color.text, fontWeight: '600', flex: 1 }]}
                  numberOfLines={1}
                >
                  {item.title}
                </Text>
                <Text style={[type.small, { color: color.textDim, marginLeft: space.md }]}>
                  {timeAgo(item.updated_at)}
                </Text>
              </View>
            </AnimatedPress>
            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.xs }}>
              <AnimatedPress
                accessibilityLabel={`Delete ${item.title}`}
                disabled={busy}
                onPress={() => deleteConversation(item.id)}
              >
                <Ionicons name="trash-outline" size={18} color={color.danger} />
              </AnimatedPress>
              <AnimatedPress
                accessibilityLabel={`Rename ${item.title}`}
                onPress={() => {
                  setRenaming(item);
                  setRenameText(item.title);
                }}
              >
                <Ionicons name="pencil-outline" size={18} color={color.textDim} />
              </AnimatedPress>
            </View>
          </GlassCard>
        )}
      />
      <View
        style={{
          position: 'absolute',
          bottom: Math.max(space.lg, insets.bottom),
          left: space.lg,
          right: space.lg,
        }}
      >
        <AnimatedPress
          onPress={newChat}
          disabled={busy || creating}
          style={{ backgroundColor: color.accent, borderRadius: radius.pill, alignItems: 'center' }}
        >
          <Text style={[type.title, { color: color.accentText, paddingVertical: space.sm }]}>
            {creating ? 'Opening…' : busy ? 'Finishing previous chat…' : 'New chat'}
          </Text>
        </AnimatedPress>
      </View>

      <Modal
        visible={renaming !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRenaming(null)}
      >
        <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: color.backdrop }}>
          <View style={{ padding: 20, borderRadius: radius.md, backgroundColor: color.bg }}>
            <Text style={[type.title, { color: color.text, marginBottom: space.md }]}>Rename chat</Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: color.border,
                borderRadius: radius.sm,
                padding: space.md,
                color: color.text,
                backgroundColor: color.surface0,
              }}
              value={renameText}
              onChangeText={setRenameText}
              placeholder="Chat title"
              placeholderTextColor={color.textDim}
              autoFocus
              maxLength={80}
            />
            <View
              style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: space.md, gap: space.sm }}
            >
              <AnimatedPress onPress={() => setRenaming(null)}>
                <Text style={{ color: color.textDim, paddingHorizontal: space.md }}>Cancel</Text>
              </AnimatedPress>
              <AnimatedPress onPress={saveRename}>
                <Text style={{ color: color.accent, fontWeight: '700', paddingHorizontal: space.md }}>
                  Save
                </Text>
              </AnimatedPress>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

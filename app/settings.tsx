import { useEffect, useState, useSyncExternalStore } from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { useServices } from '../src/ui/ServicesContext';
import { Background3D } from '../src/ui/Background3D';
import { GlassCard } from '../src/ui/GlassCard';
import { AnimatedPress } from '../src/ui/AnimatedPress';
import { radius, space, type, useTheme, type ThemeMode } from '../src/ui/theme';
import { CHAT_MODELS, EMBEDDING_MODEL, WHISPER_MODEL } from '../src/models/catalog';
import { modelPath, subscribeDownloads, getDownloadSnapshot } from '../src/services/llm/modelDownloader';

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
];

export default function SettingsScreen() {
  const { color, mode, setMode } = useTheme();
  const { store, memory, engine, embeddings, speech, orchestrator } = useServices();
  const router = useRouter();
  const [temperature, setTemperature] = useState('0.7');
  const [maxTokens, setMaxTokens] = useState('512');
  const [modelBytes, setModelBytes] = useState(0);
  const [working, setWorking] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  useSyncExternalStore(embeddings.subscribe, embeddings.getSnapshot);
  useSyncExternalStore(speech.subscribe, speech.getSnapshot);
  const agentBusy = useSyncExternalStore(orchestrator.subscribe, orchestrator.getSnapshot);
  const downloading = useSyncExternalStore(subscribeDownloads, getDownloadSnapshot);
  const busy = working || agentBusy || engine.busy || embeddings.busy || speech.busy || Boolean(downloading);
  async function privacyAction(action: () => Promise<void>) {
    if (
      orchestrator.busy ||
      engine.busy ||
      embeddings.busy ||
      speech.busy ||
      getDownloadSnapshot() ||
      working
    ) {
      Alert.alert('Operation in progress', 'Wait for the current operation to finish, then try again.');
      return;
    }
    setWorking(true);
    try {
      await action();
    } catch (error) {
      Alert.alert('Action failed', (error as Error).message);
    } finally {
      setWorking(false);
    }
  }

  useEffect(() => {
    store
      .getSetting('temperature')
      .then((v) => v && setTemperature(v))
      .catch(() => {});
    store
      .getSetting('max_tokens')
      .then((v) => v && setMaxTokens(v))
      .catch(() => {});
  }, [store]);

  useEffect(() => {
    (async () => {
      let total = 0;
      for (const spec of [...CHAT_MODELS, EMBEDDING_MODEL, WHISPER_MODEL]) {
        try {
          const info = await FileSystem.getInfoAsync(modelPath(spec));
          if (info.exists && 'size' in info && typeof info.size === 'number') total += info.size;
        } catch {}
      }
      setModelBytes(total);
    })();
  }, []);

  async function saveInference() {
    if (
      !temperature.trim() ||
      !maxTokens.trim() ||
      !Number.isFinite(Number(temperature)) ||
      !Number.isFinite(Number(maxTokens))
    ) {
      setSaveMessage('Enter valid numbers for both fields.');
      return;
    }
    const temp = Math.min(1.5, Math.max(0, Number(temperature)));
    const tokens = Math.min(1024, Math.max(64, Math.floor(Number(maxTokens) || 512)));
    setTemperature(String(temp));
    setMaxTokens(String(tokens));
    try {
      await store.setSetting('temperature', String(temp));
      await store.setSetting('max_tokens', String(tokens));
      setSaveMessage('Defaults saved for your next chat.');
    } catch (error) {
      setSaveMessage(`Save failed: ${(error as Error).message}`);
    }
  }

  async function exportData() {
    try {
      const json = await store.exportAll();
      const dir = `${FileSystem.documentDirectory}exports/`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      const path = `${dir}openclaw-export-${Date.now()}.json`;
      await FileSystem.writeAsStringAsync(path, json, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: 'Export my data' });
      } else {
        Alert.alert('Exported', `Saved to ${path}`);
      }
    } catch (e) {
      Alert.alert('Export failed', (e as Error).message);
    }
  }

  async function clearConversations() {
    Alert.alert(
      'Delete all conversations?',
      'Every chat and its messages will be permanently deleted from this device. The activity log is kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void privacyAction(async () => {
              await orchestrator.clearHistory();
              await store.clearConversations();
              router.replace('/');
            });
          },
        },
      ]
    );
  }

  async function clearMemory() {
    Alert.alert('Clear memory?', 'All saved memories will be permanently deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          void privacyAction(async () => {
            await memory.init();
            await memory.clear();
            Alert.alert('Memory cleared', 'Saved notes have been deleted.');
          });
        },
      },
    ]);
  }

  async function deleteAllData() {
    Alert.alert(
      'Delete ALL app data?',
      'Conversations, memory, settings and downloaded models will be permanently deleted from this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            await privacyAction(async () => {
              await orchestrator.clearHistory();
              await memory.close();
              await engine.unload();
              await speech.unload();
              await memory.destroyAll();
              await store.wipeAll();
              for (const spec of [...CHAT_MODELS, EMBEDDING_MODEL, WHISPER_MODEL]) {
                await FileSystem.deleteAsync(modelPath(spec), { idempotent: true });
              }
              await FileSystem.deleteAsync(`${FileSystem.documentDirectory}exports/`, { idempotent: true });
              setMode('system');
              setModelBytes(0);
              Alert.alert('Done', 'All app data has been deleted.');
              router.replace('/onboarding');
            });
          },
        },
      ]
    );
  }

  function Row({
    icon,
    label,
    onPress,
    value,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    onPress?: () => void;
    value?: string;
  }) {
    return (
      <AnimatedPress onPress={onPress} disabled={!onPress || busy}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: space.sm,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Ionicons name={icon} size={20} color={color.textDim} />
            <Text style={[type.body, { color: color.text }]}>{label}</Text>
          </View>
          {value ? (
            <Text style={[type.body, { color: color.textDim }]}>{value}</Text>
          ) : (
            <Ionicons name="chevron-forward" size={16} color={color.textDim} />
          )}
        </View>
      </AnimatedPress>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <Background3D />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        <Text style={[type.display, { color: color.text }]}>Settings</Text>

        <GlassCard>
          <Text style={[type.title, { color: color.text, marginBottom: space.sm }]}>Appearance</Text>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {THEME_OPTIONS.map((option) => (
              <AnimatedPress key={option.value} onPress={() => setMode(option.value)}>
                <View
                  style={{
                    paddingHorizontal: space.lg,
                    paddingVertical: space.xs,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: mode === option.value ? color.accent : color.border,
                    backgroundColor: mode === option.value ? color.userBubble : 'transparent',
                  }}
                >
                  <Text style={{ color: mode === option.value ? color.accent : color.textDim }}>
                    {option.label}
                  </Text>
                </View>
              </AnimatedPress>
            ))}
          </View>
        </GlassCard>

        <GlassCard>
          <Text style={[type.title, { color: color.text, marginBottom: space.sm }]}>Inference</Text>
          <Text style={[type.small, { color: color.textDim }]}>Temperature (0 – 1.5)</Text>
          <TextInput
            style={inputStyle(color)}
            value={temperature}
            onChangeText={setTemperature}
            keyboardType="decimal-pad"
          />
          <Text style={[type.small, { color: color.textDim, marginTop: space.sm }]}>
            Max tokens per answer (64 – 1024)
          </Text>
          <TextInput
            style={inputStyle(color)}
            value={maxTokens}
            onChangeText={setMaxTokens}
            keyboardType="number-pad"
          />
          <View style={{ alignItems: 'flex-end', marginTop: space.sm }}>
            <AnimatedPress onPress={saveInference}>
              <Text style={{ color: color.accent, fontWeight: '700', paddingHorizontal: space.md }}>
                Save
              </Text>
            </AnimatedPress>
          </View>
          {saveMessage ? (
            <Text accessibilityLiveRegion="polite" style={[type.small, { color: color.textDim }]}>
              {saveMessage}
            </Text>
          ) : null}
        </GlassCard>

        <GlassCard>
          <Text style={[type.title, { color: color.text, marginBottom: space.sm }]}>Storage</Text>
          <Row
            icon="cube-outline"
            label="Downloaded models"
            value={`${(modelBytes / 1e6).toFixed(0)} MB`}
            onPress={() => router.push('/models')}
          />
          <Row icon="chatbubbles-outline" label="Conversations" onPress={clearConversations} />
          <Row icon="server-outline" label="Clear memory" onPress={clearMemory} />
        </GlassCard>

        <GlassCard>
          <Text style={[type.title, { color: color.text, marginBottom: space.sm }]}>Privacy & data</Text>
          <Row icon="shield-checkmark-outline" label="Activity log" onPress={() => router.push('/audit')} />
          <Row icon="documents-outline" label="Memory viewer" onPress={() => router.push('/memory')} />
          <Row icon="share-outline" label="Export my data" onPress={exportData} />
          <Row icon="trash-outline" label="Delete ALL app data" onPress={deleteAllData} />
        </GlassCard>

        <GlassCard>
          <Text style={[type.title, { color: color.text, marginBottom: space.sm }]}>About</Text>
          <Text style={[type.body, { color: color.textDim }]}>
            Gene runs a local LLM entirely on your device. Chats, memory and model weights never leave your
            phone. No accounts, no telemetry, no cloud inference.
          </Text>
          <Text style={[type.small, { color: color.textDim, marginTop: space.sm }]}>
            Version 0.1.0 · MIT License
          </Text>
        </GlassCard>
      </ScrollView>
    </View>
  );
}

function inputStyle(color: ReturnType<typeof useTheme>['color']) {
  return {
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.sm,
    padding: space.md,
    color: color.text,
    backgroundColor: color.surface0,
    marginTop: space.xs,
  };
}

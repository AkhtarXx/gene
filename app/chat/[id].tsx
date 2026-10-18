import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  Alert,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useServices } from '../../src/ui/ServicesContext';
import { services } from '../../src/services';
import { VoiceRecorder } from '../../src/services/speech/VoiceRecorder';
import { Background3D } from '../../src/ui/Background3D';
import { GlassCard } from '../../src/ui/GlassCard';
import { AnimatedPress } from '../../src/ui/AnimatedPress';
import { MarkdownText } from '../../src/ui/MarkdownText';
import { radius, space, type, useTheme } from '../../src/ui/theme';
import type { ConversationRow, MessageMeta } from '../../src/services/storage/AppStore';
import {
  conversationTurns,
  parseMessageMeta,
  parseToolPreferences as parseTools,
} from '../../src/services/storage/conversation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Msg = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  meta?: MessageMeta;
};

const ALL_TOOL_NAMES = services.tools.list().map((tool) => tool.name);

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function ToolActivity({ meta, color }: { meta: MessageMeta; color: ReturnType<typeof useTheme>['color'] }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginTop: space.sm }}>
      {meta.activities?.map((activity, i) => (
        <View key={i}>
          <AnimatedPress onPress={() => setOpen(!open)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
              <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={14} color={color.textDim} />
              <Text
                style={[type.small, { color: color.textDim, flexShrink: 1 }]}
                numberOfLines={open ? undefined : 1}
              >
                ▸ {activity.name}
              </Text>
            </View>
          </AnimatedPress>
          {open && (
            <Text
              selectable
              style={[type.mono, { color: color.textDim, marginLeft: space.lg, marginTop: 2 }]}
            >
              {activity.result.slice(0, 1200)}
            </Text>
          )}
        </View>
      ))}
      {meta.stats && (
        <Text style={[type.small, { color: color.textDim, marginTop: space.xs }]}>
          {meta.stats.tokens} tokens · {meta.stats.tokensPerSecond} tok/s
        </Text>
      )}
    </View>
  );
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { color } = useTheme();
  const { orchestrator, engine, store, speech } = useServices();
  useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  useSyncExternalStore(speech.subscribe, speech.getSnapshot);
  const busy = useSyncExternalStore(orchestrator.subscribe, orchestrator.getSnapshot);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const [conversation, setConversation] = useState<ConversationRow | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [toolToggles, setToolToggles] = useState<Record<string, boolean>>({});
  const [recording, setRecording] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [historyReady, setHistoryReady] = useState(false);
  const [screenError, setScreenError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const sendGuard = useRef(false);
  const sendAbortRef = useRef<AbortController | null>(null);
  const voiceGuard = useRef(false);
  const screenEpoch = useRef(0);
  const nearBottom = useRef(true);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(512);
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const voiceEpoch = useRef(0);
  const stopVoiceRef = useRef<() => void>(() => {});
  const listRef = useRef<FlatList<Msg>>(null);
  const ready = engine.isLoaded();

  // ---------------------------------------------------------------- loading

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const epoch = ++screenEpoch.current;
    setHistoryReady(false);
    setScreenError('');
    (async () => {
      const conv = await store.getConversation(id);
      if (cancelled) return;
      if (!conv) {
        router.replace('/');
        return;
      }
      setConversation(conv);
      setSystemPrompt(conv.system_prompt);
      setMemoryEnabled(Boolean(conv.memory_enabled));
      setToolToggles(parseTools(conv.tools_json, ALL_TOOL_NAMES));
      navigation.setOptions({ title: conv.title });
      const rows = await store.listMessages(id);
      if (cancelled) return;
      setMessages(
        rows.map((row) => ({
          id: row.id,
          role: row.role,
          text: row.content,
          meta: parseMessageMeta(row.meta),
        }))
      );
      // A previous screen may still be cancelling its run; wait it out
      // instead of bouncing the user home, then take over the history.
      await orchestrator.waitForIdle(controller.signal);
      if (cancelled) return;
      await orchestrator.loadHistory(conversationTurns(rows));
      if (!cancelled) setHistoryReady(true);
    })().catch((error) => {
      if (!cancelled) setScreenError((error as Error).message);
    });
    return () => {
      cancelled = true;
      screenEpoch.current = epoch + 1;
      controller.abort();
      sendAbortRef.current?.abort();
      orchestrator.cancel();
    };
  }, [id, navigation, orchestrator, router, store, loadAttempt]);

  // Apply inference defaults from Settings once per chat.
  useEffect(() => {
    Promise.all([store.getSetting('temperature'), store.getSetting('max_tokens')])
      .then(([temp, tokens]) => {
        if (temp !== null && Number.isFinite(Number(temp)))
          setTemperature(Math.min(1.5, Math.max(0, Number(temp))));
        if (tokens) setMaxTokens(Math.min(1024, Math.max(64, Math.floor(Number(tokens) || 512))));
      })
      .catch(() => {});
  }, [store]);

  // Discard any live mic capture if the screen unmounts mid-recording.
  useFocusEffect(
    useCallback(
      () => () => {
        voiceEpoch.current++;
        recorderRef.current?.stop().catch(() => {});
        recorderRef.current = null;
        setRecording(false);
        setVoiceBusy(false);
      },
      []
    )
  );

  // ----------------------------------------------------------------- sending

  const allowedTools = Object.entries(toolToggles)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name);

  async function send() {
    const text = input.trim();
    if (!text || running || busy || sendGuard.current || !historyReady || recording || voiceBusy) return;
    if (!engine.isLoaded()) {
      router.push('/models');
      return;
    }
    sendGuard.current = true;
    const sendController = new AbortController();
    sendAbortRef.current = sendController;
    const epoch = screenEpoch.current;
    setRunning(true);
    setScreenError('');
    setInput('');
    // Auto-title a fresh conversation from the first message.
    if (conversation && conversation.title === 'New chat') {
      const title = text.slice(0, 40);
      store.renameConversation(id, title).catch(() => {});
      setConversation((c) => (c ? { ...c, title } : c));
      navigation.setOptions({ title });
    }
    const userMsg: Msg = { id: uid(), role: 'user', text };
    const aiId = uid();
    const aiMsg: Msg = { id: aiId, role: 'assistant', text: '' };
    const next = [...messages, userMsg, aiMsg];
    setMessages(next);
    const activities: NonNullable<MessageMeta['activities']> = [];
    let stats: MessageMeta['stats'];
    let finalText = '';
    let failed = false;
    let persisted = false;
    let finalTaint = true;
    const appendText = (t: string) => {
      finalText += t;
      if (screenEpoch.current !== epoch) return;
      setMessages((m) => m.map((x) => (x.id === aiId ? { ...x, text: x.text + t } : x)));
    };
    try {
      await store.beginExchange(id, { id: userMsg.id, content: text }, aiId);
      persisted = true;
      if (screenEpoch.current !== epoch) return;
      if (sendController.signal.aborted) {
        appendText('\nCancelled.');
        return;
      }
      await orchestrator.run(text, {
        onProvenance: (tainted) => {
          finalTaint = tainted;
        },
        onToken: appendText,
        onToolActivity: (name, result) => {
          activities.push({ name, result: result.slice(0, 2000) });
          if (screenEpoch.current !== epoch) return;
          setMessages((m) =>
            m.map((x) => (x.id === aiId ? { ...x, meta: { ...x.meta, activities: [...activities] } } : x))
          );
        },
        onMemoryError: (message) => {
          appendText(`\nMemory unavailable: ${message}\n`);
        },
        onStats: (s) => {
          stats = s;
          if (screenEpoch.current !== epoch) return;
          setMessages((m) => m.map((x) => (x.id === aiId ? { ...x, meta: { ...x.meta, stats: s } } : x)));
        },
        systemPrompt: systemPrompt.trim() || undefined,
        allowedTools: Object.keys(toolToggles).length ? allowedTools : undefined,
        memoryEnabled,
        temperature,
        maxTokens,
      });
    } catch (e) {
      failed = true;
      appendText(`\n${(e as Error).message}`);
    } finally {
      const meta = { activities, stats, error: failed, tainted: finalTaint };
      if (persisted) {
        try {
          await store.updateMessage(aiId, {
            content: finalText || 'Response interrupted. You can retry this message.',
            meta,
          });
        } catch (error) {
          if (screenEpoch.current === epoch)
            setScreenError(`Reply could not be saved: ${(error as Error).message}`);
        }
      } else if (screenEpoch.current === epoch) {
        setMessages((m) => m.filter((message) => message.id !== userMsg.id && message.id !== aiId));
        setInput(text);
        setScreenError('Message could not be saved. Your draft has been restored.');
      }
      if (screenEpoch.current === epoch) {
        setMessages((m) => m.map((message) => (message.id === aiId ? { ...message, meta } : message)));
        setRunning(false);
      }
      sendGuard.current = false;
      if (sendAbortRef.current === sendController) sendAbortRef.current = null;
    }
  }

  async function regenerate() {
    if (running || busy || sendGuard.current || recording || voiceBusy) return;
    // Drop the last assistant message and the user message that produced it.
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!lastAssistant) return;
    const index = messages.findIndex((m) => m.id === lastAssistant.id);
    if (index <= 0) return;
    const userMessage = messages[index - 1];
    if (userMessage.role !== 'user') return;
    sendGuard.current = true;
    setRunning(true);
    const epoch = screenEpoch.current;
    try {
      await store.deleteMessagesAfter(id, userMessage.id);
      const rows = await store.listMessages(id);
      if (screenEpoch.current !== epoch) return;
      await orchestrator.loadHistory(conversationTurns(rows));
      if (screenEpoch.current !== epoch) return;
      const trimmed = messages.slice(0, index - 1);
      setMessages(trimmed);
      setInput(userMessage.text);
    } catch (error) {
      setScreenError((error as Error).message);
    } finally {
      sendGuard.current = false;
      if (screenEpoch.current === epoch) setRunning(false);
    }
  }

  async function copyMessage(message: Msg) {
    try {
      await Clipboard.setStringAsync(message.text);
    } catch (error) {
      setScreenError((error as Error).message);
    }
  }

  // ------------------------------------------------------------------ voice

  async function toggleRecording() {
    if (voiceGuard.current || !historyReady || busy || running) return;
    const epoch = screenEpoch.current;
    const captureEpoch = voiceEpoch.current;
    setScreenError('');
    if (recording) {
      voiceGuard.current = true;
      setVoiceBusy(true);
      setRecording(false);
      try {
        const recorder = recorderRef.current;
        recorderRef.current = null;
        const samples = await recorder?.stop();
        if (!samples || samples.length === 0) return;
        const transcript = await speech.transcribe(samples);
        if (transcript && screenEpoch.current === epoch && voiceEpoch.current === captureEpoch)
          setInput((v) => (v ? `${v} ${transcript}` : transcript).slice(0, 4000));
      } catch (e) {
        if (screenEpoch.current === epoch) setScreenError(`Voice: ${(e as Error).message}`);
      } finally {
        voiceGuard.current = false;
        if (screenEpoch.current === epoch) setVoiceBusy(false);
      }
      return;
    }
    if (!speech.isLoaded()) {
      Alert.alert(
        'Set up voice input',
        'Download and enable the voice model in Models. Recordings are transcribed on this device.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Models', onPress: () => router.push('/models') },
        ]
      );
      return;
    }
    voiceGuard.current = true;
    setVoiceBusy(true);
    try {
      const recorder = new VoiceRecorder(() => stopVoiceRef.current());
      recorderRef.current = recorder;
      await recorder.start();
      if (screenEpoch.current !== epoch || voiceEpoch.current !== captureEpoch) {
        await recorder.stop();
        return;
      }
      setRecording(true);
    } catch (e) {
      if (screenEpoch.current === epoch) setScreenError(`Voice: ${(e as Error).message}`);
    } finally {
      voiceGuard.current = false;
      if (screenEpoch.current === epoch) setVoiceBusy(false);
    }
  }
  useEffect(() => {
    stopVoiceRef.current = () => {
      void toggleRecording();
    };
  });

  // ------------------------------------------------------- per-chat settings

  async function saveChatSettings() {
    try {
      await store.updateConversation(id, {
        system_prompt: systemPrompt,
        tools_json: JSON.stringify(toolToggles),
        memory_enabled: memoryEnabled,
      });
      setConversation((value) =>
        value
          ? {
              ...value,
              system_prompt: systemPrompt,
              tools_json: JSON.stringify(toolToggles),
              memory_enabled: memoryEnabled ? 1 : 0,
            }
          : value
      );
    } catch (e) {
      setScreenError(`Settings could not be saved: ${(e as Error).message}`);
      return;
    }
    setShowSettings(false);
  }

  function dismissSettings() {
    if (conversation) {
      setSystemPrompt(conversation.system_prompt);
      setMemoryEnabled(Boolean(conversation.memory_enabled));
      setToolToggles(parseTools(conversation.tools_json, ALL_TOOL_NAMES));
    }
    setShowSettings(false);
  }

  async function deleteChat() {
    setShowSettings(false);
    Alert.alert(
      'Delete this chat?',
      'The conversation and its messages will be permanently deleted from this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await store.deleteConversation(id);
              router.replace('/');
            } catch (error) {
              setScreenError((error as Error).message);
            }
          },
        },
      ]
    );
  }

  const toolNames = Object.keys(toolToggles);
  const lastAssistantId = [...messages].reverse().find((m) => m.role === 'assistant')?.id;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: color.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <Background3D />
      <View style={{ flex: 1, padding: space.lg, paddingBottom: Math.max(space.md, insets.bottom) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <AnimatedPress disabled={running || busy || !historyReady} onPress={() => setShowSettings(true)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
              <Ionicons name="options-outline" size={20} color={color.textDim} />
              <Text style={[type.small, { color: color.textDim }]}>Chat settings</Text>
            </View>
          </AnimatedPress>
          <AnimatedPress onPress={() => router.push('/models')}>
            <Text style={[type.small, { color: color.accent }]}>Models</Text>
          </AnimatedPress>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, marginBottom: space.sm }}>
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: ready ? color.success : color.warn,
            }}
          />
          <Text style={[type.small, { color: color.textDim }]}>
            {ready ? 'On-device model ready' : 'Model setup needed'} · {allowedTools.length} tools enabled
          </Text>
        </View>
        {screenError ? (
          <GlassCard style={{ borderColor: color.danger, marginBottom: space.sm }}>
            <Text accessibilityLiveRegion="polite" style={[type.small, { color: color.danger }]}>
              {screenError}
            </Text>
            {!historyReady && (
              <AnimatedPress onPress={() => setLoadAttempt((value) => value + 1)}>
                <Text style={{ color: color.accent }}>Try again</Text>
              </AnimatedPress>
            )}
          </GlassCard>
        ) : null}
        {!historyReady && !screenError && (
          <View style={{ flexDirection: 'row', gap: space.sm, paddingVertical: space.md }}>
            <ActivityIndicator color={color.accent} />
            <Text style={{ color: color.textDim }}>Opening conversation…</Text>
          </View>
        )}

        <FlatList
          ref={listRef}
          style={{ flex: 1 }}
          data={messages}
          keyExtractor={(m) => m.id}
          extraData={messages}
          contentContainerStyle={{ paddingVertical: space.md, gap: space.md }}
          keyboardShouldPersistTaps="handled"
          onScroll={({ nativeEvent }) => {
            nearBottom.current =
              nativeEvent.contentSize.height -
                nativeEvent.layoutMeasurement.height -
                nativeEvent.contentOffset.y <
              100;
          }}
          scrollEventThrottle={100}
          onContentSizeChange={() => {
            if (nearBottom.current) listRef.current?.scrollToEnd({ animated: false });
          }}
          ListEmptyComponent={
            historyReady ? (
              <GlassCard style={{ marginTop: space.xl }}>
                <Ionicons name="sparkles-outline" size={28} color={color.accent} />
                <Text style={[type.title, { color: color.text, marginTop: space.md }]}>
                  What can I help with?
                </Text>
                <Text style={[type.body, { color: color.textDim, marginVertical: space.sm }]}>
                  Your conversation stays on this device. Changes to your phone always ask for your approval.
                </Text>
                {(ready
                  ? [
                      'Help me plan my day',
                      ...(allowedTools.includes('get_current_time') ? ['What time is it?'] : []),
                      ...(allowedTools.includes('notify_schedule')
                        ? ['Remind me to take a break in 20 minutes']
                        : []),
                    ]
                  : ['Set up a local model']
                ).map((prompt) => (
                  <AnimatedPress
                    key={prompt}
                    onPress={() => (ready ? setInput(prompt) : router.push('/models'))}
                  >
                    <Text style={{ color: color.accent, paddingVertical: space.sm }}>{prompt}</Text>
                  </AnimatedPress>
                ))}
              </GlassCard>
            ) : null
          }
          renderItem={({ item }) => (
            <View style={{ alignItems: item.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <GlassCard
                style={{
                  maxWidth: '88%',
                  backgroundColor: item.role === 'user' ? color.userBubble : color.aiBubble,
                }}
              >
                {item.role === 'assistant' ? (
                  <MarkdownText value={item.text || '…'} />
                ) : (
                  <Text style={[type.body, { color: color.text }]}>{item.text}</Text>
                )}
                {item.role === 'assistant' && <ToolActivity meta={item.meta ?? {}} color={color} />}
                {item.role === 'assistant' && !running && item.text && (
                  <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
                    <AnimatedPress accessibilityLabel="Copy response" onPress={() => copyMessage(item)}>
                      <Ionicons name="copy-outline" size={16} color={color.textDim} />
                    </AnimatedPress>
                    {item.id === lastAssistantId && (
                      <AnimatedPress
                        accessibilityLabel="Edit and retry last message"
                        disabled={busy}
                        onPress={regenerate}
                      >
                        <Ionicons name="refresh-outline" size={16} color={color.textDim} />
                      </AnimatedPress>
                    )}
                  </View>
                )}
              </GlassCard>
            </View>
          )}
        />

        {(orchestrator.hasUntrustedContext || messages.some((message) => message.meta?.tainted)) && (
          <Text style={[type.small, { color: color.textDim, marginBottom: space.sm }]}>
            This chat has read external content. Start a new chat to make device changes.
          </Text>
        )}
        {(running || busy || voiceBusy || recording) && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: space.xs,
            }}
          >
            <Text
              accessibilityLiveRegion="polite"
              style={[type.small, { color: recording ? color.danger : color.textDim }]}
            >
              {recording
                ? 'Recording · tap the mic to transcribe'
                : voiceBusy
                  ? 'Processing voice on this device…'
                  : running
                    ? 'Working on this device…'
                    : 'Finishing previous operation…'}
            </Text>
            {running && (
              <AnimatedPress
                accessibilityLabel="Stop response"
                onPress={() => {
                  sendAbortRef.current?.abort();
                  orchestrator.cancel();
                }}
              >
                <Text style={{ color: color.danger }}>Stop</Text>
              </AnimatedPress>
            )}
          </View>
        )}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
            padding: space.sm,
            backgroundColor: color.surface0,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: color.border,
          }}
        >
          <AnimatedPress
            accessibilityLabel={recording ? 'Stop recording and transcribe' : 'Record voice message'}
            onPress={toggleRecording}
            disabled={running || busy || voiceBusy || !historyReady}
          >
            <Ionicons
              name={recording ? 'stop-circle' : 'mic-outline'}
              size={22}
              color={recording ? color.danger : color.textDim}
            />
          </AnimatedPress>
          <TextInput
            style={{
              flex: 1,
              color: color.text,
              paddingHorizontal: space.sm,
              paddingVertical: space.sm,
              fontSize: 15,
              maxHeight: 120,
            }}
            value={input}
            onChangeText={setInput}
            placeholder={ready ? 'Message…' : 'Download a model first…'}
            placeholderTextColor={color.textDim}
            editable={!running && !busy && historyReady && !recording && !voiceBusy}
            maxLength={4000}
            multiline
          />
          <AnimatedPress
            accessibilityLabel="Send message"
            onPress={send}
            disabled={running || busy || !historyReady || recording || voiceBusy || !input.trim()}
          >
            <View
              style={{
                paddingHorizontal: space.lg,
                paddingVertical: space.sm,
                backgroundColor: color.accent,
                borderRadius: radius.pill,
              }}
            >
              <Ionicons name="arrow-up" size={18} color={color.accentText} />
            </View>
          </AnimatedPress>
        </View>
      </View>

      {/* ------------------------------------------------- chat settings modal */}
      <Modal visible={showSettings} transparent animationType="slide" onRequestClose={dismissSettings}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: color.backdrop }}>
          <View
            style={{
              backgroundColor: color.bg,
              borderTopLeftRadius: radius.lg,
              borderTopRightRadius: radius.lg,
              padding: space.lg,
              maxHeight: '90%',
            }}
          >
            <Text style={[type.title, { color: color.text, marginBottom: space.md }]}>Chat settings</Text>
            <ScrollView>
              <Text style={[type.body, { color: color.textDim, marginBottom: space.xs }]}>System prompt</Text>
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: color.border,
                  borderRadius: radius.sm,
                  padding: space.md,
                  color: color.text,
                  backgroundColor: color.surface0,
                  minHeight: 80,
                  textAlignVertical: 'top',
                }}
                value={systemPrompt}
                onChangeText={setSystemPrompt}
                placeholder="Custom instructions for this chat (optional)"
                placeholderTextColor={color.textDim}
                multiline
                maxLength={2000}
              />
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: space.md,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { color: color.text }]}>Memory (RAG)</Text>
                  <Text style={[type.small, { color: color.textDim }]}>
                    Use saved notes from all your chats on this device
                  </Text>
                </View>
                <Switch value={memoryEnabled} onValueChange={setMemoryEnabled} />
              </View>
              <Text style={[type.body, { color: color.text, marginTop: space.md, marginBottom: space.xs }]}>
                Tools
              </Text>
              {toolNames.map((name) => (
                <View
                  key={name}
                  style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <Text
                    style={[type.body, { color: color.textDim, textTransform: 'capitalize', flexShrink: 1 }]}
                  >
                    {name.replace(/_/g, ' ')}
                  </Text>
                  <Switch
                    value={toolToggles[name]}
                    onValueChange={(value) => setToolToggles((t) => ({ ...t, [name]: value }))}
                  />
                </View>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space.md }}>
              <AnimatedPress onPress={deleteChat}>
                <Text style={{ color: color.danger, paddingHorizontal: space.md }}>Delete chat</Text>
              </AnimatedPress>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <AnimatedPress onPress={dismissSettings}>
                  <Text style={{ color: color.textDim, paddingHorizontal: space.md }}>Cancel</Text>
                </AnimatedPress>
                <AnimatedPress onPress={saveChatSettings}>
                  <Text style={{ color: color.accent, fontWeight: '700', paddingHorizontal: space.md }}>
                    Save
                  </Text>
                </AnimatedPress>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

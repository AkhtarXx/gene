import { FlatList, TextInput, Text, View } from 'react-native';
import { useState } from 'react';
import { Link } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useServices } from '../src/ui/ServicesContext';
import { Background3D } from '../src/ui/Background3D';
import { GlassCard } from '../src/ui/GlassCard';
import { AnimatedPress } from '../src/ui/AnimatedPress';
import { color, radius, space, spring, type } from '../src/ui/theme';

type Msg = { id: string; role: 'user' | 'assistant'; text: string };

function uid(): string {
  return Math.random().toString(36).slice(2);
}

export default function ChatScreen() {
  const { orchestrator, engine } = useServices();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);

  const sendScale = useSharedValue(1);
  const sendStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sendScale.value }],
  }));

  async function send() {
    const text = input.trim();
    if (!text || running) return;
    if (!engine.isLoaded()) {
      setMessages((m) => [
        ...m,
        { id: uid(), role: 'assistant', text: 'Model not loaded — open Models and download one.' },
      ]);
      return;
    }
    setInput('');
    const aiId = uid();
    setMessages((m) => [
      ...m,
      { id: uid(), role: 'user', text },
      { id: aiId, role: 'assistant', text: '' },
    ]);
    setRunning(true);
    try {
      await orchestrator.run(text, {
        onToken: (t) =>
          setMessages((m) => m.map((x) => (x.id === aiId ? { ...x, text: x.text + t } : x))),
        onToolActivity: (name) =>
          setMessages((m) =>
            m.map((x) => (x.id === aiId ? { ...x, text: x.text + `\n▸ used tool: ${name}\n` } : x))
          ),
      });
    } catch (e) {
      setMessages((m) =>
        m.map((x) => (x.id === aiId ? { ...x, text: x.text + '\n[error]' } : x))
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <Background3D />
      <View style={{ flex: 1, padding: space.lg }}>
        <FlatList
          style={{ flex: 1 }}
          data={messages}
          keyExtractor={(m) => m.id}
          extraData={messages}
          contentContainerStyle={{ paddingVertical: space.md, gap: space.md }}
          renderItem={({ item }) => (
            <GlassCard
              style={{
                alignSelf: item.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '82%',
                backgroundColor: item.role === 'user' ? color.userBubble : color.aiBubble,
              }}
            >
              <Text style={[type.body, { color: color.text }]}>{item.text}</Text>
            </GlassCard>
          )}
        />

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
          <TextInput
            style={{
              flex: 1,
              color: color.text,
              paddingHorizontal: space.md,
              paddingVertical: space.sm,
              fontSize: 15,
            }}
            value={input}
            onChangeText={setInput}
            placeholder="Message…"
            placeholderTextColor={color.textDim}
            editable={!running}
          />
          <AnimatedPress onPress={send} disabled={running}>
            <View
              style={{
                paddingHorizontal: space.lg,
                paddingVertical: space.sm,
                backgroundColor: color.accent,
                borderRadius: radius.pill,
              }}
            >
              <Text style={{ color: '#06251F', fontWeight: '700' }}>
                {running ? '…' : 'Send'}
              </Text>
            </View>
          </AnimatedPress>
          {running && (
            <AnimatedPress onPress={() => engine.stop()}>
              <Text style={{ color: color.danger, paddingHorizontal: space.md }}>Cancel</Text>
            </AnimatedPress>
          )}
          <Link href="/models">
            <Text style={{ color: color.accent, paddingHorizontal: space.md }}>Models</Text>
          </Link>
        </View>
      </View>
    </View>
  );
}

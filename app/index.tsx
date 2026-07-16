import { FlatList, TextInput, Pressable, Text, View } from 'react-native';
import { useState } from 'react';
import { Link } from 'expo-router';
import { useServices } from './ServicesContext';

type Msg = { id: string; role: 'user' | 'assistant'; text: string };

function uid(): string {
  return Math.random().toString(36).slice(2);
}

export default function ChatScreen() {
  const { orchestrator, engine } = useServices();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);

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
    <View style={{ flex: 1, padding: 12 }}>
      <FlatList
        style={{ flex: 1 }}
        data={messages}
        keyExtractor={(m) => m.id}
        extraData={messages}
        renderItem={({ item }) => (
          <Text
            style={{
              textAlign: item.role === 'user' ? 'right' : 'left',
              marginVertical: 4,
              color: item.role === 'user' ? '#0a7' : '#222',
            }}
          >
            {item.text}
          </Text>
        )}
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          style={{ flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 8 }}
          value={input}
          onChangeText={setInput}
          placeholder="Message…"
          editable={!running}
        />
        <Pressable onPress={send} disabled={running}>
          <Text style={{ padding: 12, color: running ? '#999' : '#0a7' }}>Send</Text>
        </Pressable>
        {running && (
          <Pressable onPress={() => engine.stop()}>
            <Text style={{ padding: 12, color: '#c00' }}>Cancel</Text>
          </Pressable>
        )}
        <Link href="/models">
          <Text style={{ padding: 12, color: '#0a7' }}>Models</Text>
        </Link>
      </View>
    </View>
  );
}

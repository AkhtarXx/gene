import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Background3D } from '../src/ui/Background3D';
import { GlassCard } from '../src/ui/GlassCard';
import { AnimatedPress } from '../src/ui/AnimatedPress';
import { radius, space, type, useTheme } from '../src/ui/theme';
import { useServices } from '../src/ui/ServicesContext';
import { SETTINGS_SECTIONS } from '../src/services/tools/PhoneActionsTool';

type Field = { key: string; label: string; hint: string; numeric?: boolean; multiline?: boolean };
const FORMS: { name: string; label: string; help: string; fields: Field[] }[] = [
  {
    name: 'open_settings',
    label: 'Settings',
    help: 'Open a settings page and make changes yourself.',
    fields: [],
  },
  {
    name: 'phone_dial',
    label: 'Dialer',
    help: 'Review the number in your dialer, then press Call yourself.',
    fields: [{ key: 'number', label: 'Phone number', hint: '+92 300 1234567' }],
  },
  {
    name: 'message_draft',
    label: 'SMS draft',
    help: 'Prepare a draft. You review it and press Send in your messaging app.',
    fields: [
      { key: 'number', label: 'Recipient number', hint: '+92 300 1234567' },
      { key: 'body', label: 'Message', hint: 'Write your draft…', multiline: true },
    ],
  },
  {
    name: 'timer_set',
    label: 'Timer',
    help: 'Open the clock app to review and finish setting your timer.',
    fields: [
      { key: 'seconds', label: 'Duration in seconds (1–86400)', hint: '60', numeric: true },
      { key: 'title', label: 'Timer label', hint: 'Take a break' },
    ],
  },
  {
    name: 'maps_open',
    label: 'Maps',
    help: 'Search in your maps app. Its own internet and location settings apply.',
    fields: [{ key: 'query', label: 'Place or address', hint: 'Karachi' }],
  },
  {
    name: 'launch_app',
    label: 'Open app',
    help: 'Choose an app already installed on your phone.',
    fields: [{ key: 'target', label: 'App package', hint: 'com.android.settings' }],
  },
  {
    name: 'notify_schedule',
    label: 'Reminder',
    help: 'Schedule a local notification. Permission is required; Android battery management may delay delivery.',
    fields: [
      { key: 'seconds', label: 'Delay in seconds (1–86400)', hint: '60', numeric: true },
      { key: 'title', label: 'Title', hint: 'Take a break' },
      { key: 'body', label: 'Reminder text', hint: 'Stand up and stretch', multiline: true },
    ],
  },
];
const APP_SHORTCUTS = [
  { label: 'Settings', target: 'com.android.settings' },
  { label: 'WhatsApp', target: 'com.whatsapp' },
  { label: 'Chrome', target: 'com.android.chrome' },
  { label: 'Gmail', target: 'com.google.android.gm' },
  { label: 'YouTube', target: 'com.google.android.youtube' },
  { label: 'Maps', target: 'com.google.android.apps.maps' },
];

export default function ActionsScreen() {
  const { color } = useTheme();
  const { actions, orchestrator } = useServices();
  const agentBusy = useSyncExternalStore(orchestrator.subscribe, orchestrator.getSnapshot);
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState('open_settings');
  const [values, setValues] = useState<Record<string, string>>({
    section: 'general',
    seconds: '60',
    target: 'com.android.settings',
  });
  const [customApp, setCustomApp] = useState(false);
  const working = useSyncExternalStore(actions.subscribe, actions.getSnapshot);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const focused = useRef(false);
  const form = FORMS.find((entry) => entry.name === selected)!;
  const disabled = working || agentBusy || Platform.OS !== 'android';
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => {
        focused.current = false;
        actions.cancel();
      };
    }, [actions])
  );

  async function run() {
    if (actions.busy || orchestrator.busy || Platform.OS !== 'android') return;
    const args: Record<string, unknown> = {};
    for (const field of form.fields) {
      const value = (values[field.key] ?? '').trim();
      if (
        !value ||
        (field.numeric && (!Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > 86400))
      ) {
        setFailed(true);
        setMessage(`Enter ${field.label.toLowerCase()}.`);
        return;
      }
      args[field.key] = field.numeric ? Number(value) : value;
    }
    if (selected === 'open_settings') args.section = values.section;
    setMessage('');
    setFailed(false);
    try {
      const result = await actions.run(selected, args, {
        title: `Allow ${form.label.toLowerCase()}?`,
        message: form.help,
      });
      if (!focused.current) return;
      if (result === null) {
        setMessage('Action cancelled.');
        return;
      }
      const outcome = JSON.parse(result) as { ok?: boolean; status?: string; error?: string };
      if (!outcome.ok) {
        setFailed(true);
        setMessage(
          outcome.status === 'invalid_arguments'
            ? 'Check your fields: use a valid number, duration or place.'
            : outcome.status === 'no_supported_app'
              ? 'No compatible app could open this action on this device.'
              : (outcome.error ?? 'This action is unavailable on this device.')
        );
      } else {
        setMessage(
          selected === 'notify_schedule'
            ? 'Reminder scheduled. Android may delay delivery to save battery.'
            : 'App opened. Complete the action in that app; no call or message is sent by Gene.'
        );
      }
    } catch (error) {
      if (focused.current) {
        setFailed(true);
        setMessage((error as Error).message);
      }
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <Background3D />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: space.lg, paddingBottom: Math.max(space.lg, insets.bottom) }}
      >
        <Text style={[type.display, { color: color.text }]}>Phone actions</Text>
        <Text style={[type.body, { color: color.textDim, marginVertical: space.md }]}>
          Use these shortcuts without loading an AI model, or ask in chat. Every action asks for your
          approval.
        </Text>
        {Platform.OS !== 'android' && (
          <Text style={{ color: color.danger }}>These shortcuts require Android.</Text>
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.lg }}>
          {FORMS.map((entry) => (
            <AnimatedPress
              key={entry.name}
              disabled={working}
              onPress={() => {
                setSelected(entry.name);
                setMessage('');
              }}
              style={{
                padding: space.sm,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: selected === entry.name ? color.accent : color.border,
              }}
            >
              <Text style={{ color: selected === entry.name ? color.accent : color.textDim }}>
                {entry.label}
              </Text>
            </AnimatedPress>
          ))}
        </View>
        <GlassCard>
          <Text style={[type.title, { color: color.text }]}>{form.label}</Text>
          <Text style={[type.body, { color: color.textDim, marginVertical: space.md }]}>{form.help}</Text>
          {selected === 'open_settings' && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {Object.keys(SETTINGS_SECTIONS).map((section) => (
                <AnimatedPress
                  key={section}
                  disabled={working}
                  onPress={() => setValues((old) => ({ ...old, section }))}
                  style={{
                    padding: space.sm,
                    borderRadius: radius.pill,
                    backgroundColor: values.section === section ? color.userBubble : color.surface2,
                  }}
                >
                  <Text
                    style={{
                      color: values.section === section ? color.accent : color.textDim,
                      textTransform: 'capitalize',
                    }}
                  >
                    {section}
                  </Text>
                </AnimatedPress>
              ))}
            </View>
          )}
          {selected === 'launch_app' && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {APP_SHORTCUTS.map((app) => (
                <AnimatedPress
                  key={app.target}
                  disabled={working}
                  onPress={() => {
                    setValues((old) => ({ ...old, target: app.target }));
                    setCustomApp(false);
                  }}
                  style={{
                    padding: space.sm,
                    borderRadius: radius.pill,
                    backgroundColor:
                      !customApp && values.target === app.target ? color.userBubble : color.surface2,
                  }}
                >
                  <Text
                    style={{
                      color: !customApp && values.target === app.target ? color.accent : color.textDim,
                    }}
                  >
                    {app.label}
                  </Text>
                </AnimatedPress>
              ))}
              <AnimatedPress
                disabled={working}
                onPress={() => setCustomApp(true)}
                style={{ padding: space.sm }}
              >
                <Text style={{ color: color.accent }}>Another app…</Text>
              </AnimatedPress>
            </View>
          )}
          {form.fields
            .filter(() => selected !== 'launch_app' || customApp)
            .map((field) => (
              <View key={field.key} style={{ marginBottom: space.md }}>
                <Text style={[type.small, { color: color.textDim, marginBottom: space.xs }]}>
                  {field.label}
                </Text>
                <TextInput
                  accessibilityLabel={field.label}
                  editable={!working}
                  value={values[field.key] ?? ''}
                  onChangeText={(value) => setValues((old) => ({ ...old, [field.key]: value }))}
                  placeholder={field.hint}
                  placeholderTextColor={color.textDim}
                  multiline={field.multiline}
                  maxLength={field.key === 'body' ? 2000 : field.key === 'query' ? 300 : 120}
                  keyboardType={field.numeric ? 'numeric' : field.key === 'number' ? 'phone-pad' : 'default'}
                  autoCapitalize="none"
                  style={[
                    type.body,
                    {
                      color: color.text,
                      backgroundColor: color.surface2,
                      borderColor: color.border,
                      borderWidth: 1,
                      borderRadius: radius.md,
                      padding: space.md,
                      minHeight: field.multiline ? 100 : 48,
                      textAlignVertical: 'top',
                    },
                  ]}
                />
              </View>
            ))}
          <AnimatedPress
            accessibilityLabel={`Review ${form.label.toLowerCase()}`}
            disabled={disabled}
            onPress={run}
            style={{
              backgroundColor: color.accent,
              borderRadius: radius.pill,
              padding: space.md,
              alignItems: 'center',
              marginTop: space.md,
            }}
          >
            <Text style={[type.body, { color: color.accentText, fontWeight: '700' }]}>
              {working ? 'Waiting for approval or the other app…' : 'Review action'}
            </Text>
          </AnimatedPress>
          {working && (
            <AnimatedPress
              onPress={() => actions.cancel()}
              style={{ padding: space.md, alignSelf: 'center' }}
            >
              <Text style={{ color: color.danger }}>Cancel</Text>
            </AnimatedPress>
          )}
          {message !== '' && (
            <Text
              accessibilityLiveRegion="polite"
              style={[type.body, { color: failed ? color.danger : color.textDim, marginTop: space.md }]}
            >
              {message}
            </Text>
          )}
          {agentBusy && !working && (
            <Text style={{ color: color.textDim, marginTop: space.md }}>
              Finish or stop the current chat request first.
            </Text>
          )}
        </GlassCard>
      </ScrollView>
    </View>
  );
}

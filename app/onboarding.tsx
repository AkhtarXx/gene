import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useServices } from '../src/ui/ServicesContext';
import { Background3D } from '../src/ui/Background3D';
import { GlassCard } from '../src/ui/GlassCard';
import { AnimatedPress } from '../src/ui/AnimatedPress';
import { radius, space, type, useTheme } from '../src/ui/theme';
import { deviceRamGB, recommendedChatModel } from '../src/models/tier';

const STEPS = [
  {
    icon: 'lock-closed-outline' as const,
    title: 'Everything runs on your phone',
    body: 'Gene uses a local language model. Your chats, memories and files are processed and stored on this device — nothing is sent to any server.',
  },
  {
    icon: 'shield-checkmark-outline' as const,
    title: 'You are in control',
    body: 'The assistant can only act through approved tools. Reading data is automatic, but anything that changes your device — files, calendar, reminders — asks for your confirmation first, and every action is written to the Activity Log.',
  },
  {
    icon: 'cube-outline' as const,
    title: 'Download a model once',
    body:
      'Pick a model based on your phone (this device has ' +
      deviceRamGB() +
      ' GB RAM — recommended: ' +
      recommendedChatModel().label +
      '). Weights are verified against pinned hashes before they load.',
  },
];

export default function OnboardingScreen() {
  const { color } = useTheme();
  const { store } = useServices();
  const router = useRouter();
  const [step, setStep] = useState(0);

  async function finish() {
    await store.setSetting('onboarded', '1');
    router.replace('/');
  }

  const current = STEPS[step];

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <Background3D />
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: space.lg, justifyContent: 'center' }}>
        <GlassCard style={{ alignItems: 'center', paddingVertical: space.xxl }}>
          <Ionicons name={current.icon} size={56} color={color.accent} />
          <Text style={[type.display, { color: color.text, marginTop: space.md, textAlign: 'center' }]}>
            {current.title}
          </Text>
          <Text
            style={[
              type.body,
              { color: color.textDim, marginTop: space.md, textAlign: 'center', lineHeight: 22 },
            ]}
          >
            {current.body}
          </Text>
          <View style={{ flexDirection: 'row', gap: space.xs, marginTop: space.lg }}>
            {STEPS.map((_, i) => (
              <View
                key={i}
                style={{
                  width: i === step ? 20 : 8,
                  height: 8,
                  borderRadius: radius.pill,
                  backgroundColor: i === step ? color.accent : color.border,
                }}
              />
            ))}
          </View>
        </GlassCard>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space.lg }}>
          <AnimatedPress onPress={finish}>
            <Text style={{ color: color.textDim, paddingHorizontal: space.md }}>Skip</Text>
          </AnimatedPress>
          <AnimatedPress
            onPress={() => {
              if (step < STEPS.length - 1) setStep(step + 1);
              else finish();
            }}
            style={{ backgroundColor: color.accent, borderRadius: radius.pill }}
          >
            <Text
              style={[
                type.body,
                {
                  color: color.accentText,
                  fontWeight: '700',
                  paddingHorizontal: space.xl,
                  paddingVertical: space.xs,
                },
              ]}
            >
              {step < STEPS.length - 1 ? 'Next' : 'Start'}
            </Text>
          </AnimatedPress>
        </View>
      </ScrollView>
    </View>
  );
}

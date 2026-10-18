import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useServices } from '../src/ui/ServicesContext';
import { Background3D } from '../src/ui/Background3D';
import { GlassCard } from '../src/ui/GlassCard';
import { AnimatedPress } from '../src/ui/AnimatedPress';
import { space, type, useTheme } from '../src/ui/theme';
import type { AuditRow } from '../src/services/storage/AppStore';

const RISK_COLORS: Record<string, string> = {
  read: 'rgba(52,211,153,0.2)',
  write: 'rgba(251,191,36,0.2)',
  destructive: 'rgba(248,113,113,0.2)',
};

export default function AuditScreen() {
  const { color } = useTheme();
  const { store } = useServices();
  const [rows, setRows] = useState<AuditRow[]>([]);

  const refresh = useCallback(() => {
    store
      .listAudit(200)
      .then(setRows)
      .catch(() => {});
  }, [store]);

  useFocusEffect(refresh);

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <Background3D />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        <Text style={[type.display, { color: color.text }]}>Activity Log</Text>
        <Text style={[type.body, { color: color.textDim }]}>
          Every device action the agent has attempted — allowed or denied. Transparency is the point of this
          app.
        </Text>
        {rows.map((row) => (
          <GlassCard key={row.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[type.body, { color: color.text, fontWeight: '600' }]}>{row.name}</Text>
              <Text style={[type.small, { color: row.allowed ? color.success : color.danger }]}>
                {row.allowed ? 'ALLOWED' : 'DENIED'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space.xs }}>
              <Text
                style={[
                  type.small,
                  {
                    color: color.text,
                    backgroundColor: RISK_COLORS[row.risk] ?? color.surface2,
                    paddingHorizontal: space.sm,
                    paddingVertical: 2,
                    borderRadius: 8,
                    overflow: 'hidden',
                  },
                ]}
              >
                {row.risk}
              </Text>
              <Text style={[type.small, { color: color.textDim }]}>{new Date(row.at).toLocaleString()}</Text>
            </View>
          </GlassCard>
        ))}
        {rows.length === 0 && (
          <GlassCard>
            <Text style={[type.body, { color: color.textDim, textAlign: 'center' }]}>
              No actions yet. When the assistant uses a tool, it will show up here.
            </Text>
          </GlassCard>
        )}
        {rows.length > 0 && (
          <View style={{ alignItems: 'flex-start' }}>
            <AnimatedPress
              onPress={() => {
                store.clearAudit().then(refresh);
              }}
            >
              <Text style={{ color: color.danger }}>Clear log</Text>
            </AnimatedPress>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { setConfirmHandler, type ConfirmRequest } from './confirmBridge';
import { type, useTheme } from './theme';

/**
 * Registers the real confirmation prompt for the Security Gate. Mounted once
 * in the root layout. Non-React classes call requestConfirm -> this handler.
 */
export function ConfirmationDialog() {
  const { color } = useTheme();
  const [pending, setPending] = useState<{ request: ConfirmRequest; finish: (ok: boolean) => void } | null>(
    null
  );
  useEffect(() => {
    let active: ((ok: boolean) => void) | null = null;
    setConfirmHandler(
      (request) =>
        new Promise<boolean>((resolve) => {
          if (active || request.signal?.aborted) {
            resolve(false);
            return;
          }
          const onAbort = () => finish(false);
          const finish = (ok: boolean) => {
            if (active !== finish) return;
            active = null;
            request.signal?.removeEventListener('abort', onAbort);
            setPending(null);
            resolve(ok && !request.signal?.aborted);
          };
          active = finish;
          request.signal?.addEventListener('abort', onAbort, { once: true });
          setPending({ request, finish });
        })
    );
    return () => {
      setConfirmHandler(null);
      active?.(false);
    };
  }, []);
  return (
    <Modal
      visible={pending !== null}
      transparent
      animationType="fade"
      onRequestClose={() => pending?.finish(false)}
    >
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: color.backdrop }}>
        <View style={{ maxHeight: '85%', padding: 20, borderRadius: 16, backgroundColor: color.bg }}>
          <Text style={[type.title, { color: color.text }]}>{pending?.request.title}</Text>
          <Text style={[type.body, { color: color.textDim, marginVertical: 12 }]}>
            {pending?.request.message}
          </Text>
          <ScrollView>
            <Text selectable style={[type.mono, { color: color.text }]}>
              {pending?.request.details}
            </Text>
          </ScrollView>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 20 }}>
            <Pressable
              accessibilityRole="button"
              onPress={() => pending?.finish(false)}
              style={{ padding: 14, minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={{ color: color.textDim }}>Deny</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => pending?.finish(true)}
              style={{ padding: 14, minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={{ color: color.accent, fontWeight: '700' }}>Allow</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

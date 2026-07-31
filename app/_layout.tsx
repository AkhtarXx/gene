import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { ServicesProvider } from '../src/ui/ServicesContext';
import { services } from '../src/services';
import { registerConfirmHandler } from '../src/ui/ConfirmBridge';

export default function RootLayout() {
  // Wire tools + confirmation UI once at app start.
  useEffect(() => {
    services.wireTools();
    registerConfirmHandler();
  }, []);

  // Free the LLM/embedding contexts on background to reclaim RAM.
  // TEMPORARILY DISABLED: on emulator the app can momentarily background
  // (e.g. dev-menu, notification shade) and kill generation mid-stream.
  // useEffect(() => {
  //   const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
  //     if (state === 'background') {
  //       services.engine.unload().catch(() => {});
  //       services.embeddings.unload().catch(() => {});
  //     }
  //   });
  //   return () => sub.remove();
  // }, []);

  return (
    <ServicesProvider>
      <Stack>
        <Stack.Screen name="index" options={{ title: 'OpenClaw' }} />
        <Stack.Screen name="models" options={{ title: 'Models' }} />
      </Stack>
    </ServicesProvider>
  );
}

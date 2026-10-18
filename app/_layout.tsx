import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { ServicesProvider } from '../src/ui/ServicesContext';
import { services } from '../src/services';
import { ConfirmationDialog } from '../src/ui/ConfirmationDialog';
import { ThemeProvider, useTheme } from '../src/ui/theme';
import { StatusBar } from 'expo-status-bar';
import { configureReminderPresentation } from '../src/services/tools/NotificationTool';
import { phoneControl, subscribePhoneControlStop } from '../src/services/phone/PhoneControl';

export default function RootLayout() {
  // Wire tools + confirmation UI once at app start.
  useEffect(() => {
    services.wireTools();
    configureReminderPresentation();
    const unsubscribe = subscribePhoneControlStop(() => {
      services.orchestrator.cancel();
      services.actions.cancel();
    });
    return () => {
      unsubscribe();
      void phoneControl.stop().catch(() => {});
    };
  }, []);

  return (
    <ThemeProvider>
      <ServicesProvider>
        <RootNavigator />
        <ConfirmationDialog />
      </ServicesProvider>
    </ThemeProvider>
  );
}

function RootNavigator() {
  const { color, theme } = useTheme();
  return (
    <>
      <StatusBar style={theme === 'light' ? 'dark' : 'light'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: color.bg },
          headerTintColor: color.text,
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: color.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Gene' }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="chat/[id]" options={{ title: 'Chat' }} />
        <Stack.Screen name="models" options={{ title: 'Models' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="actions" options={{ title: 'Phone actions' }} />
        <Stack.Screen name="control" options={{ title: 'Personal phone control' }} />
        <Stack.Screen name="memory" options={{ title: 'Memory' }} />
        <Stack.Screen name="audit" options={{ title: 'Activity Log' }} />
      </Stack>
    </>
  );
}

import { Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Linking from 'expo-linking';
import type { ToolDefinition } from '../../types/tool';

/**
 * LaunchApp tool. WRITE/side-effect: opens another app, navigating the user
 * away. Hard-confirm gated by the Security Gate.
 *
 * Android: expo-intent-launcher.openApplication(packageName) — needs the exact
 * package id (e.g. "com.google.android.gm").
 * iOS: expo-linking.openURL(schemeOrUrl) — only apps exposing a URL scheme are
 * reachable; pass the full scheme URL (e.g. "tel://", "maps://").
 */
export const launchApp: ToolDefinition = {
  name: 'launch_app',
  description:
    'Opens another application on the device. On Android pass the package name; on iOS pass a URL scheme. Requires explicit user confirmation because it switches apps.',
  risk: 'write',
  parameters: [
    {
      name: 'target',
      type: 'string',
      description:
        'Android: package id (e.g. "com.google.android.gm"). iOS: URL scheme (e.g. "maps://").',
      required: true,
    },
  ],
  execute: async (args) => {
    const target = String(args.target ?? '').trim();
    if (!target) {
      return JSON.stringify({ ok: false, error: 'target is required' });
    }
    try {
      if (Platform.OS === 'android') {
        IntentLauncher.openApplication(target);
      } else {
        const ok = await Linking.canOpenURL(target);
        if (!ok) {
          return JSON.stringify({ ok: false, error: `cannot open ${target} on iOS` });
        }
        await Linking.openURL(target);
      }
      return JSON.stringify({ ok: true, launched: target, platform: Platform.OS });
    } catch (e) {
      return JSON.stringify({ ok: false, error: (e as Error).message });
    }
  },
};

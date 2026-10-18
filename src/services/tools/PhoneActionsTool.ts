import { Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import { checkAbort } from '../async';
import type { ToolDefinition } from '../../types/tool';
import { PHONE_RECEIPTS } from '../agent/actionReceipts';

export const SETTINGS_SECTIONS = {
  general: 'android.settings.SETTINGS',
  wifi: 'android.settings.WIFI_SETTINGS',
  bluetooth: 'android.settings.BLUETOOTH_SETTINGS',
  display: 'android.settings.DISPLAY_SETTINGS',
  sound: 'android.settings.SOUND_SETTINGS',
  location: 'android.settings.LOCATION_SOURCE_SETTINGS',
  battery: 'android.settings.BATTERY_SAVER_SETTINGS',
  apps: 'android.settings.APPLICATION_SETTINGS',
} as const;

function phone(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\+?[0-9 ()-]{3,25}$/.test(value)) return null;
  const normalized = value.replace(/[ ()-]/g, '');
  return /^\+?\d{3,15}$/.test(normalized) ? normalized : null;
}
async function open(
  action: string,
  params: IntentLauncher.IntentLauncherParams,
  signal?: AbortSignal
): Promise<string> {
  checkAbort(signal);
  if (Platform.OS !== 'android') return PHONE_RECEIPTS.unsupported;
  try {
    // Resolves when the user returns. This confirms a handoff, never that a
    // message was sent, a call placed, a timer started or a setting changed.
    await IntentLauncher.startActivityAsync(action, params);
    checkAbort(signal);
    return PHONE_RECEIPTS.opened;
  } catch {
    checkAbort(signal);
    return PHONE_RECEIPTS.unavailable;
  }
}

const receipt = { risk: 'write', resultPolicy: 'fixed-phone-receipt' } as const;
export const phoneDial: ToolDefinition = {
  ...receipt,
  name: 'phone_dial',
  description: 'Opens the dialer with a phone number. The user must press Call. Never places a call itself.',
  parameters: [
    { name: 'number', type: 'string', description: 'One phone number, e.g. +923001234567.', required: true },
  ],
  execute: async (args, signal) => {
    const number = phone(args.number);
    return number
      ? open('android.intent.action.DIAL', { data: `tel:${number}` }, signal)
      : PHONE_RECEIPTS.invalid;
  },
};
export const messageDraft: ToolDefinition = {
  ...receipt,
  name: 'message_draft',
  description:
    'Opens an SMS draft for one number. The user reviews and presses Send in their messaging app. Never sends automatically.',
  parameters: [
    { name: 'number', type: 'string', description: 'One recipient phone number.', required: true },
    { name: 'body', type: 'string', description: 'Draft text, up to 2000 characters.', required: true },
  ],
  execute: async (args, signal) => {
    const number = phone(args.number);
    if (!number || typeof args.body !== 'string' || !args.body.trim() || args.body.length > 2000)
      return PHONE_RECEIPTS.invalid;
    return open(
      'android.intent.action.SENDTO',
      { data: `smsto:${number}`, extra: { sms_body: args.body } },
      signal
    );
  },
};
export const openSettings: ToolDefinition = {
  ...receipt,
  name: 'open_settings',
  description:
    'Opens a specific Android settings page for the user to change manually. Does not toggle settings.',
  parameters: [
    {
      name: 'section',
      type: 'string',
      description: 'One of: general, wifi, bluetooth, display, sound, location, battery, apps.',
      required: true,
    },
  ],
  execute: async (args, signal) => {
    const section = args.section;
    if (typeof section !== 'string' || !Object.hasOwn(SETTINGS_SECTIONS, section))
      return PHONE_RECEIPTS.invalid;
    return open(SETTINGS_SECTIONS[section as keyof typeof SETTINGS_SECTIONS], {}, signal);
  },
};
export const timerSet: ToolDefinition = {
  ...receipt,
  name: 'timer_set',
  description:
    'Opens the clock app to review a timer. The user finishes setup there; do not claim a timer was started.',
  parameters: [
    { name: 'seconds', type: 'number', description: 'Whole seconds from 1 to 86400.', required: true },
    {
      name: 'title',
      type: 'string',
      description: 'Short timer label, up to 120 characters.',
      required: true,
    },
  ],
  execute: async (args, signal) => {
    if (
      typeof args.seconds !== 'number' ||
      !Number.isInteger(args.seconds) ||
      args.seconds < 1 ||
      args.seconds > 86400 ||
      typeof args.title !== 'string' ||
      args.title.length > 120
    )
      return PHONE_RECEIPTS.invalid;
    return open(
      'android.intent.action.SET_TIMER',
      {
        extra: {
          'android.intent.extra.alarm.LENGTH': args.seconds,
          'android.intent.extra.alarm.MESSAGE': args.title,
          'android.intent.extra.alarm.SKIP_UI': false,
        },
      },
      signal
    );
  },
};
export const mapsOpen: ToolDefinition = {
  ...receipt,
  name: 'maps_open',
  description:
    'Opens a map search in an installed maps app. That app may use the internet and its own location permissions.',
  parameters: [
    {
      name: 'query',
      type: 'string',
      description: 'Place or address to search, up to 300 characters.',
      required: true,
    },
  ],
  execute: async (args, signal) => {
    if (typeof args.query !== 'string' || !args.query.trim() || args.query.length > 300)
      return PHONE_RECEIPTS.invalid;
    return open(
      'android.intent.action.VIEW',
      { data: `geo:0,0?q=${encodeURIComponent(args.query.trim())}` },
      signal
    );
  },
};

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { checkAbort } from '../async';
import type { ToolDefinition } from '../../types/tool';

const REMINDER_CHANNEL = 'openclaw-reminders';

/** Register presentation without requesting permission or scheduling anything. */
export function configureReminderPresentation(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Local notification tool. Side-effect tier (low blast radius, but can spam),
 * so it is always confirmed and requests OS notification permission.
 */
export const notifySchedule: ToolDefinition = {
  name: 'notify_schedule',
  description:
    'Schedules a local reminder after whole `seconds` from now. Android may delay delivery for battery management. Requires confirmation and notification permission.',
  risk: 'write',
  parameters: [
    { name: 'title', type: 'string', description: 'Notification title.', required: true },
    { name: 'body', type: 'string', description: 'Notification body text.', required: true },
    {
      name: 'seconds',
      type: 'number',
      description: 'Whole seconds from now (min 1, max 86400).',
      required: true,
    },
  ],
  execute: async (args, signal) => {
    checkAbort(signal);
    const seconds = args.seconds;
    if (
      typeof seconds !== 'number' ||
      !Number.isInteger(seconds) ||
      seconds < 1 ||
      seconds > 86400 ||
      typeof args.title !== 'string' ||
      !args.title.trim() ||
      args.title.length > 120 ||
      typeof args.body !== 'string' ||
      !args.body.trim() ||
      args.body.length > 2000
    ) {
      return JSON.stringify({
        ok: false,
        error:
          'Use whole seconds from 1 to 86400, a title up to 120 characters and text up to 2000 characters.',
      });
    }
    if (Platform.OS === 'android') {
      // Android 13+ needs an existing channel before its permission prompt.
      await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
        name: 'Reminders',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      });
      checkAbort(signal);
    }
    const perm = await Notifications.requestPermissionsAsync();
    if (perm.status !== 'granted')
      return JSON.stringify({ ok: false, error: 'notification_permission_denied' });
    checkAbort(signal);

    const id = await Notifications.scheduleNotificationAsync({
      content: { title: args.title, body: args.body, sound: 'default' },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
        ...(Platform.OS === 'android' ? { channelId: REMINDER_CHANNEL } : {}),
      },
    });
    return JSON.stringify({ ok: true, notificationId: id });
  },
};

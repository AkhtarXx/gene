import * as Notifications from 'expo-notifications';
import type { ToolDefinition } from '../../types/tool';

/**
 * Local notification tool. Side-effect tier (low blast radius, but can spam),
 * so it is rate-limited per call and always requests permission first.
 */
export const notifySchedule: ToolDefinition = {
  name: 'notify_schedule',
  description: 'Schedules a local notification after `seconds` from now. Use for reminders the user asks for.',
  risk: 'write',
  parameters: [
    { name: 'title', type: 'string', description: 'Notification title.', required: true },
    { name: 'body', type: 'string', description: 'Notification body text.', required: true },
    { name: 'seconds', type: 'number', description: 'Delay in seconds from now (min 1, max 86400).', required: true },
  ],
  execute: async (args) => {
    const perm = await Notifications.requestPermissionsAsync();
    if (perm.status !== 'granted') return JSON.stringify({ ok: false, error: 'notification_permission_denied' });

    const seconds = Math.min(Math.max(Number(args.seconds ?? 60), 1), 86400);
    const id = await Notifications.scheduleNotificationAsync({
      content: { title: String(args.title), body: String(args.body) },
      trigger: { seconds },
    });
    return JSON.stringify({ ok: true, notificationId: id });
  },
};

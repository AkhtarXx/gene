import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';
import { checkAbort } from '../async';
import type { ToolDefinition } from '../../types/tool';

/**
 * Calendar tools. Read is a privacy `read` tier; create is a `write` tier and
 * therefore requires human confirmation via the Security Gate before executing.
 */

export const calendarListEvents: ToolDefinition = {
  name: 'calendar_list_events',
  description:
    'Lists calendar events from now until `daysAhead` days in the future. Returns a bounded summary (id, title, start/end).',
  risk: 'read',
  parameters: [
    {
      name: 'daysAhead',
      type: 'number',
      description: 'How many days ahead to look (default 7, max 60).',
      required: false,
    },
  ],
  execute: async (args) => {
    const perm = await Calendar.requestCalendarPermissionsAsync();
    if (perm.status !== 'granted') return JSON.stringify({ ok: false, error: 'calendar_permission_denied' });

    const days = Math.min(Math.max(Number(args.daysAhead ?? 7), 1), 60);
    const start = new Date();
    const end = new Date(Date.now() + days * 86400000);
    const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    if (cals.length === 0) return JSON.stringify({ ok: true, events: [] });

    const events = await Calendar.getEventsAsync(
      cals.map((c) => c.id),
      start,
      end
    );
    const summary = events.slice(0, 25).map((e) => ({
      id: e.id,
      title: e.title,
      start: e.startDate,
      end: e.endDate,
    }));
    return JSON.stringify({ ok: true, count: summary.length, events: summary });
  },
};

export const calendarCreateEvent: ToolDefinition = {
  name: 'calendar_create_event',
  description: 'Creates a calendar event with the given title and start/end ISO timestamps.',
  risk: 'write',
  parameters: [
    { name: 'title', type: 'string', description: 'Event title.', required: true },
    { name: 'startDate', type: 'string', description: 'Start time as ISO 8601 string.', required: true },
    { name: 'endDate', type: 'string', description: 'End time as ISO 8601 string.', required: true },
    { name: 'notes', type: 'string', description: 'Optional notes.', required: false },
  ],
  execute: async (args, signal) => {
    const perm = await Calendar.requestCalendarPermissionsAsync();
    checkAbort(signal);
    if (perm.status !== 'granted') return JSON.stringify({ ok: false, error: 'calendar_permission_denied' });

    const startDate = new Date(String(args.startDate));
    const endDate = new Date(String(args.endDate));
    if (
      !Number.isFinite(startDate.getTime()) ||
      !Number.isFinite(endDate.getTime()) ||
      endDate <= startDate
    ) {
      return JSON.stringify({ ok: false, error: 'A valid start time and later end time are required' });
    }
    const cal =
      Platform.OS === 'ios'
        ? await Calendar.getDefaultCalendarAsync()
        : (await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)).find(
            (calendar) => calendar.allowsModifications
          );
    if (!cal) return JSON.stringify({ ok: false, error: 'No writable calendar is available' });
    checkAbort(signal);
    const id = await Calendar.createEventAsync(cal.id, {
      title: String(args.title),
      startDate,
      endDate,
      notes: args.notes ? String(args.notes) : undefined,
    });
    return JSON.stringify({ ok: true, eventId: id });
  },
};

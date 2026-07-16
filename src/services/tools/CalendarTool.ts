import * as Calendar from 'expo-calendar';
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
    { name: 'daysAhead', type: 'number', description: 'How many days ahead to look (default 7, max 60).', required: false },
  ],
  execute: async (args) => {
    const perm = await Calendar.requestCalendarPermissions();
    if (perm.status !== 'granted') return JSON.stringify({ ok: false, error: 'calendar_permission_denied' });

    const days = Math.min(Number(args.daysAhead ?? 7), 60);
    const start = new Date();
    const end = new Date(Date.now() + days * 86400000);
    const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    if (cals.length === 0) return JSON.stringify({ ok: true, events: [] });

    const events = await Calendar.getEventsAsync(
      cals.map((c) => c.id),
      start.toISOString(),
      end.toISOString()
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
  execute: async (args) => {
    const perm = await Calendar.requestCalendarPermissions();
    if (perm.status !== 'granted') return JSON.stringify({ ok: false, error: 'calendar_permission_denied' });

    const cal = await Calendar.getDefaultCalendarAsync();
    const id = await Calendar.createEventAsync(cal.id, {
      title: String(args.title),
      startDate: new Date(String(args.startDate)),
      endDate: new Date(String(args.endDate)),
      notes: args.notes ? String(args.notes) : undefined,
    });
    return JSON.stringify({ ok: true, eventId: id });
  },
};

import { Platform } from 'react-native';
import { initialize, requestPermission, readRecords } from 'react-native-health-connect';
import type { ToolDefinition } from '../../types/tool';
import { checkAbort } from '../async';

/**
 * Health read tool (Android, Health Connect). Reads aggregate steps and recent
 * heart-rate samples for a time range. SENSITIVE READ: special-category health
 * data. Confirm-gated and returned only as short aggregated numbers.
 *
 * iOS: HealthKit (react-native-health) requires a separate native setup +
 * HealthKit entitlement; this build ships the Android path. On iOS the tool
 * returns a clear "not configured" message rather than fabricating data.
 */
export const healthRead: ToolDefinition = {
  name: 'health_read',
  description:
    'Reads on-device health data (steps, heart rate) for a recent time window using Health Connect. Privacy-sensitive; only use when the user explicitly asks about their health metrics.',
  risk: 'write',
  parameters: [
    {
      name: 'hours',
      type: 'number',
      description: 'Look-back window in hours (default 24, max 168).',
      required: false,
    },
  ],
  execute: async (args, signal) => {
    if (Platform.OS !== 'android') {
      return JSON.stringify({
        ok: false,
        error: 'iOS HealthKit not configured in this build. Android Health Connect only.',
      });
    }
    const hours = Math.min(Math.max(Number(args.hours ?? 24), 1), 168);
    const end = new Date();
    const start = new Date(end.getTime() - hours * 3600_000);

    try {
      await initialize();
      checkAbort(signal);
      await requestPermission([
        { accessType: 'read', recordType: 'Steps' },
        { accessType: 'read', recordType: 'HeartRate' },
      ]);
      checkAbort(signal);

      const stepsRes = await readRecords('Steps', {
        timeRangeFilter: {
          operator: 'between',
          startTime: start.toISOString(),
          endTime: end.toISOString(),
        },
      });
      const stepTotal = stepsRes.records.reduce((sum, r) => sum + ((r as { count?: number }).count ?? 0), 0);

      const hrRes = await readRecords('HeartRate', {
        timeRangeFilter: {
          operator: 'between',
          startTime: start.toISOString(),
          endTime: end.toISOString(),
        },
      });
      const beats = hrRes.records
        .map((r) => (r as { samples?: { beatsPerMinute?: number }[] }).samples?.[0]?.beatsPerMinute ?? 0)
        .filter(Boolean);
      const hrAvg = beats.length ? Math.round(beats.reduce((a, b) => a + b, 0) / beats.length) : null;

      return JSON.stringify({
        ok: true,
        windowHours: hours,
        steps: Math.round(stepTotal),
        heartRateAvgBpm: hrAvg,
      });
    } catch (e) {
      return JSON.stringify({ ok: false, error: (e as Error).message });
    }
  },
};

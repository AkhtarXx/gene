const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./helpers.cjs');
function setup(permission = async () => ({ status: 'granted' })) {
  const calls = [];
  let handler;
  const tool = loadSource('src/services/tools/NotificationTool.ts', {
    'react-native': { Platform: { OS: 'android' } },
    'expo-notifications': {
      AndroidImportance: { HIGH: 4 },
      AndroidNotificationVisibility: { PRIVATE: 0 },
      SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
      setNotificationHandler: (value) => {
        handler = value;
      },
      setNotificationChannelAsync: async (...args) => {
        calls.push(['channel', ...args]);
      },
      requestPermissionsAsync: async () => {
        calls.push(['permission']);
        return permission();
      },
      scheduleNotificationAsync: async (request) => {
        calls.push(['schedule', request]);
        return 'qa-notification';
      },
    },
  });
  return { ...tool, calls, handler: () => handler };
}
const args = { seconds: 10, title: 'QA reminder', body: 'Test only' };
test('Android creates the reminder channel before requesting notification permission', async () => {
  const s = setup();
  const result = JSON.parse(await s.notifySchedule.execute(args));
  assert.equal(result.ok, true);
  assert.deepEqual(
    s.calls.map((call) => call[0]),
    ['channel', 'permission', 'schedule']
  );
  assert.equal(s.calls[2][1].trigger.seconds, 10);
  assert.equal(s.calls[2][1].trigger.channelId, s.calls[0][1]);
});
test('invalid reminder durations never change the confirmed time or request OS permission', async () => {
  const s = setup();
  for (const seconds of [0, -1, 86401, 1.5, NaN]) {
    assert.equal(JSON.parse(await s.notifySchedule.execute({ ...args, seconds })).ok, false);
  }
  assert.equal(s.calls.length, 0);
});
test('permission denial does not schedule a notification', async () => {
  const s = setup(async () => ({ status: 'denied' }));
  assert.equal(JSON.parse(await s.notifySchedule.execute(args)).ok, false);
  assert.equal(
    s.calls.some((call) => call[0] === 'schedule'),
    false
  );
});
test('cancellation while OS permission is open prevents scheduling after approval', async () => {
  const controller = new AbortController();
  const s = setup(async () => {
    controller.abort();
    return { status: 'granted' };
  });
  await assert.rejects(s.notifySchedule.execute(args, controller.signal), /cancelled/);
  assert.equal(
    s.calls.some((call) => call[0] === 'schedule'),
    false
  );
});
test('foreground reminders have an explicit presentation handler', async () => {
  const s = setup();
  s.configureReminderPresentation();
  const behavior = await s.handler().handleNotification();
  assert.equal(behavior.shouldShowBanner, true);
  assert.equal(behavior.shouldShowList, true);
});

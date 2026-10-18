const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource, deferred, tick } = require('./helpers.cjs');
const { ToolRegistry } = loadSource('src/services/agent/ToolRegistry.ts');
const { SecurityGate } = loadSource('src/services/security/SecurityGate.ts');
const { AgentOrchestrator } = loadSource('src/services/agent/AgentOrchestrator.ts');

function setup(execute, confirm = async () => true) {
  const registry = new ToolRegistry();
  registry.register({
    name: 'handoff',
    risk: 'write',
    description: 'Phone handoff',
    parameters: [],
    execute,
  });
  const { UserActionService } = loadSource('src/services/agent/UserActionService.ts', {
    '../../ui/confirmBridge': { requestConfirm: confirm },
  });
  let agent;
  const service = new UserActionService(registry, new SecurityGate(), () => agent?.busy ?? false);
  agent = new AgentOrchestrator(
    { isLoaded: () => true, clearCache: async () => {} },
    registry,
    new SecurityGate(),
    {},
    undefined,
    service
  );
  return { service, agent };
}
const prompt = { title: 'Allow action?', message: 'Review' };

test('cancel retains the shared lock until pending native work drains', async () => {
  const native = deferred();
  let started = 0;
  const s = setup(() => {
    started++;
    return native.promise;
  });
  const work = s.service.run('handoff', {}, prompt);
  await tick();
  assert.equal(started, 1);
  s.service.cancel();
  await assert.rejects(work, /cancelled/);
  assert.equal(s.service.busy, true);
  assert.equal(s.agent.busy, true);
  await assert.rejects(s.service.run('handoff', {}, prompt), /Wait/);
  await assert.rejects(s.agent.run('Hi'), /progress|busy|finish/i);
  native.resolve('{"ok":true}');
  await tick();
  assert.equal(s.service.busy, false);
  assert.equal(s.agent.busy, false);
});
test('denying or cancelling approval never dispatches a native handoff', async () => {
  let started = 0;
  const denied = setup(
    async () => {
      started++;
      return '{}';
    },
    async () => false
  );
  assert.equal(await denied.service.run('handoff', {}, prompt), null);
  const approval = deferred();
  const s = setup(
    async () => {
      started++;
      return '{}';
    },
    () => approval.promise
  );
  const work = s.service.run('handoff', {}, prompt);
  s.service.cancel();
  await assert.rejects(work, /cancelled/);
  approval.resolve(true);
  await tick();
  assert.equal(started, 0);
  assert.equal(s.service.busy, false);
});
test('manual execution uses the confirmed snapshot even if caller changes the form', async () => {
  const approval = deferred();
  const seen = [];
  const s = setup(
    async (args) => {
      seen.push(args);
      return '{}';
    },
    () => approval.promise
  );
  const args = { number: '5550100' };
  const work = s.service.run('handoff', args, prompt);
  args.number = '5559999';
  approval.resolve(true);
  await work;
  assert.equal(seen[0].number, '5550100');
  assert.equal(Object.isFrozen(seen[0]), true);
});

test('an idle tainted chat does not taint a fresh user-filled manual form', async () => {
  let started = 0;
  const s = setup(async () => {
    started++;
    return '{"ok":true}';
  });
  await s.agent.loadHistory([{ user: 'Read a file', assistant: 'Untrusted data', tainted: true }]);
  assert.equal(s.agent.hasUntrustedContext, true);
  await s.service.run('handoff', { number: '5550100' }, prompt);
  assert.equal(started, 1);
  assert.equal(s.agent.hasUntrustedContext, true);
});

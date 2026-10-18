const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource, deferred, tick } = require('./helpers.cjs');
const { SecurityGate } = loadSource('src/services/security/SecurityGate.ts');
function setup(overrides = {}) {
  const calls = [],
    audit = [];
  const native = {
    read: async () => '{"screen":"token","nodes":[]}',
    launch: async (...args) => {
      calls.push(args);
      return '{"status":"app_opened_verify_screen"}';
    },
    act: async (...args) => {
      calls.push(args);
      return '{"status":"action_dispatched_verify_screen"}';
    },
    cancel: async () => {
      calls.push('cancel');
    },
    ...overrides,
  };
  const { createDeviceControlTools } = loadSource('src/services/tools/DeviceControlTool.ts', {
    'react-native': { Platform: { OS: 'android' }, NativeModules: { PhoneControl: native } },
  });
  const tools = createDeviceControlTools((tool, allowed) => audit.push({ name: tool.name, allowed }));
  return { tools, read: tools[0], open: tools[1], act: tools[2], calls, audit };
}
const args = { screen: 'token', node: '0.1', action: 'type', text: 'Hello & goodbye\nFull draft' };
test('native review delegates only exact registered device writes and does not clear taint', async () => {
  const s = setup();
  const gate = new SecurityGate();
  let prompts = 0;
  const options = {
    taintedArgs: true,
    confirm: async () => {
      prompts++;
      return true;
    },
  };
  assert.equal((await gate.authorize(s.act, args, options)).requiresConfirmation, true);
  assert.equal(prompts, 0);
  assert.equal(gate.getAudit().length, 0); // Not falsely approved before native decision.
  gate.recordNativeReview(s.act, false);
  assert.equal(gate.getAudit()[0].allowed, false);
  for (const tool of [
    { ...s.act, name: 'file_write' },
    { ...s.act, confirmationPolicy: undefined },
    { ...s.act, risk: 'destructive' },
  ])
    assert.equal((await gate.authorize(tool, args, options)).allowed, false);
});
test('device adapter passes exact draft and native outcome to audit', async () => {
  const s = setup();
  await s.act.execute(args);
  assert.deepEqual(s.calls, [['token', '0.1', 'type', args.text]]);
  assert.deepEqual(s.audit, [{ name: 'device_act', allowed: true }]);
  const denied = setup({ act: async () => '{"status":"denied"}' });
  await denied.act.execute(args);
  assert.equal(denied.audit[0].allowed, false);
});
test('cancellation closes native approval, audits denial and waits for native settlement', async () => {
  const work = deferred();
  const s = setup({ act: () => work.promise });
  const controller = new AbortController();
  const pending = s.act.execute(args, controller.signal);
  controller.abort();
  await tick();
  assert.deepEqual(s.calls, ['cancel']);
  work.resolve('{"status":"cancelled"}');
  await assert.rejects(pending, /cancelled/);
  assert.equal(s.audit[0].allowed, false);
});
test('device tools reject invented action methods and malformed IDs before native calls', async () => {
  const s = setup();
  for (const change of [
    { action: 'send_sms' },
    { action: 'tap_coordinate' },
    { node: '../0' },
    { text: 'x'.repeat(2001) },
  ]) {
    await s.act.execute({ ...args, ...change });
  }
  await s.open.execute({ package: 'intent://malicious' });
  assert.equal(s.calls.length, 0);
  assert.equal(s.audit.length, 5);
  assert.equal(
    s.audit.every((entry) => entry.allowed === false),
    true
  );
});
test('a native effect stays audited as approved when cancellation races its JS result', async () => {
  const controller = new AbortController();
  const s = setup({
    act: async () => {
      controller.abort();
      return '{"status":"action_dispatched_verify_screen"}';
    },
  });
  await assert.rejects(s.act.execute(args, controller.signal), /cancelled/);
  assert.equal(s.audit[0].allowed, true);
});
test('app launch requested without a verified foreground is audited as a dispatch', async () => {
  const s = setup({ launch: async () => '{"status":"app_open_requested_verify_screen"}' });
  assert.equal(
    await s.open.execute({ package: 'com.android.settings' }),
    '{"status":"app_open_requested_verify_screen"}'
  );
  assert.equal(s.audit[0].allowed, true);
});
test('agent can read then request native reviewed action while ordinary writes remain blocked', async () => {
  const { AgentOrchestrator } = loadSource('src/services/agent/AgentOrchestrator.ts');
  const { ToolRegistry } = loadSource('src/services/agent/ToolRegistry.ts');
  const s = setup();
  const registry = new ToolRegistry();
  registry.registerAll(s.tools);
  let ordinaryWrites = 0;
  registry.register({
    name: 'file_write',
    risk: 'write',
    parameters: [],
    description: '',
    execute: async () => {
      ordinaryWrites++;
      return '{}';
    },
  });
  const responses = ['device_read_screen', 'device_act', 'file_write', null];
  const engine = {
    isLoaded: () => true,
    stop: async () => {},
    clearCache: async () => {},
    complete: async () => {
      const name = responses.shift();
      return {
        text: name ? '' : 'Finished',
        toolCalls: name ? [{ name, arguments: name === 'device_act' ? args : {} }] : [],
      };
    },
  };
  const agent = new AgentOrchestrator(engine, registry, new SecurityGate());
  await agent.run('Type my draft');
  assert.equal(s.calls.length, 1);
  assert.equal(ordinaryWrites, 0);
  assert.equal(agent.hasUntrustedContext, true);
});
test('dedicated control chat keeps complete tool exchanges and can continue a longer task', async () => {
  const { AgentOrchestrator } = loadSource('src/services/agent/AgentOrchestrator.ts');
  const { ToolRegistry } = loadSource('src/services/agent/ToolRegistry.ts');
  const s = setup();
  const registry = new ToolRegistry();
  registry.registerAll(s.tools);
  let steps = 0;
  const engine = {
    isLoaded: () => true,
    stop: async () => {},
    complete: async ({ messages }) => {
      assert.equal(messages[1].content, 'Find the requested contact');
      assert.ok(messages.length <= 4);
      for (let i = 0; i < messages.length; i++) {
        if (messages[i].role === 'tool')
          assert.equal(messages[i - 1].tool_calls[0].id, messages[i].tool_call_id);
      }
      return {
        text: steps === 20 ? 'Finished' : '',
        toolCalls: steps++ < 20 ? [{ id: 'read-' + steps, name: 'device_read_screen', arguments: {} }] : [],
      };
    },
  };
  const agent = new AgentOrchestrator(engine, registry, new SecurityGate());
  assert.equal(
    await agent.run('Find the requested contact', {
      allowedTools: s.tools.map((tool) => tool.name),
      memoryEnabled: false,
    }),
    'Finished'
  );
  assert.equal(steps, 21);
});

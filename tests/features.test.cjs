const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./helpers.cjs');
const { AgentOrchestrator } = loadSource('src/services/agent/AgentOrchestrator.ts');
const { ToolRegistry } = loadSource('src/services/agent/ToolRegistry.ts');
const { SecurityGate } = loadSource('src/services/security/SecurityGate.ts');
const { timeTool } = loadSource('src/services/tools/TimeTool.ts');
const { AgentOrchestrator: ConfirmedAgent } = loadSource('src/services/agent/AgentOrchestrator.ts', {
  '../../ui/confirmBridge': { requestConfirm: async () => true },
});

const final = (text = 'Done') => ({ text, toolCalls: [] });
const call = (name, args = {}) => ({ text: '', toolCalls: [{ id: 'c1', name, arguments: args }] });

function setup(responses, config = {}, memory, Agent = AgentOrchestrator) {
  const calls = [];
  let writes = 0;
  let reads = 0;
  const engine = {
    isLoaded: () => true,
    clearCache: async () => {},
    stop: async () => {},
    complete: async (opts) => {
      calls.push(structuredClone({ messages: opts.messages, tools: opts.tools.map((t) => t.name) }));
      const result = responses.shift();
      return typeof result === 'function' ? result(opts) : result;
    },
  };
  const registry = new ToolRegistry();
  registry.register({
    name: 'write',
    risk: 'write',
    description: 'Write',
    parameters: [{ name: 'path', type: 'string', required: true }],
    execute: async () => {
      writes++;
      return '{"ok":true}';
    },
  });
  registry.register({
    name: 'read',
    risk: 'read',
    description: 'Read',
    parameters: [],
    execute: async () => {
      reads++;
      return 'data';
    },
  });
  const agent = new Agent(engine, registry, new SecurityGate(), config, memory);
  return { agent, registry, calls, writes: () => writes, reads: () => reads };
}

test('per-chat allowlist filters the tool catalog the model sees', async () => {
  const s = setup([final()]);
  await s.agent.run('Hi', { allowedTools: ['read'] });
  assert.deepEqual(s.calls[0].tools, ['read']);
});

test('allowlist is enforced at dispatch — a hidden tool name is rejected', async () => {
  const s = setup([call('write', { path: 'x' }), final()], {}, undefined, ConfirmedAgent);
  await s.agent.run('Go', { allowedTools: ['read'] });
  assert.equal(s.writes(), 0);
});

test('per-chat system prompt overrides the default', async () => {
  const s = setup([final()]);
  await s.agent.run('Hi', { systemPrompt: 'Be terse.' });
  assert.equal(s.calls[0].messages[0].content, 'Be terse.');
});

test('memoryEnabled=false skips retrieval and saving entirely', async () => {
  let queried = 0;
  let saved = 0;
  const memory = {
    isReady: () => true,
    query: async () => {
      queried++;
      return [];
    },
    addDocument: async () => {
      saved++;
    },
  };
  const s = setup([final()], {}, memory);
  await s.agent.run('Hi', { memoryEnabled: false });
  assert.equal(queried, 0);
  assert.equal(saved, 0);
});

test('final answer reports generation stats', async () => {
  const stats = [];
  const s = setup([
    { text: 'Done', toolCalls: [], timings: { tokensPerSecond: 12.5, tokens: 40, ms: 3200 } },
  ]);
  await s.agent.run('Hi', { onStats: (value) => stats.push(value) });
  assert.equal(stats.length, 1);
  assert.equal(stats[0].tokensPerSecond, 12.5);
});

test('loadHistory restores context and rewind drops the last exchange', async () => {
  const s = setup([final('Third')]);
  await s.agent.loadHistory([{ user: 'First', assistant: 'Second' }]);
  await s.agent.run('Third message');
  const contents = s.calls[0].messages.map((m) => m.content);
  assert.deepEqual(contents.slice(1, 5), ['First', 'Second', 'Third message']);
  s.agent.rewind();
  // History is per-agent; rewind removed the last pair.
  assert.equal(s.calls.length, 1);
});

test('time tool returns parseable ISO time and a sane epoch', async () => {
  const before = Date.now();
  const result = JSON.parse(await timeTool.execute({}));
  assert.ok(!Number.isNaN(new Date(result.iso).getTime()));
  assert.ok(result.epoch >= before - 1000 && result.epoch <= Date.now() + 1000);
});

const { PHONE_RECEIPTS } = loadSource('src/services/agent/actionReceipts.ts');
function registerHandoff(s, result = PHONE_RECEIPTS.opened, risk = 'write') {
  let opened = 0;
  s.registry.register({
    name: 'handoff',
    description: 'Open a reviewed phone action',
    risk,
    resultPolicy: 'fixed-phone-receipt',
    parameters: [],
    execute: async () => {
      opened++;
      return result;
    },
  });
  return () => opened;
}
test('consecutive confirmed outbound handoffs can complete in one run', async () => {
  const s = setup([call('handoff'), call('handoff'), final()], {}, undefined, ConfirmedAgent);
  const opened = registerHandoff(s);
  await s.agent.run('Open settings then prepare a dialer.');
  assert.equal(opened(), 2);
  assert.equal(s.agent.hasUntrustedContext, false);
});
test('phone receipts never clear taint from a preceding native read', async () => {
  const s = setup([call('read'), call('handoff'), final()], {}, undefined, ConfirmedAgent);
  const opened = registerHandoff(s);
  await s.agent.run('Read then open.');
  assert.equal(opened(), 0);
  assert.equal(s.agent.hasUntrustedContext, true);
});
test('a receipt with external text taints context and blocks subsequent handoffs', async () => {
  const s = setup([call('handoff'), call('handoff'), final()], {}, undefined, ConfirmedAgent);
  const opened = registerHandoff(s, '{"ok":true,"status":"opened_for_user","text":"untrusted"}');
  await s.agent.run('Open twice.');
  assert.equal(opened(), 1);
  assert.equal(s.agent.hasUntrustedContext, true);
});
test('read tools cannot opt out of taint by returning a phone receipt', async () => {
  const s = setup([call('handoff'), call('write', { path: 'x' }), final()], {}, undefined, ConfirmedAgent);
  registerHandoff(s, PHONE_RECEIPTS.opened, 'read');
  await s.agent.run('Read then write.');
  assert.equal(s.writes(), 0);
  assert.equal(s.agent.hasUntrustedContext, true);
});

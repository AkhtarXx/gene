const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource, deferred, tick } = require('./helpers.cjs');
const { conversationTurns, parseMessageMeta, parseToolPreferences } = loadSource(
  'src/services/storage/conversation.ts'
);
const { ToolRegistry } = loadSource('src/services/agent/ToolRegistry.ts');
const { SecurityGate } = loadSource('src/services/security/SecurityGate.ts');
const { AgentOrchestrator } = loadSource('src/services/agent/AgentOrchestrator.ts', {
  '../../ui/confirmBridge': { requestConfirm: async () => true },
});
function assistant(meta, content = 'Stored reply') {
  return { role: 'assistant', content, meta };
}
const user = { role: 'user', content: 'Original request' };
const final = { text: 'Done', toolCalls: [] };
const write = { text: '', toolCalls: [{ name: 'write', arguments: {} }] };
test('saved tool restrictions never silently enable newly installed capabilities', () => {
  assert.deepEqual(
    parseToolPreferences('{"read":true,"write":false,"unknown":true}', ['read', 'write', 'phone_dial']),
    { read: true, write: false, phone_dial: false }
  );
  for (const value of ['', '{bad', 'null', '[]', '{"read":"true"}']) {
    assert.deepEqual(parseToolPreferences(value, ['read']), { read: false });
  }
  assert.deepEqual(parseToolPreferences(null, ['read']), { read: true });
});
function setup(responses, clearCache = async () => {}) {
  let writes = 0;
  const tools = new ToolRegistry();
  tools.register({
    name: 'write',
    risk: 'write',
    parameters: [],
    execute: async () => {
      writes++;
      return 'ok';
    },
  });
  tools.register({ name: 'read', risk: 'read', parameters: [], execute: async () => 'Untrusted data' });
  const engine = {
    clearCache,
    isLoaded: () => true,
    stop: async () => {},
    complete: async () => responses.shift(),
  };
  return { agent: new AgentOrchestrator(engine, tools, new SecurityGate()), tools, writes: () => writes };
}

test('legacy, malformed and interrupted saved replies restore conservatively', () => {
  for (const meta of [null, 'broken JSON', 'null', '[]', '{}', '{"tainted":true}']) {
    assert.equal(conversationTurns([user, assistant(meta)])[0].tainted, true);
  }
  assert.equal(conversationTurns([user, assistant('{"tainted":false}')])[0].tainted, false);
  assert.deepEqual(parseMessageMeta('{"activities":[null,{}, {"name":"read","result":"ok"}]}').activities, [
    { name: 'read', result: 'ok' },
  ]);
});

test('reopened untrusted conversation cannot authorize device writes', async () => {
  const s = setup([write, final]);
  await s.agent.loadHistory(conversationTurns([user, assistant('{"tainted":true}')]));
  await s.agent.run('Continue');
  assert.equal(s.writes(), 0);
});

test('reopened explicitly trusted conversation can still use confirmed actions', async () => {
  const s = setup([write, final]);
  await s.agent.loadHistory(conversationTurns([user, assistant('{"tainted":false}')]));
  await s.agent.run('Write');
  assert.equal(s.writes(), 1);
});

test('cancel during a native read preserves provenance before the result settles', async () => {
  const pending = deferred();
  const snapshots = [];
  const s = setup([{ text: '', toolCalls: [{ name: 'read', arguments: {} }] }]);
  s.tools.get('read').execute = () => pending.promise;
  const run = s.agent.run('Read', { onProvenance: (value) => snapshots.push(value) });
  await tick();
  s.agent.cancel();
  await run;
  assert.equal(s.agent.hasUntrustedContext, true);
  assert.deepEqual(snapshots, [true]);
  pending.resolve('Poisoned instructions');
  await tick();
  assert.equal(s.agent.busy, false);
});

test('history replacement holds exclusive access until cache and provenance are restored', async () => {
  const cache = deferred();
  const s = setup([], () => cache.promise);
  const restore = s.agent.loadHistory([{ user: 'Read', assistant: 'Untrusted', tainted: true }]);
  await assert.rejects(s.agent.run('Race'), /previous operation/);
  const controller = new AbortController();
  const idle = s.agent.waitForIdle(controller.signal);
  cache.resolve();
  await restore;
  await idle;
  assert.equal(s.agent.hasUntrustedContext, true);
});

test('retrying a failed second turn restores the successful first turn', async () => {
  const rows = [
    user,
    assistant('{"tainted":false}', 'Keep this answer'),
    { ...user, content: 'Failed request' },
    assistant('{"error":true,"tainted":true}', 'Failed'),
  ];
  const trimmed = rows.slice(0, 2);
  const contexts = [];
  const s = setup([final]);
  s.agent.engine.complete = async (opts) => {
    contexts.push(opts.messages);
    return final;
  };
  await s.agent.loadHistory(conversationTurns(trimmed));
  await s.agent.run('Retry');
  assert.equal(contexts[0][2].content, 'Keep this answer');
});

// Real SQLite validates transaction rollback, timestamp ties and deletion scope.
let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {
  /* Node 20 has no built-in SQLite. */
}
function storage() {
  let connection;
  const { AppStore } = loadSource('src/services/storage/AppStore.ts', {
    '@op-engineering/op-sqlite': {
      open: () => {
        connection = new DatabaseSync(':memory:');
        const db = {
          execute: async (query, params = []) => {
            const stmt = connection.prepare(query);
            if (stmt.columns().length) return { rows: stmt.all(...params) };
            const result = stmt.run(...params);
            return { rows: [], insertId: Number(result.lastInsertRowid) };
          },
          transaction: async (run) => {
            connection.exec('BEGIN');
            try {
              await run(db);
              connection.exec('COMMIT');
            } catch (error) {
              connection.exec('ROLLBACK');
              throw error;
            }
          },
          closeAsync: async () => connection.close(),
        };
        return db;
      },
    },
  });
  return new AppStore();
}

test(
  'exchange persists user and conservative assistant together; retry deletion keeps earlier rows',
  { skip: !DatabaseSync },
  async () => {
    const store = storage();
    await store.createConversation('chat', 'Chat');
    await store.beginExchange('chat', { id: 'u1', content: 'First' }, 'a1');
    await store.beginExchange('chat', { id: 'u2', content: 'Second' }, 'a2');
    let rows = await store.listMessages('chat');
    assert.deepEqual(
      rows.map((row) => row.id),
      ['u1', 'a1', 'u2', 'a2']
    );
    assert.equal(parseMessageMeta(rows[1].meta).tainted, true);
    await store.deleteMessagesAfter('chat', 'u2');
    rows = await store.listMessages('chat');
    assert.deepEqual(
      rows.map((row) => row.id),
      ['u1', 'a1']
    );
    await store.close();
  }
);

test('failed placeholder insert rolls back the paired user message', { skip: !DatabaseSync }, async () => {
  const store = storage();
  await store.createConversation('chat', 'Chat');
  await store.beginExchange('chat', { id: 'u1', content: 'First' }, 'a1');
  await assert.rejects(store.beginExchange('chat', { id: 'u2', content: 'Second' }, 'a1'));
  assert.deepEqual(
    (await store.listMessages('chat')).map((row) => row.id),
    ['u1', 'a1']
  );
  await store.close();
});

test(
  'dedicated phone conversation is restricted in its first committed row',
  { skip: !DatabaseSync },
  async () => {
    const store = storage();
    const initial = {
      system_prompt: 'Personal phone assistant',
      tools_json: '{"device_act":true,"file_write":false}',
      memory_enabled: false,
    };
    await store.createConversation('phone', 'Phone assistant', initial);
    const row = await store.getConversation('phone');
    assert.equal(row.system_prompt, initial.system_prompt);
    assert.equal(row.tools_json, initial.tools_json);
    assert.equal(row.memory_enabled, 0);
    await store.close();
  }
);

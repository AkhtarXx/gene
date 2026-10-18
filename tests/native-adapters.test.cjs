const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource, deferred, tick } = require('./helpers.cjs');

function engineWith(context, ensureModel = async (spec) => spec.id) {
  let inits = 0;
  const { LLMEngineService } = loadSource('src/services/llm/LLMEngineService.ts', {
    'react-native': { Platform: { OS: 'android' } },
    'llama.rn': {
      initLlama: async () => {
        inits++;
        return context;
      },
      getBackendDevicesInfo: async () => [],
    },
    './modelDownloader': { ensureModel },
  });
  return { engine: new LLMEngineService(), inits: () => inits };
}
const model = { id: 'model-a' };

test('same-model loading shares work; another model gets an explicit rejection', async () => {
  const path = deferred();
  const s = engineWith({}, () => path.promise);
  const first = s.engine.loadModel(model);
  const second = s.engine.loadModel(model);
  await assert.rejects(s.engine.loadModel({ id: 'model-b' }), /Another model is loading/);
  path.resolve('model-a');
  await Promise.all([first, second]);
  assert.equal(s.inits(), 1);
  assert.equal(s.engine.loadedModelId, 'model-a');
});

test('native release is used and contexts cannot unload while generating', async () => {
  const generation = deferred();
  let released = 0;
  const s = engineWith({
    completion: () => generation.promise,
    release: async () => {
      released++;
    },
  });
  await s.engine.loadModel(model);
  const result = s.engine.complete({ messages: [] });
  await assert.rejects(s.engine.unload(), /Wait for model operations/);
  await assert.rejects(s.engine.loadModel({ id: 'model-b' }), /Stop generation/);
  generation.resolve({ content: 'Done' });
  await result;
  await s.engine.unload();
  assert.equal(released, 1);
  assert.equal(s.engine.loadedModelId, null);
});

test('abort accepts a void-returning native stop and releases the generation lock', async () => {
  const generation = deferred();
  let stopped = 0;
  const s = engineWith({
    completion: () => generation.promise,
    stopCompletion: () => {
      stopped++;
      generation.resolve({ content: '' });
    },
  });
  await s.engine.loadModel(model);
  const controller = new AbortController();
  const result = s.engine.complete({ messages: [], signal: controller.signal });
  const rejected = assert.rejects(result, /cancelled/i);
  controller.abort();
  await rejected;
  assert.equal(stopped, 1);
  assert.equal(s.engine.busy, false);
  await s.engine.complete({ messages: [] });
});

test('streamed bubbles use parsed deltas and never raw tool/reasoning syntax', async () => {
  const chunks = [];
  const s = engineWith({
    completion: async (_opts, onToken) => {
      onToken({ token: '<think>secret</think>' });
      onToken({ token: '<tool_call>{"name":"write"}</tool_call>', content: '' });
      onToken({ content: 'Hello' });
      onToken({ content: 'Hello world' });
      return { content: 'Hello world', tool_calls: [] };
    },
  });
  await s.engine.loadModel(model);
  const result = await s.engine.complete({ messages: [], onToken: (token) => chunks.push(token) });
  assert.deepEqual(chunks, ['Hello', ' world']);
  assert.equal(result.text, 'Hello world');
});

function recorderWith(permission = async () => 'granted') {
  let starts = 0,
    stops = 0,
    removed = 0;
  let onData;
  const { VoiceRecorder } = loadSource('src/services/speech/VoiceRecorder.ts', {
    'react-native': {
      Platform: { OS: 'android' },
      PermissionsAndroid: {
        request: permission,
        PERMISSIONS: { RECORD_AUDIO: 'microphone' },
        RESULTS: { GRANTED: 'granted' },
      },
    },
    '@fugood/react-native-audio-pcm-stream': {
      init: () => {},
      start: () => {
        starts++;
      },
      stop: () => {
        stops++;
      },
      on: (_event, callback) => {
        onData = callback;
        return {
          remove: () => {
            removed++;
          },
        };
      },
    },
  });
  return {
    recorder: new VoiceRecorder(),
    counts: () => ({ starts, stops, removed }),
    emit: (buffer) => onData(buffer.toString('base64')),
  };
}

test('leaving while microphone permission is pending never starts recording', async () => {
  const permission = deferred();
  const s = recorderWith(() => permission.promise);
  const start = s.recorder.start();
  const stop = s.recorder.stop();
  permission.resolve('granted');
  await Promise.all([start, stop]);
  assert.equal(s.counts().starts, 0);
});

test('recording decodes PCM correctly and stops/releases subscription once', async () => {
  const s = recorderWith();
  await s.recorder.start();
  const buffer = Buffer.alloc(6);
  buffer.writeInt16LE(-32768, 0);
  buffer.writeInt16LE(0, 2);
  buffer.writeInt16LE(16384, 4);
  s.emit(buffer);
  const [samples, duplicateStop] = await Promise.all([s.recorder.stop(), s.recorder.stop()]);
  assert.deepEqual([...samples], [-1, 0, 0.5]);
  assert.equal(duplicateStop.length, 3);
  assert.deepEqual(s.counts(), { starts: 1, stops: 1, removed: 1 });
});

test('audio buffering is bounded to 60 seconds even if native emits too much data', async () => {
  const s = recorderWith();
  await s.recorder.start();
  s.emit(Buffer.alloc(2_000_000));
  s.emit(Buffer.alloc(100));
  const samples = await s.recorder.stop();
  assert.equal(samples.length, 16_000 * 60);
});

test('concurrent download and engine load cannot hash/delete a partial model', async (t) => {
  const download = deferred();
  let transfers = 0,
    hashes = 0;
  const oldFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => [{ path: 'model.gguf', lfs: { oid: 'expected', size: 10 } }],
  });
  t.after(() => {
    global.fetch = oldFetch;
  });
  const { ensureModel, downloadModelWithProgress, getDownloadSnapshot } = loadSource(
    'src/services/llm/modelDownloader.ts',
    {
      'expo-file-system': {
        documentDirectory: 'file:///private/',
        makeDirectoryAsync: async () => {},
        getInfoAsync: async () => ({ exists: false }),
        createDownloadResumable: (_url, dest) => ({
          downloadAsync: async () => {
            transfers++;
            await download.promise;
            return { status: 200, uri: dest };
          },
        }),
        deleteAsync: async () => {
          throw new Error('A partial model must not be deleted');
        },
      },
      '@preeternal/react-native-file-hash': {
        fileHash: async () => {
          hashes++;
          return 'expected';
        },
      },
    }
  );
  const spec = {
    id: 'model',
    sha256: 'expected',
    sizeBytes: 10,
    repo: 'repo',
    filename: 'model.gguf',
    url: 'https://example.com/model',
  };
  const ui = downloadModelWithProgress(spec);
  const engine = ensureModel(spec);
  await tick();
  assert.equal(getDownloadSnapshot(), 'model');
  assert.equal(transfers, 1);
  assert.equal(hashes, 0);
  download.resolve();
  assert.deepEqual(await Promise.all([ui, engine]), [
    'file:///private/models/model.gguf',
    'file:///private/models/model.gguf',
  ]);
  assert.equal(hashes, 1);
  assert.equal(getDownloadSnapshot(), '');
});

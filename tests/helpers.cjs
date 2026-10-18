const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Run the real TypeScript services with explicit native adapters. No phone APIs
// are exercised by unit tests; Metro/typecheck validate the production imports.
function loadSource(entry, mocks = {}, cache = new Map()) {
  const filename = path.resolve(__dirname, '..', entry);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: filename,
  }).outputText;
  const localRequire = (id) => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (id.startsWith('.')) {
      const full = path.resolve(path.dirname(filename), id);
      const target = ['.ts', '.tsx', '/index.ts'].map((suffix) => full + suffix).find(fs.existsSync);
      if (!target) throw new Error(`Cannot resolve ${id} from ${filename}`);
      return loadSource(path.relative(path.resolve(__dirname, '..'), target), mocks, cache);
    }
    return require(id);
  };
  new Function('require', 'module', 'exports', compiled)(localRequire, module, module.exports);
  return module.exports;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
module.exports = { loadSource, deferred, tick };

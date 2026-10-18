const fs = require('node:fs');
const path = require('node:path');

// llama.rn 0.12.x treats translated ARM support as the native process ABI on
// x86_64 emulators. Honor Android's selected library directory before probing
// ARM variants; otherwise its optimized x86_64 backend is never attempted.
const packageFile = require.resolve('llama.rn/package.json');
const version = JSON.parse(fs.readFileSync(packageFile, 'utf8')).version;
const target = path.join(path.dirname(packageFile), 'android/src/main/java/com/rnllama/RNLlama.java');
const source = fs.readFileSync(target, 'utf8');
const marker = '// OpenClaw: respect the app-selected native ABI on translated emulators.';
const original = '      if (isArm64V8a()) {';
const replacement = [
  `      ${marker}`,
  '      String nativeLibraryDir = context.getApplicationInfo().nativeLibraryDir;',
  '      boolean nativeX86_64 = nativeLibraryDir != null && nativeLibraryDir.endsWith("/x86_64");',
  '      if (!nativeX86_64 && isArm64V8a()) {',
].join('\n');

if (!/^0\.12\.\d+$/.test(version)) {
  throw new Error(`Review the llama.rn ABI patch for version ${version} before building.`);
}
if (!source.includes(replacement)) {
  if (source.includes(marker) || source.split(original).length !== 2) {
    throw new Error('llama.rn ABI selection changed upstream; review scripts/patch-llama-abi.cjs.');
  }
  fs.writeFileSync(target, source.replace(original, replacement));
}
console.log(`llama.rn ${version}: native ABI selection patch ready.`);

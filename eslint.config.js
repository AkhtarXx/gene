// https://docs.expo.dev/guides/using-eslint/
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const eslintPluginPrettierRecommended = require('eslint-plugin-prettier/recommended');

module.exports = defineConfig([
  globalIgnores(['dist/**', '.local-qa/**', 'android/**/build/**', 'android/.gradle/**']),
  expoConfig,
  eslintPluginPrettierRecommended,
  {
    // node:test runner files live in Node, not Hermes.
    files: ['tests/**/*.cjs'],
    languageOptions: {
      globals: {
        __dirname: 'readonly',
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        process: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setImmediate: 'readonly',
        structuredClone: 'readonly',
        Buffer: 'readonly',
      },
    },
  },
]);

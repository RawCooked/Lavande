import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.tsx'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  splitting: false,
  sourcemap: true,
  dts: false,
  minify: false,
  shims: false,
  skipNodeModulesBundle: true,
  external: [
    'react',
    'react-devtools-core',
    'ink',
    'ink-big-text',
    'ink-gradient',
    'ink-spinner',
    'ink-text-input',
    '@google/genai',
  ],
});

import { defineConfig } from 'tsup';

const externalDeps = [
  'react',
  'react/jsx-runtime',
  '@tanstack/react-query',
  'firebase',
  'firebase/app',
  'firebase/auth',
  'firebase/firestore',
  'firebase/functions',
];

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: false,
  clean: true,
  target: 'es2020',
  platform: 'neutral',
  treeshake: true,
  minify: false,
  external: externalDeps,
});



import { defineConfig } from 'rolldown'

// One file with every dependency inside: an action runs without `npm install`.
export default defineConfig({
  input: 'src/index.ts',
  platform: 'node',
  output: { file: 'dist/index.mjs', format: 'esm', codeSplitting: false },
})

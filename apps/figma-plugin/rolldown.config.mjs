import { defineConfig } from 'rolldown'

// One script for Figma's plugin sandbox: no modules there.
export default defineConfig({
  input: 'src/code.ts',
  platform: 'browser',
  output: { file: 'dist/code.js', format: 'iife', codeSplitting: false },
})

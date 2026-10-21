import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const src = (pkg: string, file = 'index') =>
  fileURLToPath(new URL(`./packages/${pkg}/src/${file}.ts`, import.meta.url))

export default defineConfig({
  resolve: {
    // Exact matches so that subpath exports (`@dsgraph/sources/node`) resolve to their own entry.
    alias: [
      { find: /^@dsgraph\/schema$/, replacement: src('dsgraph-schema') },
      { find: /^@dsgraph\/core$/, replacement: src('dsgraph-core') },
      { find: /^@dsgraph\/sources$/, replacement: src('dsgraph-sources') },
      { find: /^@dsgraph\/sources\/node$/, replacement: src('dsgraph-sources', 'node') },
      { find: /^@dsgraph\/adapters$/, replacement: src('dsgraph-adapters') },
      { find: /^@dsgraph\/adapters\/figma$/, replacement: src('dsgraph-adapters', 'figma') },
      { find: /^@dsgraph\/rules$/, replacement: src('dsgraph-rules') },
      { find: /^@dsgraph\/report$/, replacement: src('dsgraph-report') },
    ],
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
  },
})

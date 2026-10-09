import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const src = (pkg: string) => fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@dsgraph/schema': src('dsgraph-schema'),
      '@dsgraph/core': src('dsgraph-core'),
      '@dsgraph/sources': src('dsgraph-sources'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
  },
})

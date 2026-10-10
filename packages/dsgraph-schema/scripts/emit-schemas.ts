// Writes JSON Schema files for publishing: node packages/dsgraph-schema/scripts/emit-schemas.ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Changeset, Config, Snapshot } from '../src/types.ts'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'schemas')
mkdirSync(out, { recursive: true })
const emit = (name: string, schema: object) =>
  writeFileSync(
    join(out, `${name}.schema.json`),
    `${JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', ...schema }, null, 2)}\n`,
  )
emit('snapshot', Snapshot)
emit('changeset', Changeset)
emit('config', Config)
console.log(`schemas written to ${out}`)

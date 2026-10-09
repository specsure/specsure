# Specsure · dsgraph

Open-source tooling that keeps implementation within the bounds of the design spec.

**dsgraph** turns a design system into a graph — tokens, contexts (themes, modes), and later code and Figma — and answers questions about it: what changed between two versions, what breaks, which tokens produce a value. Everything runs locally, in CI or in the browser. There is no server and no account.

> Status: **0.1 alpha** — the token core. APIs may change before 0.1.0.

## What works today

- **DTCG 2025.10** — the [Format](https://www.w3.org/community/reports/design-tokens/CG-FINAL-format-20251028/), [Color](https://www.w3.org/community/reports/design-tokens/CG-FINAL-color-20251028/) and [Resolver](https://www.w3.org/community/reports/design-tokens/CG-FINAL-resolver-20251028/) modules: groups, `$root`, type inheritance, curly and JSON Pointer references (including property-level), `$extends`, `$deprecated`, all types and composites, 14 color spaces, sets, modifiers and resolution order.
- **Lenient mode** for real-world files: legacy string colors and dimensions, non-standard units, loose font-weight names, JSONC — each with a diagnostic. `strict: true` turns them into errors.
- **Snapshots** — a canonical, hashed, schema-validated JSON of the resolved system. Values are stored only per modifier that actually influences a token.
- **Diff** — added, removed, renamed (with confidence), value changes per context (direct vs propagated, with cause), notation-only changes, alias retargeting, deprecations, context and modifier changes.
- **Semver** — a suggested bump from the consumer's point of view, configurable, with non-public layers.
- **Sources** — in-memory, Node file system, and any npm package through jsDelivr.

## Packages

| Package | |
|---|---|
| [`@dsgraph/schema`](packages/dsgraph-schema) | Types, JSON Schemas, canonical JSON and hashing |
| [`@dsgraph/core`](packages/dsgraph-core) | Parsing, resolution, values, snapshots, graph queries, diff, semver |
| [`@dsgraph/sources`](packages/dsgraph-sources) | Virtual file systems: memory, npm (jsDelivr), Node |

All packages are isomorphic except `@dsgraph/sources/node`.

## Example

```ts
import { DsGraph, diff, scan } from '@dsgraph/core'
import { NpmSource } from '@dsgraph/sources'

const base = DsGraph.from(await scan(new NpmSource('@acme/tokens', '1')))
const head = DsGraph.from(await scan(new NpmSource('@acme/tokens', '2')))

const changes = await diff(base, head)
console.log(changes.summary) // { counts: { added, removed, renamed, changed, … }, level: 'major', reasons: [...] }

head.value('color.text.primary', { theme: 'dark' })
head.chain('color.text.primary')               // alias chain down to the literal
head.byValue(head.value('color.base.white'))   // every token with that value
```

## Principles

- **Neutral.** No knowledge of specific design systems or brands. Differences between systems live in configuration; presets follow architecture patterns only.
- **Deterministic.** The same input gives byte-identical snapshots and changesets.
- **Local-first.** No network access except what you ask for (e.g. reading an npm package).

## Development

```bash
npm install
npm run build
npm test
npm run lint
```

Network tests (jsDelivr) are opt-in: `DSGRAPH_NETWORK_TESTS=1 npm test`.

## License

[MIT](LICENSE)

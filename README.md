# Specsure · dsgraph

Open-source tooling that keeps implementation within the bounds of the design spec.

**dsgraph** turns a design system into a graph — tokens, contexts (themes, modes), and later code and Figma — and answers questions about it: what changed between two versions, what breaks, which tokens produce a value. Everything runs locally, in CI or in the browser. There is no server and no account.

> Status: **0.6** — tokens and the code that uses them: diff with impact on your code, upgrade checks, checks, CLI, GitHub Action, MCP server and [Token Diff](https://specsure.vercel.app/tools/diff). APIs may still change before 1.0. See the [changelog](CHANGELOG.md).

## What works today

- **DTCG 2025.10** — the [Format](https://www.w3.org/community/reports/design-tokens/CG-FINAL-format-20251028/), [Color](https://www.w3.org/community/reports/design-tokens/CG-FINAL-color-20251028/) and [Resolver](https://www.w3.org/community/reports/design-tokens/CG-FINAL-resolver-20251028/) modules: groups, `$root`, type inheritance, curly and JSON Pointer references (including property-level), `$extends`, `$deprecated`, all types and composites, 14 color spaces, sets, modifiers and resolution order.
- **Lenient mode** for real-world files: legacy string colors and dimensions, non-standard units, loose font-weight names, JSONC — each with a diagnostic. `strict: true` turns them into errors.
- **Snapshots** — a canonical, hashed, schema-validated JSON of the resolved system. Values are stored only per modifier that actually influences a token.
- **Diff** — added, removed, renamed (with confidence), value changes per context (direct vs propagated, with cause), notation-only changes, alias retargeting, deprecations, context and modifier changes.
- **Semver** — a suggested bump from the consumer's point of view, configurable, with non-public layers.
- **Token JSON beyond DTCG** as a token source: token sets with `$themes.json` and `$metadata.json`, older JSON with `value` and `type`, math, color modifiers, `.value` references; modes from `$extensions.mode` and mode files (Figma variable exports).
- **CSS custom properties** as a token source: themes from `[data-theme]`, `.dark` and `prefers-color-scheme`, other media queries as modifiers, inferred types.
- **Your code** — the project that uses the tokens (CSS, SCSS, Sass, JS/TS/JSX/TSX with style objects, CSS-in-JS and Tailwind classes, Vue, Svelte, Astro, HTML): how much of it is on tokens, where each change reaches (what breaks, what looks different, with file and line), colors and sizes written by hand with the token to use, deprecated and unknown variables, unused tokens.
- **Rules** — deprecated references, naming collisions, hex mismatches, gamut, palette ramps, contrast matrix, layer rules; presets by architecture pattern.
- **Reports** — text, Markdown (for PR comments) and JSON; repeated findings are collapsed into one line per kind.
- **CLI** — `dsgraph scan | check | diff` over folders, files, npm packages, GitHub repositories and saved snapshots.
- **Sources** — in-memory, Node file system, any npm package through jsDelivr, any GitHub repository at a ref.
- **Token Diff** — the same engine on the web ([`apps/web`](apps/web)): drop files or pick an npm package, filter by theme, copy Markdown, export a card for a post.

## Packages

| Package | |
|---|---|
| [`@dsgraph/schema`](packages/dsgraph-schema) | Types, JSON Schemas, canonical JSON and hashing |
| [`@dsgraph/core`](packages/dsgraph-core) | Parsing, resolution, values, snapshots, graph queries, diff, semver |
| [`@dsgraph/sources`](packages/dsgraph-sources) | Virtual file systems: memory, npm (jsDelivr), GitHub, Node |
| [`@dsgraph/adapters`](packages/dsgraph-adapters) | Token-set and value/type JSON, CSS custom properties → tokens |
| [`@dsgraph/rules`](packages/dsgraph-rules) | Rule engine, built-in rules, presets |
| [`@dsgraph/report`](packages/dsgraph-report) | Text, Markdown and JSON formatters |
| [`@dsgraph/cli`](packages/dsgraph-cli) | CLI, the `dsgraph` command |
| [`@dsgraph/mcp`](packages/dsgraph-mcp) | MCP server: find the token for a value, read tokens, compare versions |
| [`@dsgraph/action`](packages/dsgraph-action) | GitHub Action, published to [specsure/dsgraph-action](https://github.com/specsure/dsgraph-action) and the [Marketplace](https://github.com/marketplace/actions/dsgraph-diff) |

All packages are isomorphic except `@dsgraph/sources/node` and the CLI.

## CLI

```bash
npx @dsgraph/cli diff npm:@acme/tokens@1 npm:@acme/tokens@2 --format markdown
npx @dsgraph/cli check ./tokens --strict
npx @dsgraph/cli diff npm:@acme/tokens@1 npm:@acme/tokens@2 --code ./src   # what breaks in your styles
npx @dsgraph/cli upgrade-check @acme/tokens                                 # before upgrading, in your project
```

## Library

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
npm run web:dev     # the site with Token Diff at http://localhost:4321/tools/diff
```

Network tests (jsDelivr) are opt-in: `DSGRAPH_NETWORK_TESTS=1 npm test`.

## License

[MIT](LICENSE). The CLI and the MCP server also install `@specsure/knowledge`, a knowledge pack: data
that adds words dsgraph reads token names by (such as which words name a state). It has its own
license, not MIT, and may be used with dsgraph. The engine works without it:
`DSGRAPH_KNOWLEDGE=off`.

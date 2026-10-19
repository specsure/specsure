# @dsgraph/cli

The `dsgraph` command: scan, check and compare design tokens in a terminal or CI.

```bash
npm install -g @dsgraph/cli    # then: dsgraph diff …, dsgraph check …
```

Or without installing:

```bash
npx @dsgraph/cli diff npm:@acme/tokens@1 npm:@acme/tokens@2
npx @dsgraph/cli check ./tokens
npx @dsgraph/cli scan github:owner/repo/tokens@main --out snapshot.json
```

Formats: DTCG 2025.10 (with resolver documents and `$extensions.mode`), token JSON with sets and themes (`$themes.json`, `$metadata.json`), older token JSON with `value` and `type`, CSS custom properties.

Sources: folders, single files (`.json`, `.tokens`, `.css`, `.resolver.json`), `npm:pkg@range`, `github:owner/repo/path@ref` (`GITHUB_TOKEN` for private repos), saved snapshots.

## Your code

`--code <dir>` reads the project that uses the tokens: CSS, SCSS, Sass and CSS modules; JS, TS, JSX and TSX (style objects, CSS-in-JS, Tailwind classes in `className`, `cn()`, `clsx()`, `cva()`); Vue, Svelte, Astro and HTML:

```bash
npx @dsgraph/cli diff npm:@acme/tokens@1 npm:@acme/tokens@2 --code ./src
npx @dsgraph/cli check npm:@acme/tokens@2 --code ./src
```

- `diff` lists under each change the places in the code it reaches, through references too: what breaks (a removed or renamed variable) and what looks different.
- `check` says how much of the code's design values come from tokens and adds rules on the code: colors written by hand (`style/hardcoded-color`), spacing, radii and font sizes off the scale (`style/off-scale`), deprecated and unknown design-system variables (`usage/deprecated`, `usage/unknown-token`) and tokens nothing uses (`token/unused`).

Before upgrading a token package, see what the new version does to your project:

```bash
npx @dsgraph/cli upgrade-check @acme/tokens --to 3.0.0     # in the project folder; --to defaults to latest
```

It takes the version you use from `node_modules`, the lockfile or `package.json`, and lists only what reaches your code and what breaks.

For Tailwind, arbitrary values (`bg-[#3366ff]`, `p-[13px]`) are values written by hand, with the class to use instead (`bg-accent`); named classes (`bg-primary`, `rounded-md`) and `bg-(--brand)` use tokens. `@theme` blocks and shadcn's HSL channels are read as tokens.

Custom properties match tokens by name (`--color-accent` ↔ `color.accent`); a prefix such as `--ds-` is learned from the code or set in the config: `"code": { "include": ["src/**/*.css"], "prefix": "--ds-" }`.

Repeated findings are collapsed (`247× Color "…" is a string`, with the first tokens listed); `--expand` lists every one.

Exit codes: `0` ok · `1` check found errors (or `--max-warnings` exceeded) / diff reached `--fail-on` · `2` usage or runtime error.

Config: `dsgraph.config.json` (JSON Schema in `@dsgraph/schema/schemas/config.schema.json`).

Knowledge: `dsgraph check` reads token names with `@specsure/knowledge`, a knowledge pack installed
with the CLI (data under its own license, not MIT). `DSGRAPH_KNOWLEDGE=<file>` uses another pack,
`DSGRAPH_KNOWLEDGE=off` none.

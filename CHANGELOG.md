# Changelog

dsgraph packages (`@dsgraph/*`) share one version. The GitHub Action
([specsure/dsgraph-action](https://github.com/specsure/dsgraph-action)) has its own, in its tags.

## 0.2.0 — 2026-10-14

The first release on npm. It covers the token part of dsgraph: read design tokens from wherever they
live, compare two versions, check them, and use the result in a terminal, CI, a pull request, a
coding agent or the browser.

### Reading tokens

- DTCG 2025.10: Format, Color and Resolver modules, with a lenient mode for older files (string
  colors and sizes, JSONC and JSON5) that reports what it relaxed.
- Token JSON beyond DTCG: token sets with `$themes.json` and `$metadata.json` (theme groups become
  modifiers), the older notation with `value` and `type`, values per mode under `sets`, types from a
  `$schema` link, path-like names. Math (`{space.base} * 2`), `rgba({color}, 0.5)` and color
  modifiers (lighten, darken, mix, alpha) are calculated, with their references kept.
- Modes from Figma variable exports: per token in `$extensions.mode`, or as mode files side by side.
- CSS custom properties: themes from `:root`, `[data-theme]`, compound attribute selectors,
  `.dark` and `prefers-color-scheme`; other media and supports conditions become on/off modifiers
  with short names.
- Sources: folders and files, npm packages (through jsDelivr) and GitHub repositories, read in
  parallel and cached. Build output (`dist/`) is read when nothing else holds tokens. When a package
  ships the same tokens in several formats, the best-typed export is read.

### Comparing and checking

- `diff`: removed, renamed, changed, added and deprecated tokens per theme, changes that travel
  through references shown under their cause, colors compared by ΔE in OKLab, and the semver bump
  the release needs.
- Renames are matched by a stable id (`uuid`, Figma variable id) when there is one, otherwise by
  equal values and similar names, with a confidence.
- Rules for checks: broken references, cycles, legacy syntax, naming collisions, palette order,
  out-of-gamut colors, contrast and layers; repeated findings are grouped.

### Packages

- `@dsgraph/cli`: the CLI, command `dsgraph` (`scan`, `check`, `diff`; text, Markdown and JSON; `--fail-on`).
- `@dsgraph/mcp`: an MCP server for coding agents. `find_token` turns a color or size into the
  token that holds it; also `get_token`, `search_tokens`, `describe_tokens`, `compare_versions`,
  `check_tokens`.
- `@dsgraph/core`, `@dsgraph/schema`, `@dsgraph/sources`, `@dsgraph/adapters`, `@dsgraph/rules`,
  `@dsgraph/report`: the engine, usable in Node and in the browser.

### Elsewhere

- GitHub Action v1.0.0: one pull request comment with the report, kept up to date, a job summary,
  outputs, and `fail-on`.
- [specsure.vercel.app](https://specsure.vercel.app): Token Diff in the browser, with the reference graph of each
  change and the report in plain words, a guide, MCP setup for six agents; in English and Russian.

# Specsure site

Static site for specsure.app, built with Astro and React islands. Token Diff lives at `/tools/diff`, its guide at `/tools/diff/guide` (MDX in `src/pages/tools/diff/guide.mdx`, with live figures from `LiveFigure`: the real engine and components on a synthetic example); About is a dialog in `src/layouts/Base.astro`.

Everything runs in the browser. Dropped files are read locally and never uploaded; npm packages come from jsDelivr and repositories from the GitHub API, both requested straight from the visitor's browser. Scanning and diffing run in a Web Worker.

```bash
npm run web:dev     # from the repository root: builds the packages, then starts Astro
npm run web:build   # static output in apps/web/dist
```

## Token Diff

- **Inputs:** npm package and version, GitHub `owner/repo/folder` at a ref, or dropped files and folders (DTCG JSON, a resolver, Tokens Studio, Style Dictionary, CSS custom properties, a dsgraph snapshot).
- **Results:** suggested semver bump, breaking changes first, values per context with color swatches and ΔE, propagated changes under their cause, checks on the new version with repeated findings collapsed.
- **Layout:** an input window with one row per side, then a list of changes with a detail pane, in the manner of a command launcher. Keys: `⌘↵` compare, `↑ ↓` move, `/` filter, `⌘K` actions, `⌘⇧C` copy Markdown.
- **Filters:** context (theme and other modifiers), impact, token type, name.
- **Export:** Markdown (the same as `dsgraph diff --format markdown`), changeset JSON, a 1200×630 PNG card.
- **Links:** `?pkg=@scope/tokens&from=1.0.0&to=2.0.0`, or `?base=npm:…&head=github:…`; `files=` sets the token-file globs and `ctx=theme:dark` the context. Small dropped files are compressed into the fragment (`#d=…`), which browsers never send to a server.

## Code

| Path | |
|---|---|
| `src/lib/compare.ts` | Loads both sides, diffs, checks; runs in the worker (`worker.ts`) and in tests |
| `src/lib/view.ts` | Context, impact and type filters over a changeset |
| `src/lib/url.ts` | Address state and the compressed fragment |
| `src/lib/card.ts` | The share card on a canvas |
| `src/components/` | `TokenDiff` (the island), `SidePicker` (source rows), `Results` (list, detail, actions), `ChangeList`, `CardDialog` |
| `src/styles/tokens.css` | Design tokens; the base is shared with Mockplate |

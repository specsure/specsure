# Export tokens (DTCG) — Figma plugin

A Figma file's variables and styles as [DTCG 2025.10](https://tr.designtokens.org/format/) tokens, for Token Diff, Token Fix, `dsgraph` and CI. It reads the file and never changes it; nothing leaves your computer except the files you save.

## What it writes

- **A .zip**, the layout most tools read:
  - a file per collection (`Primitives.tokens.json`), or per mode for a collection with several (`Theme/Light.tokens.json`, `Theme/Dark.tokens.json`);
  - `styles.tokens.json`: paint styles as colors and gradients, text styles as typography, effect styles as shadows, under `styles`;
  - `tokens.resolver.json`: a DTCG resolver where each collection with modes is a modifier and its default mode is the default.
- **One file**, every mode inside its token in `$extensions.mode`: to drop into Token Fix or Token Diff as it is.

Variables keep their references (`{color.blue.500}`), descriptions, scopes (`com.figma.scopes`), code syntax (`com.figma.codeSyntax`) and ids. A number becomes a `dimension` in px when its scopes say it is a length (radius, gap, size, stroke, font size…) or, offered everywhere, when its name does; a `fontWeight` or an opacity `number` otherwise. Easings become `cubicBezier`, timings `duration` in ms. A reference to a library variable is written as its value, with the library variable's name in `com.figma.alias`; a color composed of a color and an opacity likewise, in `com.figma.composedColor`.

Left out, and listed in the plugin: booleans and plain strings (no DTCG type), springs and Figma's back curves (no exact cubic Bézier), blur effects, styles of several paints. A `.` in a name, which DTCG does not allow, becomes `-`.

## Run it

```bash
npm run build -w @specsure/figma-plugin
```

In Figma desktop: Plugins → Development → Import plugin from manifest → `apps/figma-plugin/manifest.json`.

The conversion (`src/convert.ts`) is plain TypeScript, tested without Figma: `npx vitest run apps/figma-plugin`. `src/gather.ts` is the only part that talks to the plugin API.

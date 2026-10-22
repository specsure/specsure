# Export tokens (DTCG) — Figma plugin

A Figma file's variables and styles as [DTCG 2025.10](https://tr.designtokens.org/format/) tokens, for Token Diff, Token Fix, `dsgraph` and CI. It reads the file and never changes it; nothing leaves your computer except the files you save.

## What it writes

- **A .zip**, the layout most tools read:
  - a file per collection (`Primitives.tokens.json`), or per mode for a collection with several (`Theme/Light.tokens.json`, `Theme/Dark.tokens.json`);
  - `styles.tokens.json`: paint styles as colors and gradients, text styles as typography, effect styles as shadows, grid styles as a group of their numbers per grid (`columns.count`, `columns.gutter`, `columns.offset`, `columns.size`; DTCG has no grid type), under `styles`;
  - `tokens.resolver.json`: a DTCG resolver where each collection with modes is a modifier and its default mode is the default.
- **One file**, every mode inside its token in `$extensions.mode`: to drop into Token Fix or Token Diff as it is.

Variables keep their references (`{color.blue.500}`), descriptions, scopes (`com.figma.scopes`), code syntax (`com.figma.codeSyntax`) and ids. A number becomes a `dimension` in px when its scopes say it is a length (radius, gap, size, stroke, font size…) or, offered everywhere, when its name does; a `fontWeight`, or a `number` otherwise; an opacity, which Figma keeps in percent, becomes a fraction (50 → 0.5). A string of font style names (`Semi Bold`, `Regular`), as a text style's weight is bound to, becomes a `fontWeight` (600, 400), and the text style refers to it. Easings become `cubicBezier` (Figma's back curves too), timings `duration` in ms. A reference to a library variable is written as its value, with the library variable's name in `com.figma.alias`; a color composed of a color and an opacity likewise, in `com.figma.composedColor`.

A token's path is its variable's name, without the collection's, as code names it. Two cases add the collection's name as the first segment:

- an extended collection is written as a collection of its own with everything it inherits, its overrides applied and its modes as its parent's; its tokens are under its name, and a reference inside it is to its own copy, as Figma resolves it;
- when the names of two collections overlap (the same token in both, or a token where the other has a group), each one's tokens go under its name, references to them too, so that neither replaces the other where they are read together.

Left out, and listed in the plugin: booleans and plain strings (no DTCG type), springs (no cubic Bézier), blur effects, styles of several paints. A `.` in a name, which DTCG does not allow, becomes `-`.

## Run it

```bash
npm run build -w @specsure/figma-plugin
```

In Figma desktop: Plugins → Development → Import plugin from manifest → `apps/figma-plugin/manifest.json`.

The UI (`ui.html`) follows the site's tokens, light or dark with Figma's theme, and has three tabs: Export, Guide and About. To work on it without Figma, serve this folder over HTTP (`python3 -m http.server` in it) and open `preview.html`: the UI in the plugin's size, in every state and both themes.

The Community page's icon and cover are in `listing/`: `icon.png` (128×128) and `cover.png` (1920×1080), drawn from `listing/assets.html` on the site's own backdrop (`listing/backdrop.ts`).

The conversion is `figmaTokens` in [`@dsgraph/adapters/figma`](../../packages/dsgraph-adapters/src/figma.ts), the same one dsgraph uses to read Figma's REST API response; it is tested there without Figma. `src/gather.ts` is the only part that talks to the plugin API.

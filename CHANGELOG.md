# Changelog

dsgraph packages (`@dsgraph/*`) share one version. The GitHub Action
([specsure/dsgraph-action](https://github.com/specsure/dsgraph-action)) has its own, in its tags.

## 0.8.1 — 2026-10-22

- `coverageOf` counts classes of Tailwind's own palette the system has no token for as written by
  hand, as `style/hardcoded-color` reports them: `dsgraph check --code` no longer says there are no
  colors in code made of such classes.
- GitHub Action v1.6.1 is built on it.

## 0.8.0 — 2026-10-22

- `@dsgraph/report` answers questions about one design system as data: `findToken`, `readToken`,
  `searchTokens`, `describeTokens` (with `stateOf`, `componentOf`, `similarIds`). The MCP server
  words them for agents; Token Fix on the site draws them.
- Choosing a token among equal ones counts the words of a name whatever separates them, so
  `control-bgColor-hover` is more general than `button-default-bgColor-hover` in CSS names too; and
  of tokens still equal, the one more tokens reference comes first (`fgColor-default` before
  `fgColor-black`). Before that, the one the system names its default: `bg-default` before
  `bg-raised` of the same white, whichever more tokens build on. The words are in the vocabulary
  (`defaults`), and a knowledge pack can add to them.
- New checks, found by reading a design system straight from Figma:
  - `context/empty-value`: a token set in one theme or mode and empty in another (0, `""`), as
    when a mode is added and its values never filled in;
  - `context/literal-value` (info): a value written by hand in one mode where every other mode
    references a token;
  - `description/value-mismatch`: a number in a description (`13 · …` for a size, `16/25` and a
    tracking % for typography) the value no longer has;
  - `typography/unlinked-field`: a typography field written by hand where most typography tokens
    take it from a token.
- `inferLayers` in `@dsgraph/core`: every token's layer read from the system itself — palette,
  semantic, component, or a standalone value nothing references. Layers set in the config win,
  then the names of groups, collections and files (`Primitives`, `semantic`, `md.comp`); the rest
  are read from references and the shape of names, and say so (`by: 'references'`). With them, the
  references that go against the layers: a component that takes its value straight from the
  palette, past the semantic layer, and a lower layer that references a higher one. The words are
  in the vocabulary (`layers`), and a knowledge pack can add to them.
- `layer/crossing` (off by default) reports those references, for systems that do not set
  `layers` in the config.
- Classes of Tailwind's own palette (`bg-blue-500`, `text-white`) that the system has no token for
  are colors written by hand: `style/hardcoded-color` reports them with the system's token for the
  color Tailwind writes, in the project's Tailwind version (from `tailwindcss` in package.json or
  the styles; 4 when nothing says, nothing for Tailwind 2 and older). `usage/unknown-token` no
  longer reports them. The palettes are Tailwind's (MIT), from tailwindcss 3.4.17 and 4.1.11.
- The class that replaces an arbitrary Tailwind value uses a theme namespace only for the kind of
  value it holds: a color token `text-default` becomes `text-(--text-default)`, not the font-size
  class `text-default`; and `--bg-accent` becomes `bg-(--bg-accent)`, not `bg-bg-accent`.
- `suggestName` in `@dsgraph/report`: a name for a token the system does not have yet, from its
  own scales only — a new step of a color ramp between the two steps it falls between in lightness
  (and close to the ramp in hue and saturation), or a size step named the way the scale names its
  steps (`space-5` between `space-4` and `space-6` when steps are ×4). Nothing when there is no such
  scale. MCP `find_token` adds it as a hint for the design system's team when no token matches.
- `parseValue` (a value as people type it, as a DTCG type and value) is exported from
  `@dsgraph/adapters`.
- MCP `get_token` lists tokens with the same value; `describe_tokens` says how many tokens hold
  values and how many take them from others; `search_tokens` finds a custom property
  (`--color-text`) and names written with other separators.
- GitHub Action v1.6.0 is built on it.

## 0.7.0 — 2026-10-20

- A color written by hand points to the token for its state and component, not only its property:
  `control.bgColor.hover` in a `:hover` rule or a `hover:` class, `button.primary.bgColor.rest` in
  `.button` or `Button.tsx`. In a rule without a state, tokens named for hover, focus, disabled and
  other states go after the rest, even with the same value. States come from the selector (`:not()`
  left out) and a class's variants; components from the selector's classes (a BEM block) and the
  file or folder name. `styleContext` is exported from `@dsgraph/core`; `nearestTokens` takes it.
- Style scanning resolves nested selectors: `&:hover` inside `.button` is `.button:hover`, and in a
  CSS-in-JS template it stays `&:hover`.
- MCP `find_token` takes `state` and `component`.
- Knowledge packs (`dsgraph/knowledge@1`): the words names are read by — roles, states, the resting
  state, generic file and class names — are a vocabulary now, `DEFAULT_VOCABULARY` in
  `@dsgraph/core`, neutral and small. A pack adds words to it, never replaces them. `nearestTokens`,
  `styleContext` and `check` take a pack; `loadKnowledge` in `@dsgraph/cli` finds one for
  `dsgraph check` and `dsgraph-mcp`: the file in `DSGRAPH_KNOWLEDGE` (`off` for none), or the
  `@specsure/knowledge` package when it is installed.
- `@dsgraph/cli` (and through it `@dsgraph/mcp`) depends on `@specsure/knowledge`, Specsure's
  knowledge pack. It is data under its own license, not MIT; `DSGRAPH_KNOWLEDGE=off` runs without it.
- GitHub Action v1.5.0 is built on it, with the knowledge pack inside (license in
  `LICENSE-knowledge`).

## 0.6.3 — 2026-10-15

- A color written by hand points to the token made for its property: text tokens for `color`,
  background tokens for `background`, border tokens for `border-color`. Among exact matches, general
  semantic tokens come before component ones (`fgColor.accent`, not `button.outline.fgColor.rest`).
  `nearestTokens` takes the property; `roleOfProperty` is exported from `@dsgraph/core`.
- MCP `find_token` takes `property`.
- Findings about a whole file (such as JSON5 source files) name the file in text and Markdown
  reports.
- GitHub Action v1.4.3 is built on it.

## 0.6.2 — 2026-10-15

Fixes found by running a real release (Primer 11.7) over a real app (OpenProject).

- Code: indented Sass (`.sass`, and `<style lang="sass">`) is read line by line; TypeScript and
  JavaScript with decorators (`@Component` in Angular) parse instead of being skipped.
- Shadow layers keep an opacity given next to their color (`{ color: "{gray.12}", alpha: 0.04 }`),
  read leniently.
- HSL and HWB colors print as sRGB: `#25292e`, not `#25292e (hsl)`; translucent ones as `rgb(… / 4%)`.
- The spacing scale leaves out font sizes, line heights and borders: `margin: 20px` is no longer
  pointed to `text.subtitle.size`.
- GitHub Action v1.4.2 is built on it.

## 0.6.1 — 2026-10-15

- Markdown findings put quoted values in code, as the rest of the report does, so a color gets
  GitHub's swatch: `#3366ff` instead of "#3366ff".
- Repeated findings list the values that differ (`10px`, `2px` in padding is off the scale) instead
  of "…".
- A source pinned to a commit names it once and short: `github:owner/repo/tokens@7c970d9`.
- GitHub Action v1.4.1 is built on it.

## 0.6.0 — 2026-10-15

Reports read like a review: what the release means in words, changes grouped by what they do to the
people who use the tokens, and the places in your code first. Token Diff takes your project's code,
from a folder or a GitHub repository. GitHub Action v1.4.0 is built on it.

- Token Diff 1.1 on the site: an optional **Your code** row takes a project folder, read in the
  browser. The result says how many places in the code break or look different, marks the changes
  that reach the code, lists those places in each change's details and in the Markdown, and adds a
  **Your code** window: how much of it is on tokens, values written by hand with what to write
  instead, deprecated and unknown variables. The script parser loads only when code is added.
- **Your code** can also be a GitHub repository (with a folder and a ref; the GitHub token covers
  private ones). It goes into the link (`?code=github:owner/repo/src@main`), so a result can be
  shared; up to 1,500 files are read. The input window groups the design system and your product.
- `scanCode` takes `maxFiles` and says when it read only part of the code (`limited`).
- Usage findings carry the name as written (`evidence.name`).
- `@dsgraph/report` exports `groupOf`, `GROUPS`, `colorDirection` and `colorSize`.
- Reports read like a review: the release in words with one sentence on why, sections by meaning
  (Breaks, Looks different, New, Deprecated, Hard to notice), what to do for breaking changes, value
  changes as a table with the difference in words (lighter, noticeable), and In your code first.
  Markdown keeps values alone in backticks so GitHub draws color swatches.
- Token Diff lists changes by the same groups, words color differences (lighter · noticeable), and
  says what tags mean (+2 via references, 1 in code); on phones the tags go under the token name.

## 0.5.0 — 2026-10-15

dsgraph reads the whole front end, not only stylesheets: JSX and TSX, Tailwind classes, CSS-in-JS,
Vue, Svelte and Astro. It says how much of the code is on tokens and, for a class written by hand,
which class to use instead. GitHub Action v1.3.0 is built on it.

### The whole front end

- `--code`, `check_styles`, the Action's `code` and `upgrade-check` read scripts and markup, not only
  styles: JS, TS, JSX and TSX (style objects such as `style={{…}}` and `sx`, CSS-in-JS templates such
  as `styled.div` and `css`), Vue, Svelte, Astro and HTML (`<script>`, `<style>`, `class` and `style`
  attributes, bound ones included). Scripts are parsed with `@babel/parser`.
- Tailwind: arbitrary values (`bg-[#3366ff]`, `p-[13px]`, `[color:#222]`) are values written by hand,
  and findings name the class to use instead (`hover:bg-[#2952cc]` → `hover:bg-accent`). Named
  classes (`bg-primary`, `rounded-md`, `font-medium`) and `bg-(--brand)`, `bg-[var(--brand)]` use
  tokens. Classes are read in `className`, `cn()`, `clsx()`, `cva()`, `twMerge()`, object keys and
  strings that look like class lists.
- Tailwind 4 `@theme` blocks are read as tokens; bare HSL channels (`--primary: 222 47% 11%`) are colors.
- Coverage: how much of the code's design values come from tokens, in `dsgraph check --code`,
  `check_styles` and the Action comment.
- Positions (`top`, `left`, `inset`) are no longer checked against the scale; radii and font sizes are
  not suggested for spacing; a one-word name (`sm`) does not match the end of a token path.
- Style findings carry `source`, `replacement` and `exact` in their evidence; `classFor` is exported
  from `@dsgraph/rules`.

## 0.4.0 — 2026-10-15

Upgrading a token package: what the new version does to your project, in a terminal or on the
pull request that bumps it.

- `dsgraph upgrade-check <package> [--to <version>]`: what upgrading a token package changes in this
  project. The version in use comes from `node_modules`, the lockfile (npm, pnpm, yarn) or
  `package.json`; the report lists what reaches the code and every breaking change, the rest in one line.
- GitHub Action v1.2.0: `package` input for apps that depend on a token package. The versions before and after
  the pull request come from its lockfile or `package.json`.
- Custom properties in code match tokens whose path ends with the same name (`var(--gray-9)` ↔
  `colors.--gray-9`), when exactly one does.
- `style/off-scale`: a pill radius (100px and more) is not a scale step.

## 0.3.0 — 2026-10-15

dsgraph reads the code that uses the tokens. A diff shows which places in your styles a new version
breaks or changes; checks find colors and sizes written by hand, with the token to use instead.

### Your code

- `--code <dir>` for `dsgraph diff` and `dsgraph check`, and a `code` section in the config: the styles of
  the project that uses the tokens (CSS, SCSS, CSS modules) are read for `var()` uses and values written
  by hand.
- `diff` shows where each change reaches into the code, through references: what breaks and what
  looks different, with file and line (`impactOf` in `@dsgraph/core`).
- Rules on the code: `style/hardcoded-color`, `style/off-scale`, `usage/deprecated`,
  `usage/unknown-token`, `token/unused`. Each points to the token to use, or the closest one.
- Custom properties are matched to tokens by name, with a configured or learned prefix (`VarMatcher`).
- `nearestTokens` moved from the MCP server to `@dsgraph/core`.
- MCP: `check_styles` checks style text an agent wrote, or project files, against the tokens;
  `compare_versions` takes `code` and lists the places in the project's styles a new version reaches.
- GitHub Action v1.1.0: `code` input. The comment lists the places in the repository's styles
  each change reaches and checks the styles of the files the pull request touches; new output
  `code-breaks`.
- Reports: findings in code show `file:line`; Markdown findings can leave out their heading.

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

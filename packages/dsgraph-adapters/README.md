# @dsgraph/adapters

Token adapters for `@dsgraph/core`.

`jsonTokens` reads token JSON beyond plain DTCG:

- token sets: a file each, or top-level keys of one exported file; set order from `$metadata.json`, themes from `$themes.json`; each theme group becomes a modifier, a group with one theme joins the base
- value/type JSON (the older notation): every file merges into one set; untyped tokens take their type from the category (`color`, `size` as rem, `time` as ms) or from the value
- values per mode under `sets`, types from a token's `$schema` link, path-like names (`Dark/color.bg`)
- values become DTCG 2025.10: `"16"` is 16px, `"Semi Bold"` is 600, `"150%"` line height is 1.5, `"-2%"` letter spacing is -0.02em, `boxShadow` becomes `shadow`
- math (`{space.base} * 2`), `rgba({color.ink}, 0.5)` and color modifiers (`lighten`, `darken`, `mix`, `alpha` in lch, hsl, srgb, p3) are evaluated with their references kept as edges
- references with a `.value` suffix work; CSS that no DTCG value can hold (`clamp()`, gradients) is kept as text
- when a package ships the same tokens in several formats, the best-typed file is read

It runs before plain DTCG files. Modes written per token in `$extensions.mode`, and mode files side by side (`Theme/Light.tokens.json`, `Theme/Dark.tokens.json`), as Figma variable exports write them, become modifiers in the core for every JSON source.

`cssTokens` reads CSS custom properties as tokens:

- `:root`, `html`, `:host` → the base set
- `[data-theme=dark]`, `.dark`, `@media (prefers-color-scheme: dark)` → a `theme` modifier
- other media queries → independent on/off modifiers
- types inferred from values and names (colors, lengths, durations, easings, font stacks, shadows); whole `var()` becomes an alias; `calc()` and friends stay as expressions with their references
- scoped variables (`.button { --x }`) are not tokens
- explicit mapping via `css.contexts` in the config

```ts
import { scan } from '@dsgraph/core'
import { cssTokens, jsonTokens } from '@dsgraph/adapters'
const snapshot = await scan(source, {}, { adapters: [jsonTokens, cssTokens] })
```

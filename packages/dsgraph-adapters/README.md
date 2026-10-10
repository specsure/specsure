# @dsgraph/adapters

Token adapters for `@dsgraph/core`.

`cssTokens` reads CSS custom properties as tokens:

- `:root`, `html`, `:host` → the base set
- `[data-theme=dark]`, `.dark`, `@media (prefers-color-scheme: dark)` → a `theme` modifier
- other media queries → independent on/off modifiers
- types inferred from values and names (colors, lengths, durations, easings, font stacks, shadows); whole `var()` becomes an alias; `calc()` and friends stay as expressions with their references
- scoped variables (`.button { --x }`) are not tokens
- explicit mapping via `css.contexts` in the config

```ts
import { scan } from '@dsgraph/core'
import { cssTokens } from '@dsgraph/adapters'
const snapshot = await scan(source, {}, { adapters: [cssTokens] })
```

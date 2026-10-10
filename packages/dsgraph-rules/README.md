# @dsgraph/rules

Rule engine and built-in rules. Parse diagnostics are reported as findings too; every severity is configurable.

| Rule | Default |
|---|---|
| `token/deprecated-reference` | warning |
| `naming/normalized-collision` | warning |
| `color/hex-mismatch` | warning |
| `color/out-of-gamut` | info |
| `palette/non-monotonic`, `palette/duplicate-stops` | warning |
| `a11y/contrast-matrix` | off — set `text`, `surfaces`, `min`, `acknowledged` |
| `layer/alias-depth`, `layer/allowed-sources` | off — on in the `two-layer` preset |

Presets (architecture patterns only): `recommended`, `dtcg-strict`, `two-layer`.

```ts
import { check } from '@dsgraph/rules'
const findings = await check(graph, { extends: ['recommended'], rules: { 'color/out-of-gamut': 'off' } })
```

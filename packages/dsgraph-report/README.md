# @dsgraph/report

Formatters for changesets and findings: `text`, `markdown`, `json`. Propagated value changes are listed under the direct change that caused them; values are shown as hex, px, ΔE.

```ts
import { formatChangeset, formatFindings } from '@dsgraph/report'
console.log(formatChangeset(changeset, { format: 'markdown' }))
```

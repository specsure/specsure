# @dsgraph/schema

Types (TypeBox), JSON Schemas and canonical serialization for dsgraph.

- `Snapshot` (`dsgraph/snapshot@1`), `Changeset` (`dsgraph/changeset@1`), `Diagnostic` and friends
- `validateSnapshot`, `validateChangeset` — no code generation, safe under strict CSP
- `canonicalize` (sorted keys, numbers rounded to 6 decimals), `contentHash` (sha256, ignores `hash` and `meta`)
- JSON Schema files: `@dsgraph/schema/schemas/snapshot.schema.json`, `…/changeset.schema.json`

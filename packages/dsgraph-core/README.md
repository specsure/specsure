# @dsgraph/core

Design-system graph core. Isomorphic: runs in the browser and in Node.

- DTCG 2025.10 Format, Color and Resolver modules, with a lenient mode for legacy files
- `scan(source, config)` → snapshot; `buildSnapshot(system, options)`
- `DsGraph` — `value`, `entry`, `chain`, `dependencies`, `dependents`, `byValue`, `byCssVar`, `tokens(filter)`
- `diff(base, head, options)` → changeset with renames, per-context changes, causes and semver levels
- `compareValues`, `canonicalValue`, color helpers (`deltaEOK`, `toOklab`, `colorToHex`, `isInSrgbGamut`)

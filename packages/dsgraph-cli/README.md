# dsgraph

```bash
npx dsgraph diff npm:@acme/tokens@1 npm:@acme/tokens@2
npx dsgraph check ./tokens
npx dsgraph scan github:owner/repo/tokens@main --out snapshot.json
```

Sources: folders, single files (`.json`, `.tokens`, `.css`, `.resolver.json`), `npm:pkg@range`, `github:owner/repo/path@ref` (`GITHUB_TOKEN` for private repos), saved snapshots.

Repeated findings are collapsed (`247× Color "…" is a string`, with the first tokens listed); `--expand` lists every one.

Exit codes: `0` ok · `1` check found errors (or `--max-warnings` exceeded) / diff reached `--fail-on` · `2` usage or runtime error.

Config: `dsgraph.config.json` (JSON Schema in `@dsgraph/schema/schemas/config.schema.json`).

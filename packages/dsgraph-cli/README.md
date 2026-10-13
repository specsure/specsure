# @dsgraph/cli

The `dsgraph` command: scan, check and compare design tokens in a terminal or CI.

```bash
npm install -g @dsgraph/cli    # then: dsgraph diff …, dsgraph check …
```

Or without installing:

```bash
npx @dsgraph/cli diff npm:@acme/tokens@1 npm:@acme/tokens@2
npx @dsgraph/cli check ./tokens
npx @dsgraph/cli scan github:owner/repo/tokens@main --out snapshot.json
```

Formats: DTCG 2025.10 (with resolver documents and `$extensions.mode`), token JSON with sets and themes (`$themes.json`, `$metadata.json`), older token JSON with `value` and `type`, CSS custom properties.

Sources: folders, single files (`.json`, `.tokens`, `.css`, `.resolver.json`), `npm:pkg@range`, `github:owner/repo/path@ref` (`GITHUB_TOKEN` for private repos), saved snapshots.

Repeated findings are collapsed (`247× Color "…" is a string`, with the first tokens listed); `--expand` lists every one.

Exit codes: `0` ok · `1` check found errors (or `--max-warnings` exceeded) / diff reached `--fail-on` · `2` usage or runtime error.

Config: `dsgraph.config.json` (JSON Schema in `@dsgraph/schema/schemas/config.schema.json`).

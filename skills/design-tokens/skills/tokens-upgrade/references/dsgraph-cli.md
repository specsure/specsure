# dsgraph CLI: what the skills run

dsgraph reads design tokens and the code that uses them and answers without guessing: what changed between two versions, what breaks, and which values in the code bypass the tokens. It is open source (MIT) and runs locally; npm packages and GitHub repositories are downloaded the way a browser would, and nothing is uploaded.

Run it with npx, pinned to the minor version these skills were written for:

```bash
npx -y @dsgraph/cli@0.9 <command> …
```

Node.js 20 or newer is needed. If `npx` is not available, ask the user to install Node.js; do not install it yourself.

## Sources

Every command takes token sources in one of these forms:

| Form | Example |
|---|---|
| A folder | `./tokens` (DTCG files, a `*.resolver.json`, token JSON or CSS custom properties) |
| A single file | `./tokens.json`, `./src/theme.css` |
| An npm package | `npm:@acme/tokens@2.4.0`, `npm:@acme/tokens@^2` |
| A GitHub path at a ref | `github:owner/repo/tokens@v2.4.0` (a private repository needs `GITHUB_TOKEN` in the environment) |
| A saved snapshot | `./snapshot.json` from `scan --out` |

Formats it reads on its own: DTCG 2025.10 (with resolver documents and modes), older token JSON with `value` and `type` (token sets and theme files included), CSS custom properties with themes in `:root`, `[data-theme]`, `.dark` or `prefers-color-scheme`.

## Commands

| Command | What it answers |
|---|---|
| `diff <base> <head>` | What changed between two versions, theme by theme, and the semver bump the change needs |
| `diff <base> <head> --code <dir>` | The same, plus the places in the code each change breaks or alters |
| `upgrade-check <package> [--to <version>]` | In a project folder: what upgrading a token package from the version in use to `--to` (default latest) does to this project's code |
| `check <source> --code <dir>` | How much of the code is on tokens, values written by hand with the token to use instead, deprecated and unknown variables |
| `check <source>` | Problems in the tokens themselves: broken references, cycles, legacy syntax, naming collisions |

Code it reads with `--code`: CSS, SCSS, Sass and CSS modules; JS, TS, JSX and TSX (style objects, CSS-in-JS, Tailwind classes in `className`, `cn()`, `clsx()`, `cva()`); Vue, Svelte, Astro and HTML.

## Options

| Option | Use |
|---|---|
| `--format text\|markdown\|json` | `markdown` for reports and changelogs, `json` to act on findings one by one |
| `--out <file>` | Write the output to a file |
| `--fail-on major\|minor\|patch` | `diff`: exit 1 when the suggested bump is at least this |
| `--expand` | `check`: list every finding instead of collapsing repeated ones |
| `-c, --config <file>` | Config file (default `./dsgraph.config.json`) |

Exit codes: `0` ok · `1` check found errors, or diff reached `--fail-on` · `2` a usage or runtime error. Exit 1 is a result, not a failure of the tool: read the output.

## Declared renames

dsgraph detects renames from the same value in every theme and a similar name, with a confidence score. When the team knows a token was renamed, declare it so the report and every consumer get it right:

```json
{ "renames": { "color-danger": "color-critical" } }
```

in `dsgraph.config.json` next to the tokens. A rename still breaks consumers; declaring it turns "removed" into "renamed", with the new name to use.

## Findings in JSON

`check --format json` prints an array of findings. The fields the skills use:

```json
{
  "rule": "style/hardcoded-color",
  "severity": "warning",
  "message": "…",
  "evidence": { "value": "#2563eb", "property": "background-color", "source": "bg-[#2563eb]", "token": "color-accent", "replacement": "bg-accent", "exact": false },
  "loc": { "file": "components/Badge.tsx", "line": 3, "column": 21 }
}
```

`evidence.exact` says whether the token has exactly this value; when it is `false`, the token is only the closest one.

`evidence.replacement` is what to write instead:

- **For a Tailwind class** (`evidence.source` holds the class, like `bg-[#2563eb]`), it is the class to write: `bg-accent`, `p-(--space-md)`.
- **For CSS, SCSS and style objects**, it is the token's name (`color-bg`). Write it the way this code already reads tokens: `var(--color-bg)` in CSS and in style objects, with the system's prefix if it has one (`var(--ds-color-bg)`). A dotted name such as `color.text.default` is a custom property with the dots as dashes (`--color-text-default`); look at an existing `var(--…)` in the code to confirm the form before writing it.

## The system's variables in the code

`usage/unknown-token` (a variable that is not a token: a typo, a leftover old name) needs to know which variables belong to the design system. When the system's variables share a prefix, set it next to the tokens or the project:

```json
{ "code": { "prefix": "--ds-" } }
```

in `dsgraph.config.json`. Without a prefix, misspelt variables are not reported: compare the `var(--…)` names in the code with the tokens yourself, and ask the user before renaming one.

## Rules to keep

- Never edit the token files of a design system unless the user asked for it; these skills change the code that uses tokens, and report on the tokens.
- Never publish a package, push, or open a pull request without the user's go-ahead.
- Quote dsgraph's numbers as it prints them; do not round or restate them.

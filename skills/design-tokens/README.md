# Design tokens

Three agent skills for design tokens and the code that uses them. The agent decides what to do; [dsgraph](https://github.com/specsure/specsure), an open-source engine, does the checks, so the answers about what changed, what breaks and which token to use are exact rather than guessed.

| Skill | Use it to |
|---|---|
| `token-release-review` | Check a token release before publishing: what was removed, renamed or changed in each theme, the semver bump it needs, and the changelog section |
| `tokens-upgrade` | Upgrade a token package in an app: fix the renamed and removed tokens in the code, and list what will look different |
| `hardcoded-to-tokens` | Replace colors and sizes written by hand with the token made for each place, and measure how much of the code is on tokens |

They read DTCG 2025.10, older token JSON and CSS custom properties, from a folder, an npm package or a GitHub repository, and code in CSS, SCSS, Sass, JS/TS/JSX/TSX (style objects, CSS-in-JS, Tailwind), Vue, Svelte, Astro and HTML. Everything runs locally with `npx @dsgraph/cli`; nothing is uploaded. Node.js 20 or newer.

## Install

Claude Code:

```bash
/plugin marketplace add specsure/specsure
/plugin install design-tokens@specsure
```

Any agent that reads SKILL.md (Claude Code, Codex, Cursor, Gemini CLI and others): copy a folder from `skills/` into the agent's skills folder, for example `.claude/skills/`.

## Layout

- `skills/<name>/SKILL.md` — each skill, with `references/dsgraph-cli.md`, the CLI reference it reads.
- `shared/dsgraph-cli.md` — the source of that reference; `node ../build.mjs` copies it into every skill and packs `dist/design-tokens.zip`.

MIT license. The same checks run in the browser at [specsure.vercel.app](https://specsure.vercel.app): Token Diff and Token Fix.

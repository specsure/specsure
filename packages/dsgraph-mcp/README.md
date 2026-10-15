# @dsgraph/mcp

An MCP server that gives coding agents (Claude Code, Cursor and other MCP clients) the design tokens of your project. Its main job: when an agent is about to write `#3366ff` or `12px` in code, it asks which token holds that value and uses the token instead.

It reads DTCG 2025.10 (with resolver documents and themes), token JSON with `value` and `type` (including token sets and themes), and CSS custom properties, from a folder, an npm package or a GitHub repository. Every tool only reads.

## Install

Step-by-step setup for Claude Code, Claude Desktop, Cursor, VS Code, Windsurf and Codex, with the exact snippet for your tokens: [specsure.vercel.app/tools/mcp](https://specsure.vercel.app/tools/mcp).

Claude Code, with the project's tokens in `./tokens`:

```bash
claude mcp add dsgraph -- npx -y @dsgraph/mcp ./tokens
```

Any other MCP client, in its JSON config:

```json
{
  "mcpServers": {
    "dsgraph": { "command": "npx", "args": ["-y", "@dsgraph/mcp", "./tokens"] }
  }
}
```

The argument is the default source: a folder or file, `npm:@scope/tokens@2` or `github:owner/repo/tokens@main`. Without it the server reads the current folder. A `dsgraph.config.json` in the folder the server starts in is used too (`--config` points elsewhere).

## Tools

| Tool | What it answers |
|---|---|
| `find_token` | Which token holds this color, size, duration or font weight? Exact matches first: with `property` (`color`, `background-color`, `border-color`), the tokens made for it, then semantic tokens before the primitives they point to; otherwise the closest values (colors by ΔE, sizes in px across px and rem) |
| `get_token` | One token: its value in every theme, the references it takes the value from, the tokens that use it, description, deprecation, file |
| `search_tokens` | Tokens by part of the name or a glob (`color.text.*`) and by type, with their values |
| `describe_tokens` | An overview: tokens per type, themes and other modes, top-level groups, files |
| `check_styles` | CSS or SCSS the agent just wrote, or a style file or folder of the project: colors and spacing, radii and font sizes written by hand (with the token to use), deprecated and unknown design-system variables |
| `compare_versions` | What changed between two versions, what breaks and which semver bump the release needs; with `code`, the places in the project's styles that break or look different |
| `check_tokens` | Broken references, cycles, legacy syntax, naming collisions, ramps out of order, colors out of gamut |

Each tool takes an optional `source`, so an agent can also look at a package before upgrading it: "compare `npm:@scope/tokens@2` with `npm:@scope/tokens@3`".

Local files are read again on every call, so the answers follow your edits. Remote sources pinned to an exact version are cached for the session; others for five minutes.

## Example

```
find_token { "value": "#3366ff" }

color #3366ff in theme: default:
- #3366ff — exact: `color-accent` → color-blue-500, `color-blue-500`

Use `color-accent` instead of the literal value, or another token with the same value whose name fits the use.

find_token { "value": "0.875rem" }

dimension 0.875rem in theme: default:
- 16px — off by 2: `space-md`
- 8px — off by 6: `space-small`

No token matches exactly; the closest is `space-md`. Using a literal value here would bypass the design system.
```

Part of [dsgraph](https://github.com/specsure/specsure). MIT license.

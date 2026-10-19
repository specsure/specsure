# dsgraph-action

Compares the design tokens of a pull request with its base branch and reports what changed, what breaks and which version the release needs. The report goes into a pull request comment (updated on every push) and the job summary; the job can fail on breaking changes.

It reads DTCG 2025.10 files (with resolver documents and themes), token JSON with `value` and `type`, and CSS custom properties with themes. It is the [dsgraph](https://github.com/specsure/specsure) CLI in one file; the same comparison runs in the browser at [Token Diff](https://specsure.vercel.app/tools/diff).

**See it on a pull request:** [specsure/action-playground#1](https://github.com/specsure/action-playground/pull/1) removes a token and renames another, so the report is in the comment and the check fails on `fail-on: major`, as it should.

## Usage

```yaml
name: Design tokens
on: pull_request

permissions:
  contents: read
  pull-requests: write

jobs:
  tokens:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: specsure/dsgraph-action@v1
        with:
          path: tokens
          fail-on: major
```

The base is the same `path` at the pull request's base commit, read through the GitHub API, so the checkout needs no history.

### Compare with the published package

For a repository that publishes its tokens to npm, compare the pull request with the last release instead:

```yaml
      - uses: specsure/dsgraph-action@v1
        with:
          path: packages/tokens
          base: npm:@scope/tokens@latest
```

### With the code that uses the tokens

When the tokens and an app live in one repository, point `code` at the app. The comment then lists, under each change, the places in its code that break or look different (CSS, SCSS, Sass, JSX/TSX with style objects, CSS-in-JS and Tailwind classes, Vue, Svelte, Astro, HTML), checks the files the pull request touches and says how much of the code is on tokens: colors and sizes written by hand, with the token to use, and design-system variables that are deprecated or gone.

```yaml
      - uses: specsure/dsgraph-action@v1
        with:
          path: packages/tokens
          code: apps/web/src
```

### Upgrading a token package

In an app that depends on a token package, run it on pull requests that change the version (a Dependabot or Renovate update, or your own). The action reads the version before and after from the lockfile (npm, pnpm, yarn) or `package.json`, compares the two releases from npm and lists what the upgrade breaks or changes in your styles. Changes that do not reach your code become one line.

```yaml
name: Token upgrade
on:
  pull_request:
    paths: [package.json, package-lock.json, pnpm-lock.yaml, yarn.lock]

permissions:
  contents: read
  pull-requests: write

jobs:
  tokens:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: specsure/dsgraph-action@v1
        with:
          package: '@acme/tokens'
          code: src
          fail-on: major
```

## Inputs

| Input | Default | |
|---|---|---|
| `path` | `.` | Token folder or file: DTCG, a `*.resolver.json`, token JSON or CSS |
| `base` | the base commit | Any dsgraph source: `npm:pkg@range`, `github:owner/repo/path@ref` |
| `config` | `dsgraph.config.json` if present | Renames, layers, rules, thresholds |
| `fail-on` | — | Fail when the change is at least `major`, `minor` or `patch` |
| `comment` | `true` | One pull request comment, updated on every push; nothing is posted while there are no changes |
| `package` | — | A token package this repository depends on: compares its version before and after the pull request and reports what the upgrade changes in the code |
| `code` | — | Folder with the code that uses the tokens: places each change reaches, and style checks on the files the pull request touches |
| `checks` | `true` | Add checks on the new version: broken references, legacy syntax and others |
| `github-token` | `${{ github.token }}` | For the comment and for reading the base commit |

## Outputs

`level` (`major`, `minor`, `patch` or `none`), `changes` (direct changes), `breaking` (breaking changes) and, with `code`, `code-breaks` (places in the code that a removed or renamed token breaks).

```yaml
      - id: tokens
        uses: specsure/dsgraph-action@v1
      - if: steps.tokens.outputs.level == 'major'
        run: echo "This release needs a major version"
```

## Pull requests from forks

GitHub gives workflows on forks a read-only token, so the comment cannot be written. The job then warns and keeps the report in the job summary.

## Source

This repository is generated from [`packages/dsgraph-action`](https://github.com/specsure/specsure/tree/main/packages/dsgraph-action) in `specsure/specsure`; open issues and pull requests there. MIT license; the knowledge pack built into `dist/index.mjs` has its own license, [LICENSE-knowledge](LICENSE-knowledge).

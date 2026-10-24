---
name: token-release-review
description: Review a design token release before it is published - what was removed, renamed or changed in each theme, the semver bump it needs, and a changelog section - using the open-source dsgraph engine instead of reading JSON diffs. Use when the user is about to release, version or tag a design system or token package, asks "is this a major?", "what breaks in this release?", "write the changelog for the tokens", or reviews a pull request that changes tokens.
summary: Catch breaking token changes before you publish, get the right semver bump and a ready changelog section.
version: 1.0.0
tags: [design-tokens, design-systems, dtcg, semver, changelog, release]
use_cases:
  - Check a token release before publishing it
  - Decide whether a token change is major, minor or patch
  - Write the changelog section for a token release
  - Review a pull request that changes design tokens
docs_url: https://specsure.vercel.app/tools/diff/guide
---

# Token release review

A JSON diff hides what hurts the people who use a design system: a rename looks like a removal and an addition, a changed base color silently changes every token that refers to it, a value can change in the dark theme only, and the version number is a guess. dsgraph reads both versions the way a consumer would and judges each change by its effect. Your job is to run it, read the verdict, put the doubtful calls in front of a human, and write the changelog.

Read `references/dsgraph-cli.md` first: how to run the CLI, the source forms and the options.

## 1. Find the two versions

- **Head** is the release being prepared: usually the tokens folder in the working tree (`./tokens`, `./src/tokens`, a `*.tokens.json` file, a CSS file of custom properties, or what `package.json` `files`/`exports` ship).
- **Base** is the last published version. In order of preference:
  1. the published npm package: `npm:<name>@<last version>` (`npm view <name> version` gives it);
  2. the last release tag on GitHub: `github:owner/repo/<path>@<tag>`;
  3. a folder checked out from the last tag: `git worktree add ../tokens-base <tag>`.

If you cannot tell which files are the tokens or which version was last published, ask. Comparing the wrong pair gives a confident, wrong report.

If the package ships many files (CSS and JSON builds of the same tokens), compare one of them, the source of truth, on both sides.

## 2. Run the comparison

```bash
npx -y @dsgraph/cli@0.9 diff <base> <head> --format markdown --out release-report.md
```

If the user also has an app that uses the tokens, add `--code <app dir>` to see the places in that code each change reaches.

Read the whole report. It opens with the verdict (breaking, minor, patch or no impact) and the counts, then groups changes by meaning: Breaks, Looks different, New, Deprecated, Hard to notice.

## 3. Check the version number

Compare the suggested bump with the version the release is about to get (`package.json`, a changeset, the release branch name):

- **Planned bump lower than suggested** (a minor with removals or renames): stop and tell the user before anything else. This is the mistake the review exists to catch. Do not change the version yourself; offer the two ways out: release a major, or keep the old names as deprecated aliases for one more minor.
- **Planned bump higher than suggested**: say so; it is allowed, but consumers will be asked to do a major upgrade for nothing.

## 4. Put the doubtful calls in front of a human

dsgraph is exact about values and references; names are where it can only infer. List these for the user, each with what you would decide and why:

- **Renames under 80% confidence.** The report says "A guess from the same value and a similar name (NN%): check it."
- **A removal with a new token of the same value** in the same release (`color-danger` removed, `color-critical` added with the same value): probably a rename dsgraph could not match by name. If the user confirms, declare it in `dsgraph.config.json` (`"renames": { "old": "new" }`, see `references/dsgraph-cli.md`) and run the comparison again.
- **Changes only in one theme.** Easy to miss in review; make sure they are intended.
- **Value changes listed as noticeable** that the release notes do not mention.

Do not decide these yourself and move on: a wrong rename in a changelog sends every consumer to the wrong token.

## 5. Write the changelog section

Start from the report: it is grouped by impact and written for people who use the tokens. Then:

- Keep the dsgraph lines and numbers as they are.
- For every removed or renamed token, add what to use instead. Take it from a declared rename or from the user; if neither says, write `TODO: replacement` rather than inventing one.
- Add one line of why only if the user or the pull request says why. Do not invent reasons.
- Put it where the project keeps its changelog (`CHANGELOG.md`, a changeset file, the release draft), in the project's existing format.

## 6. Report back

Tell the user, in this order:

1. The verdict and the bump it needs, and whether the planned version matches.
2. The decisions waiting for them from step 4.
3. Where the changelog section is.

If the project has no check in CI, mention that the same comparison can run on every pull request with the dsgraph GitHub Action (`specsure/dsgraph-action@v1` with `fail-on: major`); do not add it unless asked.

## What not to do

- Do not edit the tokens, the version number or the release, and do not publish or tag. The review informs the release; the user makes it.
- Do not summarise the report in your own numbers. Quote dsgraph.
- Do not call a change "safe" because dsgraph lists it as a patch: say what it is (a color change under ΔE 1, a size change under half a pixel).

---
name: tokens-upgrade
description: Upgrade a design token package in an app safely - find every place in the code the new version breaks or changes, fix the renamed and removed tokens, and list what will look different - using the open-source dsgraph engine. Use when the user wants to bump or upgrade a design system or token package (for example "@acme/tokens", "@primer/primitives"), asks "what breaks if we update the tokens?", reviews a Dependabot or Renovate pull request for a token package, or finds styles broken after an upgrade.
summary: Upgrade a token package without silent breakage - fix renamed and removed tokens in your code, see what looks different.
version: 1.0.0
tags: [design-tokens, design-systems, upgrade, dependencies, css, tailwind]
use_cases:
  - Upgrade a design system or token package in an app
  - Review a dependency bump of a token package
  - Fix styles that broke after a token upgrade
  - See which screens look different after an upgrade
docs_url: https://specsure.vercel.app/tools/diff/guide
---

# Tokens upgrade

When a token package removes or renames a token, nothing fails: in CSS a variable that no longer exists makes the property invalid, with no build error and no console warning, and a Tailwind class for a missing token is simply not generated. The upgrade looks clean and the UI quietly loses a shadow, a radius or a color. dsgraph compares the version the project uses with the new one and lists the places in this project's code that break or change. Your job is to run it, fix what breaks, show what changes, and check again.

Read `references/dsgraph-cli.md` first: how to run the CLI, the source forms and the options.

## 1. Find the package and the versions

- The token package: in `package.json` dependencies, the one the styles import (`@import "…/tokens.css"`, a Tailwind preset, `var(--…)` names that match it). If several packages could be it, ask.
- The version in use: dsgraph reads it from `node_modules`, the lockfile or `package.json`.
- The target: the version the user named, the one in the Dependabot or Renovate pull request, or the latest.
- The code: the folders with styles and components (`src`, `app`, `components`). Default is the project folder.

## 2. See what the upgrade does to this project

From the project folder:

```bash
npx -y @dsgraph/cli@0.9 upgrade-check <package> --to <version> --code <dir> --format markdown --out upgrade-report.md
```

The report starts with the verdict for the release, then **In your code**: each place that breaks, and each place that will look different, with file and line. Changes that do not reach the code are counted at the end; leave them alone.

If nothing in the code is reached, say so and stop: the upgrade is safe for this project's styles.

## 3. Fix what breaks

Work through the "breaks" rows one by one:

- **Renamed token** (`breaks: renamed to space-small`): replace the old name with the new one everywhere this project uses it, in the code's own form: `var(--space-sm)` → `var(--space-small)`, `p-(--space-sm)` → `p-(--space-small)`, a JS token import or a theme key. Search for every form of the old name, not only the lines in the report: the report shows where dsgraph found it, and a dynamic class or a string built at runtime can hide another use.
- **Removed token with a replacement** the release names (a deprecation note, the changelog, a new token with the same value in the report's New section): use it, and tell the user which replacement you took and from where.
- **Removed token with no replacement**: do not pick one yourself. Show the user what it was (the report gives its old value) and the closest candidates; let them choose. A removed `shadow.floating.legacy` might deliberately have no successor.

Do not change the meaning while fixing: if the old token was a hover color, the new one must be a hover color too, even if another token has the same value.

## 4. Bump the dependency

Update the package with the project's own package manager (`npm install <pkg>@<version>`, `pnpm add`, `yarn add`, `bun add`), so the lockfile follows. Do not switch package managers. If the user only asked what the upgrade would do, stop before this step and report.

## 5. Check again

After the fixes and the bump, run the comparison again with both versions named, so it does not depend on what is installed:

```bash
npx -y @dsgraph/cli@0.9 diff npm:<package>@<old version> npm:<package>@<new version> --code <dir> --format markdown
```

No "breaks" rows may remain under **In your code**. If one does, fix it as in step 3 and run again. A row left on purpose (a removed token the user is still deciding about) stays in the report, marked as waiting.

Also search the code for every old name from step 2 in its other forms (a Tailwind class, a JS import, a string built at runtime): dsgraph finds the uses it can read, and a dynamic class can hide one.

Do not use `check` against the package for this step. Without the system's variable prefix it does not flag a variable that no longer exists, and it also prints findings about the package's own token files, which are not this project's to fix.

Run the project's own build and tests if it has them.

## 6. Report back

1. What the upgrade changed in the release (the verdict line), and what reached this project.
2. What you fixed: each old name → new name, with the number of places.
3. Decisions waiting for the user: removed tokens with no replacement.
4. **What will look different**: the report's "looks different" rows, grouped by screen or component where the file names make it clear. These are not errors, and you did not change them; someone should look at these screens before release. Mention the theme when a change is in one theme only.

## What not to do

- Do not edit the token package or `node_modules`.
- Do not hard-code the old value to "keep things as they were": that takes the code off tokens. If the user wants the old look, they decide it with the design system team.
- Do not merge, push or open a pull request without the user's go-ahead.

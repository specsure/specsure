---
name: hardcoded-to-tokens
description: Find colors, sizes and other values written by hand in an app's code and replace them with the design system's tokens - the token made for that use (text, background, border, state, component), not just one with the same value - using the open-source dsgraph engine. Use when the user asks to "use our tokens instead of hard-coded values", clean up hex colors and pixel values, check generated or prototype code against the design system, raise token coverage, or fix misspelt or deprecated CSS variables.
summary: Put hand-written colors and sizes back on your design tokens, the right token for each place, and measure coverage before and after.
version: 1.0.0
tags: [design-tokens, design-systems, css, tailwind, refactoring, code-quality]
use_cases:
  - Replace hard-coded colors and sizes with design tokens
  - Check AI-generated or prototype code against a design system
  - Measure how much of the code is on tokens
  - Fix misspelt, unknown or deprecated CSS variables
docs_url: https://specsure.vercel.app/tools/fix/guide
---

# Hard-coded values to tokens

A value written by hand does not follow the design system: it stays the same in the dark theme and in the next release. Replacing it is harder than it looks, because one value often belongs to several tokens: the same blue can be the accent text, the accent background and the accent border, and the wrong one breaks the day a theme changes it. dsgraph picks the token by where the value is written: the CSS property, the state (`:hover`, `disabled:`), the component. Your job is to run it, apply the replacements it is sure of, bring the rest to the user, and measure the result.

Read `references/dsgraph-cli.md` first: how to run the CLI, the source forms and the options.

## 1. Find the tokens and the code

- **The tokens:** the design system package in `package.json`, a tokens folder, or the CSS file that defines the custom properties (`:root { --color-… }`), or Tailwind's `@theme`. If there are several candidates, or none, ask. Without the right tokens every answer is wrong.
- **The code:** the folders with styles and components. Leave out generated files, vendored libraries and the token definitions themselves.

## 2. Measure

```bash
npx -y @dsgraph/cli@0.9 check <tokens> --code <dir>
```

Note the last line, `On tokens: NN% of the design values in the code (A from tokens, B written by hand)`: it is the "before" number for the report.

Then get the findings to act on:

```bash
npx -y @dsgraph/cli@0.9 check <tokens> --code <dir> --format json --expand --out findings.json
```

The output also has findings about the tokens themselves (`dtcg/*`, `palette/*`, `naming/*`, `context/*`, `token/unused`). They are for the design system team, not for this code: leave them out of the edits and mention them only if the user owns the tokens.

The rules that concern the code:

| Rule | Means |
|---|---|
| `style/hardcoded-color` | A color written by hand |
| `style/off-scale` | A spacing, radius or font size that is not on the system's scale |
| `usage/unknown-token` | A variable that is not a token: a typo, a leftover old name, or the code's own variable. Reported only when dsgraph knows the system's prefix (see the reference) |
| `usage/deprecated` | A token on its way out, with its replacement |

## 3. Replace what is certain

For each `style/hardcoded-color` and `style/off-scale` finding with `evidence.exact: true`, replace the value at `loc.file:loc.line` with `evidence.replacement`: for a Tailwind class it is the class to write (`bg-accent`, `p-(--space-md)`); for CSS and style objects it is the token's name, which you write the way this code already reads tokens (`var(--color-bg)`; see "Findings in JSON" in the reference). Keep everything else on the line as it is.

For `usage/deprecated`, use the replacement the message names.

Group the edits by file and make them in one pass per file.

## 4. Bring the rest to the user

Do not apply these silently; list them with your recommendation:

- **No exact token** (`exact: false`, "closest is …"). The difference is in the finding (ΔE for colors, pixels for sizes). Very small differences are usually a value copied slightly off and the closest token is right; larger ones may be a value the system is missing. Ask; do not round the design to the nearest token on your own.
- **The same value used in many places with no token.** That is a candidate for a new token for the design system team, not something to fix in this code.
- **`usage/unknown-token`.** A typo (`--ds-color-txet`): propose the token with the nearest name and ask. The code's own variable (a prototype's palette, a local `--sp-accent`): replacing its uses, or redefining it through the system's tokens, is the user's call.

## 5. Measure again

Run step 2's first command again and report the coverage before and after, as dsgraph prints it, plus anything new it found.

## 6. Report back

1. Coverage before → after.
2. What you replaced: value → token, with the number of places, grouped by file or component.
3. Decisions waiting for the user (step 4), each with your recommendation.
4. Values the system seems to be missing, worded as a proposal the user can pass to the design system team.

## What not to do

- Do not edit the token definitions to make a value "fit".
- Do not replace a value with a token of the same value but another purpose (a text token for a background). dsgraph's choice already accounts for this; if you override it, say why.
- Do not touch values that are not design values (`0`, `100%`, `auto`, `1px` hairlines the system has no token for) unless dsgraph reports them.

# Community page

The text for the plugin's page in Figma Community. Icon: `icon.png` (128×128). Cover: `cover.png` (1920×1080).

## Name

Specsure Token Export

Figma shows the name and the icon in the plugin's title bar, so the plugin itself carries no logo: its tabs run across the top.

## Tagline

DTCG 2025.10 tokens with modes, references and a resolver. Reads only, works offline.

## Description

Plain text, ready to paste: Figma's editor doesn't turn Markdown into formatting.

Export your file's variables and styles as design tokens in DTCG 2025.10, the W3C Design Tokens format.

What you get
• A .zip with a file per collection, or per mode for a collection with modes, styles in their own file, and a DTCG resolver that ties the collections and modes together.
• Or one file, with every mode inside its token, for tools that read one file.

What it keeps
• References between variables stay references, {color.blue.500}, across collections.
• Modes become a resolver modifier, the default mode first.
• Descriptions, scopes, code syntax and variable ids go into $extensions.
• Extended collections are written with everything they inherit and their overrides.
• A value from a library is written in place, with the library variable's name kept.

Types it gets right
• Numbers become dimensions in px when their scopes say they are lengths. A value with no scopes takes its type from the variables that refer to it, so a primitive used for font sizes becomes a dimension.
• Opacities, which Figma keeps in percent, become fractions: 50 → 0.5.
• Font style names (Semi Bold) become font weights (600).
• Timings are written in ms, easings as cubic Béziers, Figma's back curves included.
• Text styles become typography, with the line height as a multiple of the size, as DTCG asks.
• Effect styles become shadows, color styles colors or gradients, and grid styles a group of their numbers.
• Names follow DTCG: a dot in a name becomes a dash, so references never break.

Whatever has no DTCG type is listed after reading, with the reason: plain strings, booleans, springs, blur effects, styles of several paints.

Private by design
The plugin reads the open file and never changes it. It has no network access, so the tokens go only where you save them.

Then
Drop the .zip or the one file into Token Diff to see what a token release breaks, or into Token Fix to find the token meant for a value in your code. Both run in the browser on specsure.vercel.app. You can also run the open-source dsgraph CLI or the GitHub Action on the exported folder.

Open source, MIT: github.com/specsure/specsure

## Tags

design tokens, dtcg, tokens, variables, export, design system, json, styles, typography, developer handoff

## Support

github.com/specsure/specsure/issues

# Playground file

The Community file the plugin's page links to as its playground. Cover: the `Thumbnail` frame on the file's Try it page.

## Name

Specsure Token Export — Playground

## Description

A small design system to try Specsure Token Export on. Duplicate the file, run the plugin and see how its variables and styles become DTCG 2025.10 design tokens.

What is inside
• Primitives: colors, spacing, radii, font sizes, a font family and weights. They have no scopes, so the plugin types each one from the variables that refer to it.
• Theme, Light and Dark: semantic colors that refer to primitives, and a scrim made of a color and an opacity.
• Density, Desktop and Mobile: padding, gaps, a corner radius and font sizes, each a reference to a primitive.
• Motion: durations, easings with a back curve and a custom Bézier, a spring and a boolean flag.
• Nine styles: three text styles bound to variables, a shadow and a blur, a color and a gradient, two layout grids.
• A sample card built on these variables, shown in Light · Desktop and Dark · Mobile.

Try it
1. Duplicate the file and open Plugins → Specsure Token Export → Read file.
2. See what it found: four collections with their modes, nine styles, and notes on what DTCG has no type for (the spring, the flag, the blur).
3. Download the .zip or the one file and drop it into Token Diff or Token Fix on specsure.vercel.app.

Change a value or a mode, export again, and drop both exports into Token Diff to see what the change breaks.

## Tags

design tokens, dtcg, variables, modes, design system, playground

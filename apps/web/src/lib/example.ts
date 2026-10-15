import type { DroppedFile } from './types'

/** A small synthetic design system in two versions: renames, removals, color shifts and a dark theme. */
const v1 = `:root {
  --color-blue-500: #2563eb;
  --color-blue-600: #1d4ed8;
  --color-gray-50: #f9fafb;
  --color-gray-900: #111827;
  --color-red-500: #ef4444;
  --color-bg: var(--color-gray-50);
  --color-text: var(--color-gray-900);
  --color-accent: var(--color-blue-500);
  --color-accent-hover: var(--color-blue-600);
  --color-danger: var(--color-red-500);
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --radius-md: 6px;
  --shadow-card: 0 1px 2px rgba(0, 0, 0, 0.08);
  --font-body: Inter, system-ui, sans-serif;
  --duration-fast: 120ms;
}

[data-theme="dark"] {
  --color-bg: var(--color-gray-900);
  --color-text: var(--color-gray-50);
  --color-accent: #60a5fa;
}
`

const v2 = `:root {
  --color-blue-500: #3366ff;
  --color-blue-600: #1d4ed8;
  --color-gray-50: #f9fafb;
  --color-gray-900: #0b0f19;
  --color-red-500: #ef4444;
  --color-bg: var(--color-gray-50);
  --color-text: var(--color-gray-900);
  --color-accent: var(--color-blue-500);
  --color-accent-hover: var(--color-blue-600);
  --color-critical: var(--color-red-500);
  --space-small: 8px;
  --space-md: 16px;
  --space-lg: 28px;
  --radius-md: 8px;
  --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.1);
  --font-body: Inter, system-ui, sans-serif;
  --duration-fast: 120ms;
  --duration-slow: 320ms;
}

[data-theme="dark"] {
  --color-bg: var(--color-gray-900);
  --color-text: var(--color-gray-50);
  --color-accent: #7aa2ff;
}
`

export const EXAMPLE: { base: DroppedFile[]; head: DroppedFile[] } = {
  base: [{ path: 'tokens.css', text: v1 }],
  head: [{ path: 'tokens.css', text: v2 }],
}

/**
 * A small app on the example's first version, as a designer builds it in code with Tailwind 4:
 * classes on tokens, a few values written by hand, a style object. For the home page's code figure.
 */
export const EXAMPLE_APP: DroppedFile[] = [
  {
    path: 'components/Button.tsx',
    text: `export function Button({ danger, children }) {
  return (
    <button
      className={cn(
        "rounded-md px-4 py-2 text-sm font-medium",
        danger ? "bg-danger text-bg" : "bg-accent text-bg hover:bg-accent-hover",
      )}
    >
      {children}
    </button>
  )
}
`,
  },
  {
    path: 'components/Card.tsx',
    text: `export function Card({ title, children }) {
  return (
    <section className="rounded-md bg-bg p-(--space-sm) shadow-card">
      <h3 className="text-text font-semibold">{title}</h3>
      {children}
    </section>
  )
}
`,
  },
  {
    path: 'components/Badge.tsx',
    text: `export function Badge({ children }) {
  return (
    <span className="rounded-[6px] bg-[#2563eb] px-[15px] text-bg">
      {children}
    </span>
  )
}
`,
  },
  {
    path: 'components/Banner.tsx',
    text: `export function Banner({ children }) {
  return (
    <div style={{ background: '#f9fafb', color: '#111827', padding: 24 }}>
      {children}
    </div>
  )
}
`,
  },
]

/** A DTCG file written the pre-2025 way, for the guide's checks figure: legacy strings and a broken reference. */
export const LEGACY_EXAMPLE: DroppedFile[] = [
  {
    path: 'tokens.json',
    text: JSON.stringify(
      {
        color: {
          $type: 'color',
          red: { $value: '#e5484d' },
          orange: { $value: '#f76b15' },
          green: { $value: '#30a46c' },
          blue: { $value: '#0090ff' },
          violet: { $value: '#6e56cf' },
          link: { $value: '{color.indigo}' },
        },
        space: {
          $type: 'dimension',
          sm: { $value: '4px' },
          md: { $value: '8px' },
          lg: { $value: '16px' },
        },
      },
      null,
      2,
    ),
  },
]

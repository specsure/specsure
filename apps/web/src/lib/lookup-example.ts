import type { DroppedFile } from './types'

/**
 * A small three-layer design system for Token Fix's example: a palette of raw values, semantic tokens
 * that say what a value is for (and that the dark theme redefines), and component tokens that take
 * their values from the semantic ones only. The same blue is the accent text, the accent background
 * and the accent border, so the page has something to choose.
 */
const css = `:root {
  /* Palette: raw values with no purpose. Code never references them. */
  --blue-50: #eff6ff;
  --blue-400: #60a5fa;
  --blue-500: #3b82f6;
  --blue-600: #2563eb;
  --blue-700: #1d4ed8;
  --gray-0: #ffffff;
  --gray-50: #f8fafc;
  --gray-100: #f1f5f9;
  --gray-200: #e2e8f0;
  --gray-400: #94a3b8;
  --gray-500: #64748b;
  --gray-700: #334155;
  --gray-800: #1e293b;
  --gray-900: #0f172a;
  --red-50: #fef2f2;
  --red-600: #dc2626;

  /* Semantic: what a value is for. Themes redefine this layer. */
  --text-default: var(--gray-900);
  --text-muted: var(--gray-500);
  --text-accent: var(--blue-600);
  --text-danger: var(--red-600);
  --text-on-accent: var(--gray-0);

  /* The page, and the surfaces raised above it: cards, popovers. */
  --bg-default: var(--gray-0);
  --bg-raised: var(--gray-0);
  --bg-subtle: var(--gray-50);
  --bg-accent: var(--blue-600);
  --bg-accent-hover: var(--blue-700);
  --bg-danger: var(--red-600);
  --bg-danger-subtle: var(--red-50);
  --bg-hover: var(--gray-100);
  --bg-disabled: var(--gray-100);
  --bg-selected: var(--blue-50);

  --border-default: var(--gray-200);
  --border-accent: var(--blue-600);
  --border-focus: var(--blue-500);
  --border-danger: var(--red-600);

  --shadow-card: 0 1px 3px rgba(15, 23, 42, 0.12);
  --shadow-popover: 0 8px 24px rgba(15, 23, 42, 0.16);
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --radius-sm: 4px;
  --radius-md: 8px;
  --font-body: Inter, system-ui, sans-serif;

  /* Components: one component's values, taken from the semantic layer only. */
  --button-bg: var(--bg-accent);
  --button-bg-hover: var(--bg-accent-hover);
  --button-text: var(--text-on-accent);
  --card-bg: var(--bg-raised);
}

/* The dark theme redefines semantic tokens only, from the same palette. */
[data-theme="dark"] {
  --text-default: var(--gray-50);
  --text-muted: var(--gray-400);
  --text-accent: var(--blue-400);
  --bg-default: var(--gray-900);
  --bg-raised: var(--gray-800);
  --bg-subtle: var(--gray-800);
  --bg-hover: var(--gray-700);
  --border-default: var(--gray-700);
}
`

export const LOOKUP_EXAMPLE: DroppedFile[] = [{ path: 'tokens.css', text: css }]

/**
 * A small app on the example, for the guide's code figure: a button in Tailwind with the accent
 * written by hand, a card in CSS with one size off the scale and a misspelt variable, and an alert
 * with a style object.
 */
export const LOOKUP_APP: DroppedFile[] = [
  {
    path: 'components/Button.tsx',
    text: `export function Button({ children }) {
  return (
    <button className="rounded-[8px] bg-[#2563eb] px-[16px] py-[8px] text-white hover:bg-[#1d4ed8]">
      {children}
    </button>
  )
}
`,
  },
  {
    path: 'components/card.css',
    text: `.card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 20px;
}
.card__title {
  color: var(--text-defualt);
}
.card__meta {
  color: #64748b;
}
.card__link {
  color: var(--text-accent);
}
`,
  },
  {
    path: 'components/Alert.tsx',
    text: `export function Alert({ children }) {
  return <div style={{ color: '#dc2626', background: '#fef2f2', padding: 12 }}>{children}</div>
}
`,
  },
]

import type { DroppedFile } from './types'

/**
 * A small two-layer design system for Token Lookup's example: a palette, semantic tokens for text,
 * backgrounds, borders and states, a few component tokens and a dark theme. The same blue is the
 * accent text, the accent background and the accent border, so the page has something to choose.
 */
const css = `:root {
  --blue-50: #eff6ff;
  --blue-500: #3b82f6;
  --blue-600: #2563eb;
  --blue-700: #1d4ed8;
  --gray-0: #ffffff;
  --gray-50: #f8fafc;
  --gray-100: #f1f5f9;
  --gray-200: #e2e8f0;
  --gray-500: #64748b;
  --gray-900: #0f172a;
  --red-50: #fef2f2;
  --red-600: #dc2626;

  --text-default: var(--gray-900);
  --text-muted: var(--gray-500);
  --text-accent: var(--blue-600);
  --text-danger: var(--red-600);
  --text-on-accent: var(--gray-0);

  --bg-default: var(--gray-0);
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

  --button-bg: var(--bg-accent);
  --button-bg-hover: var(--bg-accent-hover);
  --button-text: var(--text-on-accent);
  --card-bg: var(--bg-default);

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
}

[data-theme="dark"] {
  --text-default: var(--gray-50);
  --text-muted: #94a3b8;
  --text-accent: #60a5fa;
  --bg-default: var(--gray-900);
  --bg-subtle: #1e293b;
  --bg-hover: #1e293b;
  --border-default: #334155;
}
`

export const LOOKUP_EXAMPLE: DroppedFile[] = [{ path: 'tokens.css', text: css }]

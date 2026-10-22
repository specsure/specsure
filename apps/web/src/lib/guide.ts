/** The guide's pages in reading order, by address without the language prefix. Labels are in `messages.site.guide`. */
export const GUIDE = [
  { path: '/guide', key: 'start' },
  { path: '/tools/diff/guide', key: 'diff' },
  { path: '/tools/fix/guide', key: 'fix' },
  { path: '/tools/figma', key: 'figma' },
] as const

export type GuidePage = (typeof GUIDE)[number]['key']

export const inGuide = (path: string): boolean => GUIDE.some((p) => p.path === path)

/** The Figma Community page of the plugin. */
export const PLUGIN_URL = 'https://www.figma.com/community/plugin/1695092493524469402'

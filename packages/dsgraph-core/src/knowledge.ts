/**
 * Words dsgraph reads token and file names by. The engine carries a small neutral vocabulary that
 * any front-end developer would write; a knowledge pack (`dsgraph/knowledge@1`) adds to it. The
 * pack is data, not code: the engine works the same without it, with fewer names understood.
 */

/** What a color is for, by words in a token's name. */
export type Role = 'text' | 'background' | 'border' | 'shadow'

export interface Vocabulary {
  /** Words that name a role: `fg` and `text` for text, `bg` and `surface` for a background. */
  roles: Record<Role, string[]>
  /** Words in a token's name that name a state, and the state: `hover` → `hover`. */
  states: Record<string, string>
  /** Words that name the resting state: `button.bgColor.rest` is for no state. */
  rest: string[]
  /** Words that mark the system's default of several equal tokens: `bg.default` before `bg.raised`. */
  defaults: string[]
  /** File, folder and class names that say nothing about the component: `index`, `styles`, `root`. */
  generic: string[]
}

/** A knowledge pack: what is known about how design systems name things, beyond the defaults. */
export interface Knowledge {
  schema: 'dsgraph/knowledge@1'
  /** The pack's own version. */
  version: string
  /** Added to the default vocabulary, never replacing it. */
  vocabulary?: {
    roles?: Partial<Record<Role, string[]>>
    states?: Record<string, string>
    rest?: string[]
    defaults?: string[]
    generic?: string[]
  }
}

export const DEFAULT_VOCABULARY: Vocabulary = {
  roles: {
    text: ['fg', 'foreground', 'text', 'ink', 'content', 'on', 'link', 'icon'],
    background: ['bg', 'background', 'surface', 'canvas', 'fill', 'container', 'layer', 'backdrop'],
    border: ['border', 'stroke', 'outline', 'divider', 'separator', 'ring'],
    shadow: ['shadow', 'elevation'],
  },
  states: {
    hover: 'hover',
    focus: 'focus',
    active: 'active',
    disabled: 'disabled',
    selected: 'selected',
    visited: 'visited',
  },
  rest: ['rest'],
  defaults: ['default'],
  generic: [
    'index',
    'style',
    'styles',
    'main',
    'app',
    'global',
    'globals',
    'base',
    'reset',
    'util',
    'utils',
    'utilities',
    'common',
    'shared',
    'theme',
    'themes',
    'tokens',
    'variables',
    'vars',
    'mixins',
    'snippet',
    'root',
    'container',
    'wrapper',
    'inner',
    'src',
    'lib',
    'components',
    'ui',
    'css',
    'scss',
    'sass',
    'assets',
    'pages',
    'views',
  ],
}

/** A vocabulary ready to match normalized names (`bg.color.hover`). */
export interface CompiledVocabulary {
  roles: Record<Role, RegExp>
  states: Map<string, string>
  rest: Set<string>
  defaults: Set<string>
  generic: Set<string>
}

const ROLES: Role[] = ['text', 'background', 'border', 'shadow']
const literal = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const words = (list: string[]) => list.map((w) => w.toLowerCase())

function compile(v: Vocabulary): CompiledVocabulary {
  const roles = {} as Record<Role, RegExp>
  for (const r of ROLES) roles[r] = new RegExp(`(^|\\.)(${words(v.roles[r]).map(literal).join('|')})(\\.|$)`)
  return {
    roles,
    states: new Map(Object.entries(v.states).map(([w, s]) => [w.toLowerCase(), s])),
    rest: new Set(words(v.rest)),
    defaults: new Set(words(v.defaults)),
    generic: new Set(words(v.generic)),
  }
}

const BASE = compile(DEFAULT_VOCABULARY)
const compiled = new WeakMap<Knowledge, CompiledVocabulary>()

/** Checks that a value is a knowledge pack dsgraph can read; throws a readable error if not. */
export function readKnowledge(value: unknown): Knowledge {
  const k = value as Knowledge
  if (!k || typeof k !== 'object' || k.schema !== 'dsgraph/knowledge@1')
    throw new Error('Not a dsgraph knowledge pack: expected schema "dsgraph/knowledge@1"')
  const v = k.vocabulary ?? {}
  const lists = [...Object.values(v.roles ?? {}), v.rest ?? [], v.defaults ?? [], v.generic ?? []]
  if (!lists.every((l) => Array.isArray(l) && l.every((w) => typeof w === 'string')))
    throw new Error('Knowledge pack: vocabulary lists must be arrays of words')
  if (!Object.values(v.states ?? {}).every((s) => typeof s === 'string'))
    throw new Error('Knowledge pack: vocabulary.states maps words to state names')
  return k
}

/** The default vocabulary, with a pack's words added. */
export function vocabularyOf(knowledge?: Knowledge): CompiledVocabulary {
  if (!knowledge?.vocabulary) return BASE
  let c = compiled.get(knowledge)
  if (!c) {
    const add = knowledge.vocabulary
    const d = DEFAULT_VOCABULARY
    c = compile({
      roles: Object.fromEntries(ROLES.map((r) => [r, [...d.roles[r], ...(add.roles?.[r] ?? [])]])) as Record<
        Role,
        string[]
      >,
      states: { ...d.states, ...add.states },
      rest: [...d.rest, ...(add.rest ?? [])],
      defaults: [...d.defaults, ...(add.defaults ?? [])],
      generic: [...d.generic, ...(add.generic ?? [])],
    })
    compiled.set(knowledge, c)
  }
  return c
}

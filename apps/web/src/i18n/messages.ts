import type { Change, Level } from '@dsgraph/core'
import { count, type Forms, type Lang, num, plural } from './index'

/**
 * Interface text in English and Russian. The Russian is written for Russian-speaking designers
 * and developers, not translated word for word: it keeps the terms they use (токены, тема,
 * semver), agrees words with numbers and uses Russian typography (« », —, non-breaking spaces).
 * Engine messages (check findings, the Markdown report) stay in English, like a CLI's output.
 */

type KindLabels = Record<Change['kind'], string>
type LevelText = Record<Level, string>

const en = {
  lang: 'en' as Lang,
  langName: 'English',
  switchTo: 'Русский',
  switchLabel: 'Читать по-русски',

  site: {
    nav: { diff: 'Token Diff', guide: 'Guide', mcp: 'MCP', cli: 'CLI', github: 'GitHub', about: 'About' },
    footer: 'Specsure, MIT license',
    source: 'Source',
    about: {
      label: 'About Specsure',
      close: 'Close',
      lead: 'Tools for design systems. Token Diff shows what changed between two versions of your tokens, what breaks and which version to release.',
      points: [
        'Compares two versions of design tokens: DTCG, token JSON and CSS custom properties',
        'Shows what breaks, theme by theme, and suggests the semver bump',
        'Reads npm packages, GitHub repositories or your own files',
        'Exports Markdown for changelogs and pull requests, and a card for posts',
        'Runs entirely in your browser: no sign-up, nothing is uploaded',
        'Open source under MIT; the engine is published as dsgraph',
      ],
      soon: 'Soon',
      soonText: 'Figma plugin: check variables and styles against your tokens, inside Figma.',
      guide: 'Read the guide',
      github: 'Source on GitHub',
      madeBy: 'Made by',
      owners: 'Package and design-system names belong to their owners. Specsure is not affiliated with them.',
    },
  },

  home: {
    title: 'Specsure · tools for design systems',
    description:
      'Open-source tools for design systems: Token Diff shows what a token release changes and breaks. No account, no server.',
    h1: 'Know what your design system release breaks',
    lead: 'Open-source tools for design systems. No account and no server: they run in your browser, your CI or your terminal.',
    tools: {
      diff: 'Two versions of design tokens: what changed in each theme, what breaks, which version to ship',
      cli: 'Diff and checks in your terminal and CI; upgrade‑check shows what a new version breaks in your code',
      action:
        'A report on every pull request: what a token change breaks in your code, and a failed check when it does',
      mcp: 'Coding agents use your tokens instead of hard-coded values and check the code they write: Tailwind, JSX, CSS',
      engine: 'The open engine behind it: DTCG 2025.10, snapshots, diff, rules',
      figma: 'Check Figma variables and styles against your tokens, inside Figma',
      cliTitle: 'dsgraph CLI',
      actionTitle: 'GitHub Action',
      mcpTitle: 'MCP server',
      figmaTitle: 'Figma plugin',
      soon: 'Soon',
    },
    status: 'Free · No sign-up · Nothing is uploaded',
    open: 'Open Token Diff',
    formatsTitle: 'Reads your tokens as they are',
    formatsLead:
      'Whatever wrote them, tokens become one graph, so the comparison and the checks work the same for every source. No conversion step and no config for the usual layouts.',
    formats: {
      modes: [
        'Themes and modes found on their own',
        'Every theme is compared separately: dark can break while light stays the same',
        'Resolver sets · theme files · $extensions.mode',
      ],
      math: [
        'Math and color modifiers calculated',
        'Change the base value and every token built on it shows up',
        'Token JSON with expressions',
      ],
      refs: [
        'References followed to the end',
        'A change deep in an alias chain is reported with its cause',
        'Token JSON with value and type',
      ],
      color: [
        'Colors compared by how they look',
        'ΔE in OKLab, any color space; changes no one can see are a patch',
        'DTCG 2025.10',
      ],
      css: [
        'CSS read as tokens',
        'Custom properties become tokens; selectors become themes',
        'CSS custom properties',
      ],
      remote: [
        'Any version, nothing uploaded',
        'Published packages and branches are fetched by your browser',
        'npm · GitHub · files',
      ],
    },
    formatsNote:
      'Reads DTCG 2025.10, older token JSON with value and type, Figma variables exported to JSON and CSS custom properties.',
    liveTitle: 'A release, compared right here',
    liveLead:
      'Not a screenshot: two versions of a small token file, compared by dsgraph in your browser as this page loaded.',
    liveOpen: 'Open it in Token Diff →',
    codeTitle: 'Your code stays on the design system',
    codeLead:
      'For designers who build in code, on their own or with an agent. dsgraph reads CSS, JSX and TSX, Tailwind classes, Vue and Svelte: how much of it comes from tokens, which values are written by hand and what to write instead, and what the next version of the design system will break.',
    codeOpen: 'Try it on your project in Token Diff →',
    codeCaption:
      'Four components of a small app on the example’s tokens, checked by dsgraph when this site was built. The same report comes from dsgraph check --code, the MCP server and the GitHub Action.',
    code: {
      onTokens: 'On tokens',
      split: (fromTokens: number, byHand: number) =>
        `${num('en', fromTokens)} from tokens · ${num('en', byHand)} written by hand`,
      handTitle: 'Written by hand',
      closest: 'closest',
      breaksTitle: 'Breaks in the next version',
      removed: 'token removed',
      renamed: (to: string) => `renamed to ${to}`,
    },
  },

  diffPage: {
    title: 'Token Diff · Specsure',
    description:
      'Compare two versions of design tokens: what changed, what breaks and which semver bump it needs, and what the change does to your code: CSS, JSX and TSX, Tailwind, Vue, Svelte. Runs in your browser.',
    lead: 'Compare two versions of design tokens: what was removed, renamed or changed in each theme, and the semver bump it needs. Add your project to see what the change breaks in its code: CSS, JSX and TSX, Tailwind, Vue, Svelte, Astro. Everything is read in your browser and never uploaded.',
    how: 'How it works',
  },

  inputs: {
    before: 'Before',
    after: 'After',
    sourceAria: 'Source',
    kinds: { npm: 'npm', github: 'GitHub', files: 'Files' },
    pkgAria: 'Package',
    pkgPlaceholder: 'Package name, e.g. @scope/tokens',
    versionAria: 'Version',
    versionPlaceholder: 'version',
    latest: 'latest',
    repoAria: 'Repository and folder',
    refAria: 'Branch, tag or commit',
    token: 'Token',
    tokenSet: 'Token ✓',
    tokenTitle: 'Token for private repositories',
    tokenAria: 'GitHub token',
    tokenPlaceholder: 'GitHub token with read access, for private repositories',
    tokenNote: 'Kept in this tab only: never saved, never put into links.',
    drop: 'Drop token files or a folder here',
    filesButton: 'Files',
    folderButton: 'Folder',
    clear: 'Clear',
    clearAria: 'Clear files',
    andMore: (first: string, n: number) => `${first} and ${n} more`,
    tokens: (n: number) => count('en', n, { one: 'token', other: 'tokens' }),
    files: (n: number) => count('en', n, { one: 'file', other: 'files' }),
    filesLabel: 'Files',
    filesAria: 'Token files',
    filesPlaceholder: 'Token files. Auto: DTCG, token JSON or CSS',
    filesTitle: 'Globs, comma-separated, e.g. dist/tokens.css or tokens/**/*.json',
    example: 'Try an example',
    swap: 'Swap',
    compare: 'Compare',
    progress: {
      start: 'Starting…',
      reading: 'Reading tokens…',
      comparing: 'Comparing…',
      code: 'Reading your code…',
    },
    failed: 'The comparison failed',
    privateHint: 'If the repository is private, add a GitHub token.',
    reloadHint: 'The site was updated while this page was open. Reload the page to check your code.',
    shareTooBig: 'These files are too large for a link. Share the Markdown or the changeset JSON instead.',
  },

  yourCode: {
    title: 'Your code',
    groupTokens: 'Design system',
    groupProduct: 'Your product · optional',
    drop: 'Drop the folder of an app that uses these tokens',
    formats: 'CSS, SCSS, JSX, TSX, Tailwind, Vue, Svelte, Astro, HTML',
    folder: 'Folder',
    clear: 'Clear',
    clearAria: 'Remove your code',
    note: 'Read in this tab: never uploaded and never put into links.',
    hint: 'Shows what this release breaks in your code, how much of it is on tokens and what to write instead of values written by hand.',
    read: (n: number) => `${count('en', n, { one: 'file', other: 'files' })} of code`,
    summary: (breaks: number, looks: number, files: number) =>
      breaks + looks === 0
        ? 'Nothing in your code uses the changed tokens.'
        : `In your code: ${[
            breaks
              ? `${count('en', breaks, { one: 'place', other: 'places' })} ${breaks === 1 ? 'breaks' : 'break'}`
              : '',
            looks
              ? `${count('en', looks, { one: 'place', other: 'places' })} ${looks === 1 ? 'looks' : 'look'} different`
              : '',
          ]
            .filter(Boolean)
            .join(', ')} (${count('en', files, { one: 'file', other: 'files' })}).`,
    rowTitle: (n: number) => `Used in ${count('en', n, { one: 'place', other: 'places' })} of your code`,
    inCode: (n: number, breaks: boolean) =>
      `${breaks ? 'Breaks' : 'Changes'} in your code: ${count('en', n, { one: 'place', other: 'places' })}`,
    more: (n: number) => `and ${num('en', n)} more`,
    against: (label: string) => `Checked against ${label}, the version this code uses now.`,
    onTokens: 'On tokens',
    split: (fromTokens: number, byHand: number) =>
      `${num('en', fromTokens)} from tokens · ${num('en', byHand)} written by hand`,
    handTitle: 'Written by hand',
    closest: 'closest',
    usageTitle: 'Variables to update',
    deprecated: (replacement?: string) => (replacement ? `deprecated, use ${replacement}` : 'deprecated'),
    unknown: 'not a token in this version',
    skipped: (n: number) => `${count('en', n, { one: 'file', other: 'files' })} could not be read`,
    clean: 'Nothing written by hand and no outdated variables.',
  },

  levels: { major: 'Breaking', minor: 'Minor', patch: 'Patch', none: 'No impact' } as LevelText,
  /** The level of one change, as a value in its details. */
  level: { major: 'Breaking', minor: 'Minor', patch: 'Patch', none: 'No impact' } as LevelText,

  verdict: {
    noChanges: 'No changes',
    noImpact: 'No impact on consumers',
    release: {
      major: 'Breaking release',
      minor: 'Minor release',
      patch: 'Patch release',
      none: 'No impact on consumers',
    } as LevelText,
    counts: {
      removed: (n: number) => `${num('en', n)} removed`,
      renamed: (n: number) => `${num('en', n)} renamed`,
      changed: (n: number) => `${num('en', n)} changed`,
      added: (n: number) => `${num('en', n)} added`,
      deprecated: (n: number) => `${num('en', n)} deprecated`,
      propagated: (n: number) => `${num('en', n)} more through references`,
      other: (n: number) => `${num('en', n)} other`,
      unseen: (n: number) => `${num('en', n)} nobody sees`,
    },
    reason: {
      major: (n: number, kinds: string[]) => {
        const words: Record<string, string> = {
          'token.removed': 'removed',
          'token.renamed': 'renamed',
          'token.type-changed': 'changed type',
          'token.missing-in-context': 'missing in a theme',
          'modifier.removed': 'a theme removed',
          'context.removed': 'a theme removed',
        }
        const what =
          [...new Set(kinds.map((k) => words[k]).filter(Boolean))].join(' or ') || 'changed in a breaking way'
        return `${count('en', n, { one: 'token', other: 'tokens' })} ${n === 1 ? 'was' : 'were'} ${what}: code and designs that use ${n === 1 ? 'it' : 'them'} stop working until they are updated.`
      },
      minor:
        'Values changed or tokens were added. Nothing that uses the tokens breaks, but people will see the difference.',
      patch: 'Only changes that are hard to notice: tiny color or size shifts, references, descriptions.',
      none: 'Only notation or metadata changed: nobody using the tokens sees a difference.',
      same: 'The two versions hold the same tokens with the same values.',
    },
    published: {
      lower: (published: Level, needed: Level) =>
        `Published as a ${bumpEn[published]} version, but the token changes need a ${bumpEn[needed]} one.`,
      higher: (published: Level, needed: Level) =>
        `Published as a ${bumpEn[published]} version; the token changes alone need ${needed === 'none' ? 'no new version' : `a ${bumpEn[needed]} one`}. Other changes in the package may explain the rest.`,
      same: (published: Level) =>
        `Published as a ${bumpEn[published]} version, which matches the token changes.`,
    },
  },

  results: {
    searchPlaceholder: 'Filter by token name',
    searchAria: 'Filter changes',
    every: (axis: string) => `Every ${axis}`,
    impactAria: 'Impact',
    anyImpact: 'Any impact',
    typeAria: 'Type',
    anyType: 'Any type',
    same: 'Both versions resolve to the same tokens in every context.',
    noMatch: 'Nothing matches these filters.',
    listAria: 'Changes',
    showQuiet: (n: number) => `Show ${num('en', n)} changes nobody sees: metadata, notation`,
    status: (n: number, ms: number, partial: boolean) =>
      `${count('en', n, { one: 'change', other: 'changes' })} · ${num('en', ms)} ms${partial ? ' · some context combinations were skipped' : ''}`,
    copied: 'Markdown copied',
    linkCopied: 'Link copied',
    copyMarkdown: 'Copy Markdown',
    markdownNote: '',
    actions: 'Actions',
    card: 'Card for a post',
    copyLink: 'Copy link',
    downloadMarkdown: 'Download Markdown',
    downloadJson: 'Download changeset JSON',
  },

  change: {
    kinds: {
      'token.added': 'Added',
      'token.removed': 'Removed',
      'token.renamed': 'Renamed',
      'token.value-changed': 'Value changed',
      'token.notation-changed': 'Notation changed',
      'token.alias-retargeted': 'Alias retargeted',
      'token.type-changed': 'Type changed',
      'token.contexts-changed': 'Contexts changed',
      'token.missing-in-context': 'Missing in context',
      'token.deprecated': 'Deprecated',
      'token.undeprecated': 'No longer deprecated',
      'token.description-changed': 'Description changed',
      'token.extensions-changed': 'Extensions changed',
      'group.extends-changed': '$extends changed',
      'context.added': 'Context added',
      'context.removed': 'Context removed',
      'modifier.added': 'Modifier added',
      'modifier.removed': 'Modifier removed',
    } as KindLabels,
    maybe: 'maybe',
    renamed: 'renamed',
    renamedSure: (pct: number) => `renamed, ${pct}% sure`,
    alsoChanges: (n: number) =>
      `Also changes ${count('en', n, { one: 'token', other: 'tokens' })} that use it`,
    before: 'Before',
    after: 'After',
    sample: 'Handgloves 0123',
    meta: {
      change: 'Change',
      impact: 'Impact',
      type: 'Type',
      applies: 'Applies in',
      oldName: 'Old name',
      howWeKnow: 'How we know',
      guessed: (pct: number) => `Same value, similar name (${pct}% sure)`,
      certain: 'Declared or the same token id',
      possibly: 'Possibly renamed to',
      difference: 'Difference',
      useInstead: 'Use instead',
      reason: 'Reason',
      note: 'Note',
    },
    note: (note: string) => note,
    graphTitle: 'In the graph',
    graphHint: 'Lines lead from a token to the tokens that take their value from it.',
    through: (n: number) => `Changes ${count('en', n, { one: 'token', other: 'tokens' })} through references`,
    appliesEverywhere: (axes: string[]) =>
      axes.length === 1 ? `every ${axes[0]}` : axes.length ? 'every combination' : 'everywhere',
    meaning: {
      removed: 'Gone from the new version: code and designs that use it stop working.',
      removedMaybe:
        'Gone from the new version. It may have been renamed to one of the tokens below; check before you update.',
      renamedGuess:
        'Same value under a new name, matched by name and value. Everything that uses the old name has to switch.',
      renamed: 'Same token under a new name. Everything that uses the old name has to switch.',
      added: 'New in this version. Nothing breaks.',
      valueSmall: 'The value moved so little that people are unlikely to notice.',
      value: 'Everything that uses this token will look different after the update.',
      retargeted:
        'Now points to another token, with the same resulting value. Nothing looks different today, but it will follow the new token from now on.',
      type: 'The kind of value changed (for example, from a size to a number). Code that reads it may break.',
      missing: 'Missing in this theme, so the theme falls back or breaks.',
      contexts: 'Now differs between themes (or stopped differing). Check it in each theme.',
      deprecated: 'Marked as deprecated: it still works, but will go away. Switch to the replacement.',
      undeprecated: 'No longer deprecated.',
      notation: 'Written differently, same value. Nobody sees a difference.',
      description: 'Only the description changed.',
      extensions: 'Only tool metadata changed. Nobody sees a difference.',
    },
    delta: [
      'invisible',
      'barely visible side by side',
      'noticeable side by side',
      'clearly visible',
      'a different color',
    ],
  },

  graph: {
    from: 'Takes its value from',
    usedBy: 'Used by',
    more: (n: number) => `+${num('en', n)} more`,
    open: 'open this change',
  },

  checks: {
    on: 'Checks on',
    errors: (n: number) => count('en', n, { one: 'error', other: 'errors' }),
    warnings: (n: number) => count('en', n, { one: 'warning', other: 'warnings' }),
    info: (n: number) => `${num('en', n)} info`,
    andMore: (n: number) => `and ${num('en', n)} more`,
    /** Plain-language titles; English shows the engine's own message instead. */
    titles: {} as Record<string, string>,
    help: {
      'dtcg/legacy-syntax':
        'Written in an older style (a color or size as text). Most tools read it; the DTCG 2025.10 format asks for objects.',
      'dtcg/invalid-unit':
        'A unit other than px or rem. Fine for CSS, but other platforms may not understand it.',
      'dtcg/typography-missing-field':
        'A text style without one of its parts; tools fill it in with their own default.',
      'dtcg/unknown-type':
        'A type the DTCG format does not define. Tools that do not know it skip the token.',
      'dtcg/invalid-shadow': 'A shadow with a part the format does not define.',
      'dtcg/shadow-missing-spread': 'A shadow without spread; read as 0.',
      'dtcg/unknown-reference': 'Points to a token that does not exist. The value cannot be worked out.',
      'dtcg/alias-cycle': 'Tokens point to each other in a loop, so none of them has a value.',
      'palette/duplicate-stops': 'Two steps of a color ramp are the same color, so one of them adds nothing.',
      'palette/non-monotonic':
        'A color ramp gets lighter where it should get darker (or the other way round).',
      'color/out-of-gamut': 'A color outside what most screens show; it will be clipped.',
      'color/hex-mismatch': 'The hex fallback does not match the color itself.',
      'token/deprecated-reference': 'Uses a deprecated token.',
      'naming/normalized-collision': 'Two names differ only in case or separators and will collide in code.',
      'a11y/contrast-matrix': 'Text and background pairs below the contrast you asked for.',
      'layer/alias-depth': 'A long chain of references, which is hard to follow.',
      'layer/allowed-sources': 'A token points into a layer it should not use.',
    } as Record<string, string>,
  },

  card: {
    title: 'Card for a post',
    close: 'Close',
    copy: 'Copy image',
    download: 'Download PNG',
    copied: 'Copied',
    cannotCopy: 'This browser cannot copy images; download it instead',
    size: '1200 × 630, sized for LinkedIn and link previews',
    badge: { major: 'MAJOR', minor: 'MINOR', patch: 'PATCH', none: 'NO IMPACT' } as LevelText,
    noChanges: 'NO CHANGES',
    colors: 'Changed colors, before and after',
    designTokens: 'Design tokens',
    before: 'before',
    after: 'after',
    counts: {
      removed: (n: number) => plural('en', n, { one: 'removed', other: 'removed' }),
      renamed: (n: number) => plural('en', n, { one: 'renamed', other: 'renamed' }),
      changed: (n: number) => plural('en', n, { one: 'changed', other: 'changed' }),
      added: (n: number) => plural('en', n, { one: 'added', other: 'added' }),
      deprecated: (n: number) => plural('en', n, { one: 'deprecated', other: 'deprecated' }),
    },
  },

  figure: { running: 'Running dsgraph…', compare: 'Compare', theme: 'theme' },

  mcp: {
    tokens: 'Tokens',
    agent: 'Agent',
    sources: { folder: 'Folder', npm: 'npm package', github: 'GitHub' },
    sourcesAria: 'Where the tokens are',
    agentsAria: 'Agent',
    locationAria: 'Tokens location',
    refAria: 'Branch, tag or commit',
    hints: {
      folder: 'The folder with your token files: DTCG, a resolver, token JSON or CSS.',
      npm: 'A published token package. Without a version, the latest one.',
      github: 'A public repository, or a private one with GITHUB_TOKEN set for the server.',
    },
    where: {
      'claude-code':
        'Run in the project folder. Add --scope project to share it with your team through .mcp.json in the repository.',
      'claude-desktop':
        'Settings → Developer → Edit Config opens claude_desktop_config.json. Add this to it (merge with any servers already there) and restart the app.',
      cursor:
        'Save as .cursor/mcp.json in the project (or ~/.cursor/mcp.json for every project), then turn the server on in Settings → MCP.',
      vscode: 'Save as .vscode/mcp.json in the project; Copilot Chat in agent mode picks it up.',
      windsurf: 'Add to ~/.codeium/windsurf/mcp_config.json and refresh the MCP servers in Cascade.',
      codex: 'Add to ~/.codex/config.toml.',
    },
    absolute:
      'This app starts servers outside your project, so write the folder as a full path, for example /Users/you/project/tokens.',
    status: 'Needs Node.js 20 or newer. Runs on your machine and only reads.',
    copy: 'Copy',
    copied: 'Copied',
  },
}

const bumpEn: Record<Level, string> = { major: 'major', minor: 'minor', patch: 'patch', none: 'no' }

export type Messages = typeof en

const ruToken: Forms = { one: 'токен', few: 'токена', many: 'токенов', other: 'токена' }
const ruChange: Forms = { one: 'изменение', few: 'изменения', many: 'изменений', other: 'изменения' }
const ruPlace: Forms = { one: 'место', few: 'места', many: 'мест', other: 'места' }
/** «удалён / удалены / удалено» after a number of tokens. */
const ruDone = (one: string, few: string, many: string) => (n: number) =>
  `${num('ru', n)} ${plural('ru', n, { one, few, many, other: few })}`

/** Release kinds as nouns and in the genitive: «как мажорная», «требуют мажорной». */
const bumpRu: Record<Level, [string, string]> = {
  major: ['мажорная', 'мажорной'],
  minor: ['минорная', 'минорной'],
  patch: ['патч', 'патча'],
  none: ['без изменений', 'новой версии'],
}

const ru: Messages = {
  lang: 'ru',
  langName: 'Русский',
  switchTo: 'English',
  switchLabel: 'Read in English',

  site: {
    nav: { diff: 'Token Diff', guide: 'Гайд', mcp: 'MCP', cli: 'CLI', github: 'GitHub', about: 'О проекте' },
    footer: 'Specsure, лицензия MIT',
    source: 'Исходный код',
    about: {
      label: 'О проекте Specsure',
      close: 'Закрыть',
      lead: 'Инструменты для дизайн-систем. Token Diff показывает, что изменилось между двумя версиями токенов, что из этого сломается и какую версию выпускать.',
      points: [
        'Сравнивает две версии дизайн-токенов: DTCG, JSON токенов и CSS-переменные',
        'Показывает, что сломается, отдельно для каждой темы, и подсказывает номер версии по semver',
        'Читает пакеты из npm, репозитории на GitHub и ваши собственные файлы',
        'Выгружает Markdown для changelog и pull request и карточку для поста',
        'Работает целиком в браузере: без регистрации, ничего никуда не загружается',
        'Открытый код под MIT; движок опубликован как dsgraph',
      ],
      soon: 'Скоро',
      soonText: 'Плагин для Figma: проверка переменных и стилей по токенам прямо в Figma.',
      guide: 'Открыть гайд',
      github: 'Код на GitHub',
      madeBy: 'Сделал',
      owners: 'Названия пакетов и дизайн-систем принадлежат их владельцам. Specsure с ними не связан.',
    },
  },

  home: {
    title: 'Specsure · инструменты для дизайн-систем',
    description:
      'Открытые инструменты для дизайн-систем: Token Diff показывает, что меняет и что ломает новый релиз токенов. Без регистрации и без сервера.',
    h1: 'Узнайте, что сломает релиз вашей дизайн-системы',
    lead: 'Открытые инструменты для дизайн-систем. Без регистрации и без сервера: всё работает в браузере, в CI или в терминале.',
    tools: {
      diff: 'Две версии дизайн-токенов: что изменилось в каждой теме, что сломается, какую версию выпускать',
      cli: 'Сравнение и проверки в терминале и CI; upgrade‑check покажет, что новая версия сломает в вашем коде',
      action:
        'Отчёт в каждом pull request: что изменение токенов сломает в вашем коде, и проваленная проверка, если ломает',
      mcp: 'ИИ-агенты берут ваши токены вместо вписанных значений и проверяют написанный код: Tailwind, JSX, CSS',
      engine: 'Открытый движок, на котором всё построено: DTCG 2025.10, снимки, сравнение, правила',
      figma: 'Проверка переменных и стилей Figma по вашим токенам прямо в Figma',
      cliTitle: 'dsgraph CLI',
      actionTitle: 'GitHub Action',
      mcpTitle: 'MCP-сервер',
      figmaTitle: 'Плагин для Figma',
      soon: 'Скоро',
    },
    status: 'Бесплатно · Без регистрации · Ничего не загружается',
    open: 'Открыть Token Diff',
    formatsTitle: 'Читает токены такими, какие они есть',
    formatsLead:
      'Чем бы ни были созданы токены, они превращаются в один граф, поэтому сравнение и проверки одинаково работают для любого источника. Без конвертации и без настройки для привычной структуры файлов.',
    formats: {
      modes: [
        'Темы и режимы находятся сами',
        'Каждая тема сравнивается отдельно: тёмная может сломаться, а светлая остаться прежней',
        'Наборы резолвера · файлы тем · $extensions.mode',
      ],
      math: [
        'Формулы и модификаторы цвета посчитаны',
        'Поменяйте базовое значение — и увидите все токены, которые на нём построены',
        'JSON токенов с формулами',
      ],
      refs: [
        'Ссылки прослежены до конца',
        'Изменение в глубине цепочки ссылок показано вместе с причиной',
        'JSON токенов с value и type',
      ],
      color: [
        'Цвета сравниваются по тому, как выглядят',
        'ΔE в OKLab в любом цветовом пространстве; незаметные изменения — это патч',
        'DTCG 2025.10',
      ],
      css: [
        'CSS читается как токены',
        'Переменные становятся токенами, селекторы — темами',
        'CSS-переменные',
      ],
      remote: [
        'Любая версия, ничего не загружается',
        'Опубликованные пакеты и ветки загружает ваш браузер',
        'npm · GitHub · файлы',
      ],
    },
    formatsNote:
      'Читает DTCG 2025.10, JSON токенов старого формата с value и type, переменные Figma в JSON и CSS-переменные.',
    liveTitle: 'Релиз, сравнённый прямо здесь',
    liveLead:
      'Это не скриншот: две версии небольшого файла токенов, которые dsgraph сравнил в вашем браузере, пока загружалась страница.',
    liveOpen: 'Открыть в Token Diff →',
    codeTitle: 'Ваш код остаётся в дизайн-системе',
    codeLead:
      'Для дизайнеров, которые собирают интерфейс в коде — сами или с агентом. dsgraph читает CSS, JSX и TSX, классы Tailwind, Vue и Svelte и показывает, какая доля значений взята из токенов, что вписано вручную и что написать вместо этого, а ещё — что сломает следующая версия дизайн-системы.',
    codeOpen: 'Проверить свой проект в Token Diff →',
    codeCaption:
      'Четыре компонента небольшого приложения на токенах из примера. dsgraph проверил их при сборке этого сайта; тот же отчёт дают dsgraph check --code, MCP-сервер и GitHub Action.',
    code: {
      onTokens: 'На токенах',
      split: (fromTokens: number, byHand: number) =>
        `${num('ru', fromTokens)} из токенов · ${num('ru', byHand)} вручную`,
      handTitle: 'Вписано вручную',
      closest: 'ближайшее',
      breaksTitle: 'Сломается в следующей версии',
      removed: 'токен удалён',
      renamed: (to: string) => `переименован в ${to}`,
    },
  },

  diffPage: {
    title: 'Token Diff · Specsure',
    description:
      'Сравните две версии дизайн-токенов: что изменилось, что сломается, какую версию выпускать по semver и что изменение сделает с вашим кодом: CSS, JSX и TSX, Tailwind, Vue, Svelte. Работает в браузере.',
    lead: 'Сравните две версии дизайн-токенов: что удалили, переименовали или изменили в каждой теме и какую версию нужно выпустить по semver. Добавьте свой проект, чтобы увидеть, что изменение сломает в его коде: CSS, JSX и TSX, Tailwind, Vue, Svelte, Astro. Всё читается в браузере и никуда не загружается.',
    how: 'Как это работает',
  },

  inputs: {
    before: 'Было',
    after: 'Стало',
    sourceAria: 'Источник',
    kinds: { npm: 'npm', github: 'GitHub', files: 'Файлы' },
    pkgAria: 'Пакет',
    pkgPlaceholder: 'Имя пакета, например @scope/tokens',
    versionAria: 'Версия',
    versionPlaceholder: 'версия',
    latest: 'последняя',
    repoAria: 'Репозиторий и папка',
    refAria: 'Ветка, тег или коммит',
    token: 'Токен',
    tokenSet: 'Токен ✓',
    tokenTitle: 'Токен для приватных репозиториев',
    tokenAria: 'Токен GitHub',
    tokenPlaceholder: 'Токен GitHub с правом чтения — для приватных репозиториев',
    tokenNote: 'Хранится только в этой вкладке: не сохраняется и не попадает в ссылки.',
    drop: 'Перетащите сюда файлы токенов или папку',
    filesButton: 'Файлы',
    folderButton: 'Папка',
    clear: 'Очистить',
    clearAria: 'Убрать файлы',
    andMore: (first: string, n: number) => `${first} и ещё ${num('ru', n)}`,
    tokens: (n: number) => count('ru', n, ruToken),
    files: (n: number) => count('ru', n, { one: 'файл', few: 'файла', many: 'файлов', other: 'файла' }),
    filesLabel: 'Файлы',
    filesAria: 'Файлы токенов',
    filesPlaceholder: 'Файлы токенов. Авто: DTCG, JSON токенов или CSS',
    filesTitle: 'Маски через запятую, например dist/tokens.css или tokens/**/*.json',
    example: 'Пример',
    swap: 'Поменять местами',
    compare: 'Сравнить',
    progress: {
      start: 'Запуск…',
      reading: 'Чтение токенов…',
      comparing: 'Сравнение…',
      code: 'Чтение вашего кода…',
    },
    failed: 'Сравнить не удалось',
    privateHint: 'Если репозиторий приватный, добавьте токен GitHub.',
    reloadHint: 'Сайт обновился, пока страница была открыта. Перезагрузите её, чтобы проверить код.',
    shareTooBig: 'Файлы слишком большие для ссылки. Поделитесь отчётом в Markdown или JSON с изменениями.',
  },

  yourCode: {
    title: 'Ваш код',
    groupTokens: 'Дизайн-система',
    groupProduct: 'Ваш продукт · необязательно',
    drop: 'Перетащите папку приложения, которое использует эти токены',
    formats: 'CSS, SCSS, JSX, TSX, Tailwind, Vue, Svelte, Astro, HTML',
    folder: 'Папка',
    clear: 'Очистить',
    clearAria: 'Убрать ваш код',
    note: 'Читается в этой вкладке: никуда не загружается и не попадает в ссылки.',
    hint: 'Покажем, что этот релиз сломает в вашем коде, какая доля значений на токенах и что написать вместо значений, вписанных вручную.',
    read: (n: number) =>
      `${count('ru', n, { one: 'файл', few: 'файла', many: 'файлов', other: 'файла' })} кода`,
    summary: (breaks: number, looks: number, files: number) =>
      breaks + looks === 0
        ? 'Ваш код не использует изменённые токены.'
        : `В вашем коде ${[
            breaks ? `сломается: ${count('ru', breaks, ruPlace)}` : '',
            looks ? `будет выглядеть иначе: ${count('ru', looks, ruPlace)}` : '',
          ]
            .filter(Boolean)
            .join(
              '; ',
            )} (${count('ru', files, { one: 'файл', few: 'файла', many: 'файлов', other: 'файла' })}).`,
    rowTitle: (n: number) => `Используется в вашем коде: ${count('ru', n, ruPlace)}`,
    inCode: (n: number, breaks: boolean) =>
      `${breaks ? 'Сломается' : 'Изменится'} в вашем коде: ${count('ru', n, ruPlace)}`,
    more: (n: number) => `и ещё ${num('ru', n)}`,
    against: (label: string) => `Проверено по ${label} — версии, которую код использует сейчас.`,
    onTokens: 'На токенах',
    split: (fromTokens: number, byHand: number) =>
      `${num('ru', fromTokens)} из токенов · ${num('ru', byHand)} вручную`,
    handTitle: 'Вписано вручную',
    closest: 'ближайшее',
    usageTitle: 'Переменные, которые нужно обновить',
    deprecated: (replacement?: string) => (replacement ? `устарел, используйте ${replacement}` : 'устарел'),
    unknown: 'такого токена нет в этой версии',
    skipped: (n: number) =>
      `не удалось прочитать: ${count('ru', n, { one: 'файл', few: 'файла', many: 'файлов', other: 'файла' })}`,
    clean: 'Ничего не вписано вручную, устаревших переменных нет.',
  },

  levels: { major: 'Ломающие', minor: 'Минорные', patch: 'Патч', none: 'Без последствий' },
  level: { major: 'Ломающее', minor: 'Минорное', patch: 'Патч', none: 'Без последствий' },

  verdict: {
    noChanges: 'Изменений нет',
    noImpact: 'Для пользователей токенов ничего не меняется',
    release: {
      major: 'Ломающий релиз',
      minor: 'Минорный релиз',
      patch: 'Патч-релиз',
      none: 'Для пользователей токенов ничего не меняется',
    },
    counts: {
      removed: ruDone('удалён', 'удалены', 'удалено'),
      renamed: ruDone('переименован', 'переименованы', 'переименовано'),
      changed: ruDone('изменён', 'изменены', 'изменено'),
      added: ruDone('добавлен', 'добавлены', 'добавлено'),
      deprecated: ruDone('устарел', 'устарели', 'устарело'),
      propagated: (n: number) =>
        `ещё ${num('ru', n)} ${plural('ru', n, { one: 'изменился', few: 'изменились', many: 'изменились', other: 'изменились' })} через ссылки`,
      other: ruDone('другое', 'других', 'других'),
      unseen: ruDone('незаметное', 'незаметных', 'незаметных'),
    },
    reason: {
      major: (n: number, kinds: string[]) => {
        const one = n === 1
        const words: Record<string, [string, string]> = {
          'token.removed': ['удалён', 'удалены'],
          'token.renamed': ['переименован', 'переименованы'],
          'token.type-changed': ['сменил тип', 'сменили тип'],
          'token.missing-in-context': ['пропал в одной из тем', 'пропали в некоторых темах'],
          'modifier.removed': ['лишился темы', 'лишились темы'],
          'context.removed': ['лишился темы', 'лишились темы'],
        }
        const list = [...new Set(kinds.map((k) => words[k]?.[one ? 0 : 1]).filter(Boolean))]
        const what = list.length
          ? list.join(' или ')
          : one
            ? 'изменён так, что это ломает совместимость'
            : 'изменены так, что это ломает совместимость'
        return `${count('ru', n, ruToken)} ${what}: код и макеты, которые ${one ? 'его' : 'их'} используют, перестанут работать, пока их не обновят.`
      },
      minor: 'Значения изменились или появились новые токены. Ничего не сломается, но разница будет видна.',
      patch: 'Только малозаметные изменения: небольшие сдвиги цвета и размеров, ссылки, описания.',
      none: 'Изменились только форма записи или метаданные — для пользователей токенов ничего не меняется.',
      same: 'В обеих версиях одни и те же токены с одинаковыми значениями.',
    },
    published: {
      lower: (published: Level, needed: Level) =>
        `Версия опубликована как ${bumpRu[published][0]}, а изменения токенов требуют ${bumpRu[needed][1]}.`,
      higher: (published: Level, needed: Level) =>
        `Версия опубликована как ${bumpRu[published][0]}, а самим токенам хватило бы ${needed === 'none' ? 'и без новой версии' : bumpRu[needed][1]}. Остальное могут объяснить другие изменения в пакете.`,
      same: (published: Level) =>
        `Версия опубликована как ${bumpRu[published][0]} — это совпадает с изменениями токенов.`,
    },
  },

  results: {
    searchPlaceholder: 'Поиск по имени токена',
    searchAria: 'Фильтр изменений',
    every: (axis: string) =>
      axis === 'theme' ? 'Все темы' : axis === 'mode' ? 'Все режимы' : `${axis}: все`,
    impactAria: 'Уровень',
    anyImpact: 'Любой уровень',
    typeAria: 'Тип',
    anyType: 'Любой тип',
    same: 'В обеих версиях одинаковые токены с одинаковыми значениями во всех контекстах.',
    noMatch: 'Под эти фильтры ничего не подходит.',
    listAria: 'Изменения',
    showQuiet: (n: number) =>
      `Показать ${count('ru', n, ruChange)}, которых не видно: метаданные и форма записи`,
    status: (n: number, ms: number, partial: boolean) =>
      `${count('ru', n, ruChange)} · ${num('ru', ms)} мс${partial ? ' · часть сочетаний контекстов пропущена' : ''}`,
    copied: 'Markdown скопирован',
    linkCopied: 'Ссылка скопирована',
    copyMarkdown: 'Скопировать Markdown',
    markdownNote: 'Отчёт на английском — такой же, как у CLI',
    actions: 'Действия',
    card: 'Карточка для поста',
    copyLink: 'Скопировать ссылку',
    downloadMarkdown: 'Скачать Markdown',
    downloadJson: 'Скачать JSON с изменениями',
  },

  change: {
    kinds: {
      'token.added': 'Добавлен',
      'token.removed': 'Удалён',
      'token.renamed': 'Переименован',
      'token.value-changed': 'Изменено значение',
      'token.notation-changed': 'Изменена запись',
      'token.alias-retargeted': 'Ссылка ведёт на другой токен',
      'token.type-changed': 'Изменён тип',
      'token.contexts-changed': 'Изменились контексты',
      'token.missing-in-context': 'Нет в контексте',
      'token.deprecated': 'Устарел',
      'token.undeprecated': 'Больше не устарел',
      'token.description-changed': 'Изменено описание',
      'token.extensions-changed': 'Изменены метаданные',
      'group.extends-changed': 'Изменён $extends',
      'context.added': 'Добавлен контекст',
      'context.removed': 'Удалён контекст',
      'modifier.added': 'Добавлен переключатель',
      'modifier.removed': 'Удалён переключатель',
    },
    maybe: 'возможно',
    renamed: 'переименован',
    renamedSure: (pct: number) => `переименован, уверенность ${pct} %`,
    alsoChanges: (n: number) => `Через ссылки меняет ещё ${count('ru', n, ruToken)}`,
    before: 'Было',
    after: 'Стало',
    sample: 'Съешь ещё булок 0123',
    meta: {
      change: 'Изменение',
      impact: 'Уровень',
      type: 'Тип',
      applies: 'Где действует',
      oldName: 'Старое имя',
      howWeKnow: 'Откуда известно',
      guessed: (pct: number) => `Значение то же, имя похоже (уверенность ${pct} %)`,
      certain: 'Указано явно или совпал id токена',
      possibly: 'Возможно, теперь называется',
      difference: 'Разница',
      useInstead: 'Используйте вместо него',
      reason: 'Причина',
      note: 'Примечание',
    },
    note: (note: string) =>
      /Several tokens with equal values and similar paths were added/.test(note)
        ? 'Добавлено несколько токенов с тем же значением и похожими именами, поэтому переименование не засчитано.'
        : note,
    graphTitle: 'В графе',
    graphHint: 'Линии ведут от токена к токенам, которые берут из него значение.',
    through: (n: number) => `Через ссылки меняет ещё ${count('ru', n, ruToken)}`,
    appliesEverywhere: (axes: string[]) => {
      if (axes.length === 1) {
        const a = axes[0]!
        return a === 'theme' ? 'во всех темах' : a === 'mode' ? 'во всех режимах' : `${a}: везде`
      }
      return axes.length ? 'во всех сочетаниях' : 'везде'
    },
    meaning: {
      removed: 'Токена нет в новой версии: код и макеты, которые его используют, перестанут работать.',
      removedMaybe:
        'Токена нет в новой версии. Возможно, его переименовали в один из токенов ниже — проверьте перед обновлением.',
      renamedGuess:
        'То же значение под новым именем; совпадение найдено по имени и значению. Всё, что использует старое имя, нужно перевести на новое.',
      renamed: 'Тот же токен под новым именем. Всё, что использует старое имя, нужно перевести на новое.',
      added: 'Новый токен. Ничего не ломается.',
      valueSmall: 'Значение сдвинулось так мало, что разницу вряд ли заметят.',
      value: 'Всё, что использует этот токен, после обновления будет выглядеть иначе.',
      retargeted:
        'Теперь ссылается на другой токен, значение то же. Сейчас ничего не изменится, но дальше токен будет следовать за новым источником.',
      type: 'Изменился тип значения (например, был размер, стало число). Код, который его читает, может сломаться.',
      missing: 'В этой теме токена нет: тема возьмёт значение по умолчанию или сломается.',
      contexts:
        'Теперь значение различается между темами (или перестало различаться). Проверьте его в каждой теме.',
      deprecated: 'Помечен устаревшим: пока работает, но его уберут. Перейдите на замену.',
      undeprecated: 'Больше не считается устаревшим.',
      notation: 'Записан иначе, значение то же. Разницы никто не увидит.',
      description: 'Изменилось только описание.',
      extensions: 'Изменились только служебные метаданные инструментов. Разницы никто не увидит.',
    },
    delta: ['незаметно', 'едва заметно рядом', 'заметно рядом', 'хорошо заметно', 'другой цвет'],
  },

  graph: {
    from: 'Берёт значение из',
    usedBy: 'Используется в',
    more: (n: number) => `ещё ${num('ru', n)}`,
    open: 'открыть изменение',
  },

  checks: {
    on: 'Проверки:',
    errors: (n: number) => count('ru', n, { one: 'ошибка', few: 'ошибки', many: 'ошибок', other: 'ошибки' }),
    warnings: (n: number) =>
      count('ru', n, {
        one: 'предупреждение',
        few: 'предупреждения',
        many: 'предупреждений',
        other: 'предупреждения',
      }),
    info: (n: number) =>
      count('ru', n, { one: 'заметка', few: 'заметки', many: 'заметок', other: 'заметки' }),
    andMore: (n: number) => `и ещё ${num('ru', n)}`,
    titles: {
      'dtcg/legacy-syntax': 'Значения в старом формате',
      'dtcg/invalid-unit': 'Единицы, отличные от px и rem',
      'dtcg/typography-missing-field': 'Текстовый стиль без одного из параметров',
      'dtcg/unknown-type': 'Тип, которого нет в DTCG',
      'dtcg/invalid-shadow': 'Тень с лишним параметром',
      'dtcg/shadow-missing-spread': 'Тень без spread',
      'dtcg/unknown-reference': 'Ссылка на несуществующий токен',
      'dtcg/alias-cycle': 'Ссылки по кругу',
      'palette/duplicate-stops': 'Одинаковые шаги в цветовой шкале',
      'palette/non-monotonic': 'Цветовая шкала идёт не по порядку',
      'color/out-of-gamut': 'Цвет за пределами экрана',
      'color/hex-mismatch': 'Hex не совпадает с цветом',
      'token/deprecated-reference': 'Ссылка на устаревший токен',
      'naming/normalized-collision': 'Имена, которые совпадут в коде',
      'a11y/contrast-matrix': 'Недостаточный контраст',
      'layer/alias-depth': 'Слишком длинная цепочка ссылок',
      'layer/allowed-sources': 'Ссылка в чужой слой',
    },
    help: {
      'dtcg/legacy-syntax':
        'Цвет или размер записан строкой, как раньше. Большинство инструментов это поймут, но формат DTCG 2025.10 требует объект.',
      'dtcg/invalid-unit':
        'Единица не px и не rem. Для CSS это нормально, другие платформы могут её не понять.',
      'dtcg/typography-missing-field':
        'В текстовом стиле не хватает одного из параметров — инструменты подставят своё значение по умолчанию.',
      'dtcg/unknown-type':
        'Такого типа нет в формате DTCG. Инструменты, которые его не знают, пропустят токен.',
      'dtcg/invalid-shadow': 'У тени есть параметр, которого нет в формате.',
      'dtcg/shadow-missing-spread': 'У тени нет spread; считаем его равным 0.',
      'dtcg/unknown-reference': 'Ссылка ведёт на токен, которого нет, поэтому значение не вычислить.',
      'dtcg/alias-cycle': 'Токены ссылаются друг на друга по кругу, и ни у одного из них нет значения.',
      'palette/duplicate-stops': 'Два шага цветовой шкалы одинакового цвета, один из них лишний.',
      'palette/non-monotonic': 'Шкала светлеет там, где должна темнеть (или наоборот).',
      'color/out-of-gamut':
        'Цвет выходит за пределы того, что показывает большинство экранов, и будет обрезан.',
      'color/hex-mismatch': 'Запасной hex не совпадает с самим цветом.',
      'token/deprecated-reference': 'Использует устаревший токен.',
      'naming/normalized-collision':
        'Имена различаются только регистром или разделителями и совпадут в коде.',
      'a11y/contrast-matrix': 'Пары текста и фона с контрастом ниже заданного.',
      'layer/alias-depth': 'Слишком длинная цепочка ссылок, в ней трудно разобраться.',
      'layer/allowed-sources': 'Токен ссылается на слой, который ему использовать нельзя.',
    },
  },

  card: {
    title: 'Карточка для поста',
    close: 'Закрыть',
    copy: 'Скопировать картинку',
    download: 'Скачать PNG',
    copied: 'Скопировано',
    cannotCopy: 'Этот браузер не умеет копировать картинки — скачайте файл',
    size: '1200 × 630 — размер для LinkedIn и превью ссылок',
    badge: { major: 'ЛОМАЮЩИЙ', minor: 'МИНОРНЫЙ', patch: 'ПАТЧ', none: 'БЕЗ ПОСЛЕДСТВИЙ' },
    noChanges: 'БЕЗ ИЗМЕНЕНИЙ',
    colors: 'Изменённые цвета: было и стало',
    designTokens: 'Дизайн-токены',
    before: 'было',
    after: 'стало',
    counts: {
      removed: (n: number) =>
        plural('ru', n, { one: 'удалён', few: 'удалены', many: 'удалено', other: 'удалены' }),
      renamed: (n: number) =>
        plural('ru', n, {
          one: 'переименован',
          few: 'переименованы',
          many: 'переименовано',
          other: 'переименованы',
        }),
      changed: (n: number) =>
        plural('ru', n, { one: 'изменён', few: 'изменены', many: 'изменено', other: 'изменены' }),
      added: (n: number) =>
        plural('ru', n, { one: 'добавлен', few: 'добавлены', many: 'добавлено', other: 'добавлены' }),
      deprecated: (n: number) =>
        plural('ru', n, { one: 'устарел', few: 'устарели', many: 'устарело', other: 'устарели' }),
    },
  },

  figure: { running: 'dsgraph считает…', compare: 'Сравнить', theme: 'theme' },

  mcp: {
    tokens: 'Токены',
    agent: 'Агент',
    sources: { folder: 'Папка', npm: 'Пакет npm', github: 'GitHub' },
    sourcesAria: 'Где лежат токены',
    agentsAria: 'Агент',
    locationAria: 'Где лежат токены',
    refAria: 'Ветка, тег или коммит',
    hints: {
      folder: 'Папка с файлами токенов: DTCG, резолвер, JSON токенов или CSS.',
      npm: 'Опубликованный пакет с токенами. Без версии — последняя.',
      github: 'Публичный репозиторий или приватный, если у сервера задан GITHUB_TOKEN.',
    },
    where: {
      'claude-code':
        'Выполните в папке проекта. Добавьте --scope project, чтобы поделиться настройкой с командой через .mcp.json в репозитории.',
      'claude-desktop':
        'Настройки → Developer → Edit Config откроет claude_desktop_config.json. Добавьте туда этот фрагмент (объединив с уже подключёнными серверами) и перезапустите приложение.',
      cursor:
        'Сохраните как .cursor/mcp.json в проекте (или ~/.cursor/mcp.json для всех проектов) и включите сервер в Settings → MCP.',
      vscode: 'Сохраните как .vscode/mcp.json в проекте — Copilot Chat в режиме агента подхватит его сам.',
      windsurf: 'Добавьте в ~/.codeium/windsurf/mcp_config.json и обновите список MCP-серверов в Cascade.',
      codex: 'Добавьте в ~/.codex/config.toml.',
    },
    absolute:
      'Это приложение запускает серверы вне папки проекта, поэтому укажите полный путь, например /Users/you/project/tokens.',
    status: 'Нужен Node.js 20 или новее. Работает на вашем компьютере и только читает.',
    copy: 'Скопировать',
    copied: 'Скопировано',
  },
}

export const messages: Record<Lang, Messages> = { en, ru }

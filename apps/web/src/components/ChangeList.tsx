import type { Change, ChangeImpact, Level } from '@dsgraph/core'
import { colorDirection, colorSize, formatDelta, formatValue } from '@dsgraph/report'
import type { Messages } from '../i18n/messages'
import { useT } from '../i18n/react'
import { appliesIn, deltaWords, meaningOf } from '../lib/explain'
import type { TokenGraph } from '../lib/types'
import { cssColor, isColor, sideValue } from '../lib/view'
import { GraphView } from './GraphView'

const GLYPH: Partial<Record<Change['kind'], string>> = {
  'token.added': '+',
  'token.removed': '−',
  'token.renamed': '→',
  'token.type-changed': 'T',
  'token.missing-in-context': '∅',
  'token.deprecated': '!',
  'token.alias-retargeted': '↪',
  'token.notation-changed': '≡',
  'context.added': '+',
  'context.removed': '−',
  'modifier.added': '+',
  'modifier.removed': '−',
}

const TONE: Partial<Record<Change['kind'], string>> = {
  'token.added': 'success',
  'token.removed': 'danger',
  'token.type-changed': 'danger',
  'token.missing-in-context': 'danger',
  'context.removed': 'danger',
  'modifier.removed': 'danger',
  'token.renamed': 'warning',
  'token.deprecated': 'warning',
}

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object'

/** The alias a side came from (`{color.brand}`), if any. */
const aliasOf = (side: unknown): string | null =>
  isObj(side) && typeof side.raw === 'string' && /^\{[^{}]+\}$/.test(side.raw) ? side.raw : null

/** First value of an added or removed token (`{ type, values: [{ when, raw, value }] }`). */
const summaryValues = (s: unknown): Array<{ when: Record<string, string>; raw: unknown; value: unknown }> =>
  isObj(s) && Array.isArray(s.values) ? (s.values as never) : []

const beforeOf = (c: Change): unknown => (c.kind === 'token.removed' ? summaryValues(c.before)[0] : c.before)
const afterOf = (c: Change): unknown => (c.kind === 'token.added' ? summaryValues(c.after)[0] : c.after)

function Icon({ c }: { c: Change }) {
  const b = sideValue(beforeOf(c))
  const a = sideValue(afterOf(c))
  if (isColor(b) && isColor(a) && c.kind === 'token.value-changed')
    return (
      <span className="icon icon--swatch" aria-hidden="true">
        <span style={{ background: cssColor(b) }} />
        <span style={{ background: cssColor(a) }} />
      </span>
    )
  const one = isColor(a) ? a : isColor(b) ? b : null
  if (one && (c.kind === 'token.added' || c.kind === 'token.removed'))
    return (
      <span className={`icon icon--swatch icon--${TONE[c.kind]}`} aria-hidden="true">
        <span style={{ background: cssColor(one) }} />
      </span>
    )
  return (
    <span className={`icon icon--${TONE[c.kind] ?? 'neutral'}`} aria-hidden="true">
      {GLYPH[c.kind] ?? '≠'}
    </span>
  )
}

/** Short text on the right of a row: the new value, or the old one for removals. */
function subtitle(c: Change, type: string | null, t: Messages): string {
  const show = (side: unknown) => {
    // An alias that now points elsewhere has only its reference text on each side.
    if (isObj(side) && !('value' in side) && typeof side.raw === 'string') return side.raw
    const v = sideValue(side)
    return v === undefined ? '' : formatValue(type, v)
  }
  switch (c.kind) {
    case 'token.value-changed':
    case 'token.alias-retargeted':
      return `${show(c.before)} → ${show(c.after)}`
    case 'token.added':
      return show(afterOf(c))
    case 'token.removed':
      return c.possibleRenames?.length ? `${t.change.maybe} → ${c.possibleRenames[0]}` : show(beforeOf(c))
    case 'token.type-changed':
      return `${String(c.before)} → ${String(c.after)}`
    case 'token.renamed':
      return c.confidence < 1 ? t.change.renamedSure(Math.round(c.confidence * 100)) : t.change.renamed
    default:
      return t.change.kinds[c.kind]
  }
}

interface RowProps {
  change: Change
  type: string | null
  affected: number
  /** Places in the user's code this change reaches. */
  sites?: ChangeImpact | undefined
  selected: boolean
  onSelect: () => void
}

const SIZE_INDEX = { invisible: 0, barely: 1, noticeable: 2, clear: 3, different: 4 } as const

/** `lighter · noticeable` for a color change, in the page's language; the ΔE goes into the tooltip. */
export function colorWords(c: Change, t: Messages): { text: string; title: string } | undefined {
  if (typeof c.delta?.deltaEOK !== 'number') return undefined
  const dir = colorDirection(c.before, c.after)
  const size = t.change.deltaShort[SIZE_INDEX[colorSize(c.delta.deltaEOK)]]
  return {
    text: dir ? `${t.change.direction[dir]} · ${size}` : (size ?? ''),
    title: `ΔE ${c.delta.deltaEOK.toLocaleString(t.lang)}`,
  }
}

export function ChangeRow({ change: c, type, affected, sites, selected, onSelect }: RowProps) {
  const t = useT()
  const delta = colorWords(c, t)
  return (
    <div
      role="option"
      tabIndex={-1}
      aria-selected={selected}
      id={`change-${c.id}`}
      className={`row${selected ? ' is-selected' : ''}`}
      onClick={onSelect}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
    >
      <Icon c={c} />
      <span className="row__title">
        {c.kind === 'token.renamed' ? (
          <>
            <span className="muted">{c.from} → </span>
            {c.target}
          </>
        ) : (
          c.target
        )}
      </span>
      <span className="row__subtitle">{subtitle(c, type, t)}</span>
      <span className="row__acc">
        {c.when &&
          Object.values(c.when).map((v) => (
            <span key={v} className="tag">
              {v}
            </span>
          ))}
        {affected > 0 && (
          <span className="tag" title={t.change.alsoChanges(affected)}>
            {t.change.viaRefs(affected)}
          </span>
        )}
        {sites && (
          <span
            className={`tag tag--code${sites.effect === 'breaks' ? ' tag--danger' : ''}`}
            title={t.yourCode.rowTitle(sites.sites.length)}
          >
            {t.yourCode.inCodeShort(sites.sites.length)}
          </span>
        )}
        {delta && (
          <span className="acc-text" title={delta.title}>
            {delta.text}
          </span>
        )}
      </span>
    </div>
  )
}

const dim = (d: unknown) =>
  isObj(d) && typeof d.value === 'number' && typeof d.unit === 'string' ? `${d.value}${d.unit}` : undefined
const family = (f: unknown) =>
  Array.isArray(f) ? f.map((x) => (/\s/.test(String(x)) ? `"${x}"` : String(x))).join(', ') : undefined

/** How text in this style looks: typography, a font family or a font weight. */
function textStyle(type: string | null, v: unknown): React.CSSProperties | undefined {
  if (type === 'fontFamily') return { fontFamily: family(v) }
  if (type === 'fontWeight' && typeof v === 'number') return { fontWeight: v }
  if (type !== 'typography' || !isObj(v)) return undefined
  const style: React.CSSProperties = {}
  const ff = family(v.fontFamily)
  if (ff) style.fontFamily = ff
  if (typeof v.fontWeight === 'number') style.fontWeight = v.fontWeight
  const fs = dim(v.fontSize)
  // Big sizes are capped so that the sample fits the pane; the value is in the caption.
  if (fs) style.fontSize = `min(${fs}, 40px)`
  if (typeof v.lineHeight === 'number') style.lineHeight = v.lineHeight
  const ls = dim(v.letterSpacing)
  if (ls) style.letterSpacing = ls
  return style
}

function Big({ type, side, label }: { type: string | null; side: unknown; label: string }) {
  const t = useT()
  const v = sideValue(side)
  const alias = aliasOf(side)
  const text = v === undefined ? undefined : textStyle(type, v)
  return (
    <figure className="preview">
      {isColor(v) ? (
        <span className="preview__swatch" style={{ background: cssColor(v) }} />
      ) : text ? (
        <span className="preview__sample" style={text}>
          {t.change.sample}
        </span>
      ) : (
        <span className="preview__text">{v === undefined ? (alias ?? '—') : formatValue(type, v)}</span>
      )}
      <figcaption>
        <span className="muted">{label}</span>
        {(isColor(v) || text) && <code>{formatValue(type, v)}</code>}
        {alias && v !== undefined && <code className="muted">{alias}</code>}
      </figcaption>
    </figure>
  )
}

interface DetailProps {
  change: Change
  type: string | null
  affected: string[]
  /** Both sides' references; the graph is drawn when given. */
  graph?: { base: TokenGraph; head: TokenGraph } | undefined
  /** Names of the modifiers being compared (`theme`), to say where a change applies. */
  axes?: string[]
  context?: Record<string, string>
  changed?: Map<string, Level>
  onPick?: ((id: string) => void) | undefined
  /** Places in the user's code this change reaches. */
  sites?: ChangeImpact | undefined
}

export function ChangeDetail({
  change: c,
  type,
  affected,
  graph,
  axes = [],
  context = {},
  changed = new Map(),
  onPick,
  sites,
}: DetailProps) {
  const t = useT()
  const m = t.change.meta
  const before = beforeOf(c)
  const after = afterOf(c)
  const hasValues = before !== undefined || after !== undefined
  const sideGraph = graph && (c.kind === 'token.removed' ? graph.base : graph.head)
  const linked = sideGraph?.refs.some(([from, to]) => from === c.target || to === c.target)
  const delta = formatDelta(c.delta)
  const meta: Array<[string, React.ReactNode]> = [
    [m.change, t.change.kinds[c.kind]],
    [m.impact, t.level[c.level]],
  ]
  if (type) meta.push([m.type, type])
  meta.push([m.applies, appliesIn(c.when, axes, t)])
  if (c.kind === 'token.renamed') {
    meta.push([m.oldName, <code key="from">{c.from}</code>])
    meta.push([m.howWeKnow, c.confidence < 1 ? m.guessed(Math.round(c.confidence * 100)) : m.certain])
  }
  if (c.possibleRenames?.length)
    meta.push([
      m.possibly,
      c.possibleRenames.map((r) => (
        <code key={r} className="block">
          {r}
        </code>
      )),
    ])
  if (delta) {
    const dir = colorDirection(c.before, c.after)
    meta.push([
      m.difference,
      typeof c.delta?.deltaEOK === 'number'
        ? `${dir ? `${t.change.direction[dir]}, ` : ''}${deltaWords(c.delta.deltaEOK, t)} · ${delta}`
        : delta,
    ])
  }
  if (c.kind === 'token.deprecated') {
    const d = c.after as { replacement?: string; reason?: string } | undefined
    if (d?.replacement) meta.push([m.useInstead, <code key="r">{d.replacement}</code>])
    else if (d?.reason) meta.push([m.reason, d.reason])
  }
  if (c.note) meta.push([m.note, t.change.note(c.note)])
  const meaning = meaningOf(c, t)

  return (
    <div className="detail__body">
      <h3 className="detail__title">{c.target}</h3>
      {meaning && <p className="detail__lead">{meaning}</p>}
      {hasValues && (
        <div className="previews">
          {c.kind !== 'token.added' && <Big type={type} side={before} label={t.change.before} />}
          {c.kind !== 'token.removed' && <Big type={type} side={after} label={t.change.after} />}
        </div>
      )}
      <dl className="meta">
        {meta.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {sites && (
        <section className="affected affected--code">
          <h4 className={sites.effect === 'breaks' ? 'is-danger' : undefined}>
            {t.yourCode.inCode(sites.sites.length, sites.effect === 'breaks')}
          </h4>
          <ul>
            {sites.sites.slice(0, 50).map((s) => (
              <li key={`${s.file}:${s.line}:${s.column}:${s.text ?? s.name}`}>
                <code>
                  {s.file}:{s.line}
                </code>{' '}
                <code className="muted">{s.text ?? `var(${s.name})`}</code>
              </li>
            ))}
            {sites.sites.length > 50 && <li className="muted">{t.yourCode.more(sites.sites.length - 50)}</li>}
          </ul>
        </section>
      )}
      {sideGraph && linked && (
        <section className="affected">
          <h4>{t.change.graphTitle}</h4>
          <p className="graph-hint">{t.change.graphHint}</p>
          <GraphView id={c.target} graph={sideGraph} context={context} changed={changed} onPick={onPick} />
        </section>
      )}
      {affected.length > 0 && (
        <section className="affected">
          <h4>{t.change.through(affected.length)}</h4>
          <ul>
            {affected.map((t) => (
              <li key={t}>
                <code>{t}</code>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

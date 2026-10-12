import type { Change, Level } from '@dsgraph/core'
import { formatDelta, formatValue } from '@dsgraph/report'
import { appliesIn, deltaWords, meaningOf } from '../lib/explain'
import type { TokenGraph } from '../lib/types'
import { cssColor, isColor, LEVEL_TITLE, sideValue } from '../lib/view'
import { GraphView } from './GraphView'

export const KIND_LABEL: Record<Change['kind'], string> = {
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
}

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
function subtitle(c: Change, type: string | null): string {
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
      return c.possibleRenames?.length ? `maybe → ${c.possibleRenames[0]}` : show(beforeOf(c))
    case 'token.type-changed':
      return `${String(c.before)} → ${String(c.after)}`
    case 'token.renamed':
      return c.confidence < 1 ? `renamed, ${Math.round(c.confidence * 100)}% sure` : 'renamed'
    default:
      return KIND_LABEL[c.kind]
  }
}

interface RowProps {
  change: Change
  type: string | null
  affected: number
  selected: boolean
  onSelect: () => void
}

export function ChangeRow({ change: c, type, affected, selected, onSelect }: RowProps) {
  const delta = typeof c.delta?.deltaEOK === 'number' ? `ΔE ${c.delta.deltaEOK}` : ''
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
      <span className="row__subtitle">{subtitle(c, type)}</span>
      <span className="row__acc">
        {c.when &&
          Object.values(c.when).map((v) => (
            <span key={v} className="tag">
              {v}
            </span>
          ))}
        {affected > 0 && (
          <span
            className="tag"
            title={`Also changes ${affected} token${affected === 1 ? '' : 's'} that use it`}
          >
            +{affected}
          </span>
        )}
        {delta && <span className="acc-text">{delta}</span>}
      </span>
    </div>
  )
}

function Big({ type, side, label }: { type: string | null; side: unknown; label: string }) {
  const v = sideValue(side)
  const alias = aliasOf(side)
  return (
    <figure className="preview">
      {isColor(v) ? (
        <span className="preview__swatch" style={{ background: cssColor(v) }} />
      ) : (
        <span className="preview__text">{v === undefined ? (alias ?? '—') : formatValue(type, v)}</span>
      )}
      <figcaption>
        <span className="muted">{label}</span>
        {isColor(v) && <code>{formatValue(type, v)}</code>}
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
}: DetailProps) {
  const before = beforeOf(c)
  const after = afterOf(c)
  const hasValues = before !== undefined || after !== undefined
  const sideGraph = graph && (c.kind === 'token.removed' ? graph.base : graph.head)
  const linked = sideGraph?.refs.some(([from, to]) => from === c.target || to === c.target)
  const delta = formatDelta(c.delta)
  const meta: Array<[string, React.ReactNode]> = [
    ['Change', KIND_LABEL[c.kind]],
    ['Impact', LEVEL_TITLE[c.level]],
  ]
  if (type) meta.push(['Type', type])
  meta.push(['Applies in', appliesIn(c.when, axes)])
  if (c.kind === 'token.renamed') {
    meta.push(['Old name', <code key="from">{c.from}</code>])
    meta.push([
      'How we know',
      c.confidence < 1
        ? `Same value, similar name (${Math.round(c.confidence * 100)}% sure)`
        : 'Declared or the same token id',
    ])
  }
  if (c.possibleRenames?.length)
    meta.push([
      'Possibly renamed to',
      c.possibleRenames.map((r) => (
        <code key={r} className="block">
          {r}
        </code>
      )),
    ])
  if (delta)
    meta.push([
      'Difference',
      typeof c.delta?.deltaEOK === 'number' ? `${delta} · ${deltaWords(c.delta.deltaEOK)}` : delta,
    ])
  if (c.kind === 'token.deprecated') {
    const d = c.after as { replacement?: string; reason?: string } | undefined
    if (d?.replacement) meta.push(['Use instead', <code key="r">{d.replacement}</code>])
    else if (d?.reason) meta.push(['Reason', d.reason])
  }
  if (c.note) meta.push(['Note', c.note])

  return (
    <div className="detail__body">
      <h3 className="detail__title">{c.target}</h3>
      {meaningOf(c) && <p className="detail__lead">{meaningOf(c)}</p>}
      {hasValues && (
        <div className="previews">
          {c.kind !== 'token.added' && <Big type={type} side={before} label="Before" />}
          {c.kind !== 'token.removed' && <Big type={type} side={after} label="After" />}
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
      {sideGraph && linked && (
        <section className="affected">
          <h4>In the graph</h4>
          <p className="graph-hint">Lines lead from a token to the tokens that take their value from it.</p>
          <GraphView id={c.target} graph={sideGraph} context={context} changed={changed} onPick={onPick} />
        </section>
      )}
      {affected.length > 0 && (
        <section className="affected">
          <h4>
            Changes {affected.length} token{affected.length === 1 ? '' : 's'} through references
          </h4>
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

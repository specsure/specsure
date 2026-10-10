import type { Change } from '@dsgraph/core'
import { formatDelta, formatValue } from '@dsgraph/report'
import { cssColor, isColor, LEVEL_TITLE, sideValue } from '../lib/view'

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
      return c.confidence < 1 ? `${Math.round(c.confidence * 100)}% match` : 'declared'
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
        {affected > 0 && <span className="tag">+{affected}</span>}
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
        <span className="preview__text">{v === undefined ? '—' : formatValue(type, v)}</span>
      )}
      <figcaption>
        <span className="muted">{label}</span>
        {isColor(v) && <code>{formatValue(type, v)}</code>}
        {alias && <code className="muted">{alias}</code>}
      </figcaption>
    </figure>
  )
}

interface DetailProps {
  change: Change
  type: string | null
  affected: string[]
}

export function ChangeDetail({ change: c, type, affected }: DetailProps) {
  const before = beforeOf(c)
  const after = afterOf(c)
  const hasValues = before !== undefined || after !== undefined
  const delta = formatDelta(c.delta)
  const meta: Array<[string, React.ReactNode]> = [
    ['Change', KIND_LABEL[c.kind]],
    ['Impact', LEVEL_TITLE[c.level]],
  ]
  if (type) meta.push(['Type', type])
  meta.push([
    'Context',
    c.when && Object.keys(c.when).length
      ? Object.entries(c.when)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ')
      : 'all',
  ])
  if (c.kind === 'token.renamed') {
    meta.push(['Old name', <code key="from">{c.from}</code>])
    meta.push(['Confidence', `${Math.round(c.confidence * 100)}%`])
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
  if (delta) meta.push(['Difference', delta])
  if (c.kind === 'token.deprecated') {
    const d = c.after as { replacement?: string; reason?: string } | undefined
    if (d?.replacement) meta.push(['Use instead', <code key="r">{d.replacement}</code>])
    else if (d?.reason) meta.push(['Reason', d.reason])
  }
  if (c.note) meta.push(['Note', c.note])

  return (
    <div className="detail__body">
      <h3 className="detail__title">{c.target}</h3>
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
      {affected.length > 0 && (
        <section className="affected">
          <h4>
            Changes {affected.length} token{affected.length === 1 ? '' : 's'} through aliases
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

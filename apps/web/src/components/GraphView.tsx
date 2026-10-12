import type { Level } from '@dsgraph/core'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { GraphNode, TokenGraph } from '../lib/types'
import { inContext } from '../lib/view'

interface Props {
  /** The token in the middle. */
  id: string
  graph: TokenGraph
  context: Record<string, string>
  /** Tokens that changed in this comparison, with their impact. */
  changed: Map<string, Level>
  /** Opens the change of a token, when it has one. */
  onPick?: ((id: string) => void) | undefined
}

const UP = 3
const DOWN = 3
const PER_ROW = 8

interface Row {
  ids: string[]
  more: number
  side: 'up' | 'self' | 'down'
}

/** Breadth-first rings around `id` along `next`, nearest first. */
function rings(
  id: string,
  next: Map<string, string[]>,
  depth: number,
): Array<{ ids: string[]; more: number }> {
  const seen = new Set([id])
  const out: Array<{ ids: string[]; more: number }> = []
  let frontier = [id]
  for (let d = 0; d < depth && frontier.length; d++) {
    const ring: string[] = []
    for (const f of frontier)
      for (const n of next.get(f) ?? [])
        if (!seen.has(n)) {
          seen.add(n)
          ring.push(n)
        }
    if (!ring.length) break
    out.push({ ids: ring.slice(0, PER_ROW), more: Math.max(0, ring.length - PER_ROW) })
    frontier = ring.slice(0, PER_ROW)
  }
  return out
}

function valueIn(node: GraphNode | undefined, context: Record<string, string>) {
  if (!node) return undefined
  return node.values.find((v) => inContext(v.when, context)) ?? node.values[0]
}

/**
 * The token in its graph: what it takes its value from (above, down to the literal) and what
 * uses it (below, up to three steps). Tokens changed in this comparison are marked.
 */
export function GraphView({ id, graph, context, changed, onPick }: Props) {
  const { rows, links } = useMemo(() => {
    const uses = new Map<string, string[]>()
    const usedBy = new Map<string, string[]>()
    for (const [from, to, when] of graph.refs) {
      if (!inContext(when ?? null, context)) continue
      uses.set(from, [...(uses.get(from) ?? []), to])
      usedBy.set(to, [...(usedBy.get(to) ?? []), from])
    }
    const up = rings(id, uses, UP).reverse()
    const down = rings(id, usedBy, DOWN)
    const rows: Row[] = [
      ...up.map((r) => ({ ...r, side: 'up' as const })),
      { ids: [id], more: 0, side: 'self' },
      ...down.map((r) => ({ ...r, side: 'down' as const })),
    ]
    // Lines between neighbouring rows: the lower token uses the upper one.
    const links: Array<[string, string]> = []
    for (let i = 0; i + 1 < rows.length; i++)
      for (const lower of rows[i + 1]!.ids)
        for (const upper of rows[i]!.ids) if (uses.get(lower)?.includes(upper)) links.push([upper, lower])
    return { rows, links }
  }, [graph, id, context])

  const box = useRef<HTMLDivElement>(null)
  const [paths, setPaths] = useState<string[]>([])
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const draw = () => {
      const origin = el.getBoundingClientRect()
      const at = (nodeId: string) =>
        el.querySelector<HTMLElement>(`[data-node="${CSS.escape(nodeId)}"]`)?.getBoundingClientRect()
      const next: string[] = []
      for (const [upper, lower] of links) {
        const a = at(upper)
        const b = at(lower)
        if (!a || !b) continue
        const x1 = a.left + a.width / 2 - origin.left
        const y1 = a.bottom - origin.top
        const x2 = b.left + b.width / 2 - origin.left
        const y2 = b.top - origin.top
        const mid = (y1 + y2) / 2
        next.push(`M${x1} ${y1} C${x1} ${mid} ${x2} ${mid} ${x2} ${y2}`)
      }
      setPaths(next)
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(el)
    return () => ro.disconnect()
  }, [links])

  if (rows.length === 1) return null
  const firstDown = rows.findIndex((r) => r.side === 'down')

  return (
    <div className="graph" ref={box}>
      <svg className="graph__lines" aria-hidden="true">
        {paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
      {rows.map((row, i) => (
        <div key={row.ids[0]} className={`graph__row graph__row--${row.side}`}>
          {i === 0 && row.side === 'up' && <span className="graph__label">Takes its value from</span>}
          {i === firstDown && <span className="graph__label">Used by</span>}
          {row.ids.map((n) => {
            const v = valueIn(graph.nodes[n], context)
            const level = changed.get(n)
            const pickable = !!onPick && n !== id && level !== undefined
            const body = (
              <>
                {v?.swatch ? (
                  <span className="graph__swatch" style={{ background: v.swatch }} />
                ) : (
                  level && <span className={`graph__dot graph__dot--${level}`} />
                )}
                <span className="graph__name">{n}</span>
                {v && !v.swatch && row.side === 'up' && i === 0 && (
                  <span className="graph__value">{v.text}</span>
                )}
              </>
            )
            const cls = `graph__node${n === id ? ' is-self' : ''}${level ? ` is-changed graph__node--${level}` : ''}`
            return pickable ? (
              <button
                key={n}
                type="button"
                data-node={n}
                className={cls}
                title={`${n}: ${v?.text ?? ''} · open this change`}
                onClick={() => onPick?.(n)}
              >
                {body}
              </button>
            ) : (
              <span key={n} data-node={n} className={cls} title={`${n}: ${v?.text ?? ''}`}>
                {body}
              </span>
            )
          })}
          {row.more > 0 && <span className="graph__more">+{row.more} more</span>}
        </div>
      ))}
    </div>
  )
}

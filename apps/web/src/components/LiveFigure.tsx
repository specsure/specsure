import type { Level } from '@dsgraph/core'
import { formatChangeset } from '@dsgraph/report'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import type { Lang } from '../i18n'
import { LangProvider, useT } from '../i18n/react'
import { drawCard } from '../lib/card'
import { compare } from '../lib/compare'
import { EXAMPLE, LEGACY_EXAMPLE } from '../lib/example'
import type { RunRequest } from '../lib/types'
import { colorPairs, LEVELS, typeOfChange, view } from '../lib/view'
import { ChangeDetail, ChangeRow } from './ChangeList'
import { GraphView } from './GraphView'
import { Findings, type Result, Results } from './Results'
import { SidePicker } from './SidePicker'

/**
 * Live figures for the guide and the home page. Each one runs the real engine on a small synthetic
 * design system in the reader's browser and renders the same components as Token Diff, so the
 * pictures cannot drift from the product.
 */
export type FigureName =
  | 'graph'
  | 'inputs'
  | 'result'
  | 'breaking'
  | 'color'
  | 'rename'
  | 'themes'
  | 'checks'
  | 'markdown'
  | 'card'

const cache = new Map<string, Promise<Result>>()

function run(key: string, req: Omit<RunRequest, 'id'>): Promise<Result> {
  let p = cache.get(key)
  if (!p) {
    p = compare({ id: 0, ...req }).then((r) => {
      if (!r.ok) throw new Error(r.error)
      return { ...r, types: new Map(r.types) }
    })
    cache.set(key, p)
  }
  return p
}

const example = () =>
  run('example', {
    base: { kind: 'files', files: EXAMPLE.base },
    head: { kind: 'files', files: EXAMPLE.head },
    include: '',
  })
const legacy = () =>
  run('legacy', {
    base: { kind: 'files', files: LEGACY_EXAMPLE },
    head: { kind: 'files', files: LEGACY_EXAMPLE },
    include: '',
  })

function useResult(load: () => Promise<Result>) {
  const [state, setState] = useState<{ result?: Result; error?: string }>({})
  useEffect(() => {
    load().then(
      (result) => setState({ result }),
      (e: Error) => setState({ error: e.message }),
    )
  }, [load])
  return state
}

const noop = () => {}

export default function LiveFigure({
  name,
  caption,
  lang = 'en',
}: {
  name: FigureName
  caption?: string
  lang?: Lang
}) {
  return (
    <LangProvider lang={lang}>
      <Figure name={name} caption={caption} />
    </LangProvider>
  )
}

function Figure({ name, caption }: { name: FigureName; caption?: string | undefined }) {
  const t = useT()
  const { result, error } = useResult(name === 'checks' ? legacy : example)
  let body: ReactNode = <div className="figure__loading">{t.figure.running}</div>
  if (error) body = <div className="figure__loading">{error}</div>
  else if (result) body = <Body name={name} result={result} />
  return (
    <figure className={`figure figure--${name}`}>
      {body}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  )
}

function Body({ name, result }: { name: FigureName; result: Result }) {
  const t = useT()
  const cs = result.changeset
  const find = (kind: string, target?: string) =>
    cs.changes.find((c) => c.kind === kind && (!target || c.target === target))

  switch (name) {
    case 'inputs':
      return (
        <div className="window inputs">
          <SidePicker
            side="base"
            value={{ kind: 'files', files: EXAMPLE.base }}
            onChange={noop}
            info={result.base}
          />
          <SidePicker
            side="head"
            value={{ kind: 'files', files: EXAMPLE.head }}
            onChange={noop}
            info={result.head}
          />
          <footer className="actionbar">
            <span className="actionbar__status" />
            <span className="ghost-label">{t.figure.compare}</span>
          </footer>
        </div>
      )
    case 'result':
      return <LiveResult result={result} />
    case 'graph': {
      if (!result.graph) return null
      const changed = new Map<string, Level>()
      for (const c of cs.changes) {
        const prev = changed.get(c.target)
        if (!prev || LEVELS.indexOf(c.level) < LEVELS.indexOf(prev)) changed.set(c.target, c.level)
      }
      return <GraphView id="color-blue-500" graph={result.graph.head} context={{}} changed={changed} />
    }
    case 'breaking': {
      const v = view(cs, result.types, { context: {}, levels: ['major'], types: [], query: '' })
      return (
        <div className="window list list--static">
          <div className="list__section list__section--major">{t.levels.major}</div>
          {v.byLevel.major.map((c) => (
            <ChangeRow
              key={c.id}
              change={c}
              type={typeOfChange(c, result.types)}
              affected={0}
              selected={false}
              onSelect={noop}
            />
          ))}
        </div>
      )
    }
    case 'color':
    case 'rename': {
      const c = name === 'color' ? find('token.value-changed', 'color-blue-500') : find('token.renamed')
      if (!c) return null
      const v = view(cs, result.types, { context: {}, levels: LEVELS, types: [], query: '' })
      const affected = [...new Set((v.propagatedBy.get(c.id) ?? []).map((p) => p.target))]
      return (
        <div className="window detail detail--static">
          <ChangeDetail change={c} type={typeOfChange(c, result.types)} affected={affected} />
        </div>
      )
    }
    case 'themes':
      return (
        <div className="figure__pair">
          {['default', 'dark'].map((theme) => {
            const v = view(cs, result.types, {
              context: { theme },
              levels: ['minor'],
              types: ['color'],
              query: '',
            })
            return (
              <div key={theme} className="window list list--static">
                <div className="list__section">theme: {theme}</div>
                {v.byLevel.minor.map((c) => (
                  <ChangeRow
                    key={c.id}
                    change={c}
                    type="color"
                    affected={0}
                    selected={c.target === 'color-accent'}
                    onSelect={noop}
                  />
                ))}
              </div>
            )
          })}
        </div>
      )
    case 'checks':
      return <Findings findings={result.findings} label="tokens.json" open />
    case 'markdown':
      return (
        <pre className="window figure__code">
          <code>{formatChangeset(cs, { format: 'markdown', types: result.types }).trim()}</code>
        </pre>
      )
    case 'card':
      return <Card result={result} />
  }
}

function LiveResult({ result }: { result: Result }) {
  const [context, setContext] = useState<Record<string, string>>({})
  return <Results result={result} context={context} onContext={setContext} shortcuts={false} />
}

function Card({ result }: { result: Result }) {
  const t = useT()
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cs = result.changeset
    const c = cs.summary.counts
    if (canvas.current)
      drawCard(
        canvas.current,
        {
          title: t.card.designTokens,
          from: 'v1',
          to: 'v2',
          level: cs.summary.level,
          counts: (['removed', 'renamed', 'changed', 'added'] as const).map((k) => [
            t.card.counts[k](c[k] ?? 0),
            c[k] ?? 0,
          ]),
          colors: colorPairs(cs),
          empty: cs.changes.length === 0,
          labels: { badge: t.card.badge, noChanges: t.card.noChanges, colors: t.card.colors },
        },
        2,
      )
  }, [result, t])
  return <canvas ref={canvas} className="card-preview figure__card" />
}

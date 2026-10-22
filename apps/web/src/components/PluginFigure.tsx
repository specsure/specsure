import { figmaTokens } from '@dsgraph/adapters/figma'
import { useEffect, useRef, useState } from 'react'
import ui from '../../../figma-plugin/ui.html?raw'
import type { Lang } from '../i18n'
import { LangProvider, useT } from '../i18n/react'
import { FIGMA_EXAMPLE } from '../lib/figma-example'

/**
 * The Figma plugin in the guide: its own interface, the same file Figma shows, with this page in
 * Figma's place. Read file converts a small example file with the plugin's converter, so what the
 * figure shows and downloads is what the plugin gives for that file.
 */
export default function PluginFigure({ lang = 'en', caption }: { lang?: Lang; caption?: string }) {
  return (
    <LangProvider lang={lang}>
      <Figure caption={caption} />
    </LangProvider>
  )
}

const light = () => {
  const forced = document.documentElement.dataset.theme
  return forced ? forced === 'light' : matchMedia('(prefers-color-scheme: light)').matches
}

function Figure({ caption }: { caption?: string | undefined }) {
  const t = useT()
  const frame = useRef<HTMLIFrameElement>(null)
  const [run, setRun] = useState(0)

  useEffect(() => {
    const scheme = matchMedia('(prefers-color-scheme: light)')
    const paint = () =>
      frame.current?.contentDocument?.documentElement.classList.toggle('figma-dark', !light())
    scheme.addEventListener('change', paint)
    const onMessage = (e: MessageEvent) => {
      const w = frame.current?.contentWindow
      if (!w || e.source !== w) return
      const m = e.data?.pluginMessage
      if (m?.type === 'open' && typeof m.url === 'string' && m.url.startsWith('https://'))
        window.open(m.url, '_blank', 'noopener')
      if (m?.type === 'export')
        // A moment of reading, as in Figma: the conversion itself takes a few milliseconds.
        setTimeout(() => {
          const out = figmaTokens(FIGMA_EXAMPLE)
          w.postMessage({ pluginMessage: { type: 'result', name: FIGMA_EXAMPLE.file.name, ...out } }, '*')
        }, 450)
    }
    window.addEventListener('message', onMessage)
    return () => {
      scheme.removeEventListener('change', paint)
      window.removeEventListener('message', onMessage)
    }
  }, [])

  return (
    <figure className="figure figure--plugin">
      <div className="plugin-figure">
        <div className="plugin-figure__window">
          <div className="plugin-figure__bar">
            <svg width="14" height="14" viewBox="0 0 32 32" aria-hidden="true">
              <rect x="2" y="5" width="20" height="10.5" rx="5.25" fill="currentColor" />
              <rect x="10" y="16.5" width="20" height="10.5" rx="5.25" fill="var(--accent-fill)" />
            </svg>
            <span>Specsure Token Export</span>
          </div>
          <iframe
            key={run}
            ref={frame}
            title="Specsure Token Export"
            srcDoc={ui}
            width={320}
            height={440}
            onLoad={() =>
              frame.current?.contentDocument?.documentElement.classList.toggle('figma-dark', !light())
            }
          />
        </div>
        <button type="button" className="ghost plugin-figure__again" onClick={() => setRun((n) => n + 1)}>
          {t.figure.again}
        </button>
      </div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  )
}

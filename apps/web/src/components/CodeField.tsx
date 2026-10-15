import { useRef, useState } from 'react'
import { useT } from '../i18n/react'
import { codeFromDrop, codeFromInput } from '../lib/files'
import type { CodeReport, DroppedFile } from '../lib/types'

interface Props {
  files: DroppedFile[]
  onChange: (files: DroppedFile[]) => void
  /** What the last comparison read from it. */
  report?: CodeReport | undefined
}

/** The optional third row of the input window: the project that uses the tokens. */
export function CodeField({ files, onChange, report }: Props) {
  const t = useT()
  const y = t.yourCode
  const [over, setOver] = useState(false)
  const dir = useRef<HTMLInputElement>(null)
  const meta = !files.length
    ? null
    : report
      ? [y.read(report.files), report.skipped.length ? y.skipped(report.skipped.length) : '']
          .filter(Boolean)
          .join(' · ')
      : y.note

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a drop target; the folder button is the keyboard path
    <div
      className={`source source--code${over ? ' source--over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
      }}
      onDrop={async (e) => {
        e.preventDefault()
        setOver(false)
        const list = await codeFromDrop(e.dataTransfer)
        if (list.length) onChange(list)
      }}
    >
      <div className="source__row">
        <span className="source__label">{y.title}</span>
        <div className="source__files">
          {files.length === 0 ? (
            <span className="muted">{y.drop}</span>
          ) : (
            <span className="source__names" title={files.map((f) => f.path).join('\n')}>
              {files.length === 1 ? files[0]!.path : t.inputs.andMore(files[0]!.path, files.length - 1)}
            </span>
          )}
          <span className="source__file-actions">
            <button type="button" className="ghost" onClick={() => dir.current?.click()}>
              {y.folder}
            </button>
            {files.length > 0 && (
              <button type="button" className="ghost" onClick={() => onChange([])} aria-label={y.clearAria}>
                {y.clear}
              </button>
            )}
          </span>
          <input
            ref={dir}
            type="file"
            hidden
            // @ts-expect-error: non-standard but supported by every current browser
            webkitdirectory=""
            onChange={async (e) => onChange(await codeFromInput(e.target.files))}
          />
        </div>
      </div>
      {meta && <div className="source__meta">{meta}</div>}
    </div>
  )
}

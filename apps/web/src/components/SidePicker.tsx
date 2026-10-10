import { type NpmVersions, npmVersions, parseRemoteSpec } from '@dsgraph/sources'
import { useEffect, useRef, useState } from 'react'
import { filesFromDrop, filesFromInput } from '../lib/files'
import type { DroppedFile, SideInfo, SideInput } from '../lib/types'

type Kind = SideInput['kind']

const KINDS: Array<[Kind, string]> = [
  ['npm', 'npm'],
  ['github', 'GitHub'],
  ['files', 'Files'],
]

const isStable = (v: string) => !v.includes('-')

/** Versions to compare by default: the latest and the stable release before it. */
export function defaultVersions(v: NpmVersions): { base: string; head: string } {
  const head = v.tags.latest ?? v.versions[0] ?? 'latest'
  const i = v.versions.indexOf(head)
  const base = v.versions.slice(i + 1).find(isStable) ?? v.versions[i + 1] ?? head
  return { base, head }
}

const versionCache = new Map<string, Promise<NpmVersions>>()
const versionsOf = (pkg: string) => {
  let p = versionCache.get(pkg)
  if (!p) {
    p = npmVersions(pkg)
    p.catch(() => versionCache.delete(pkg))
    versionCache.set(pkg, p)
  }
  return p
}

function useVersions(pkg: string) {
  const [state, setState] = useState<{ pkg: string; data?: NpmVersions; error?: string }>({ pkg: '' })
  useEffect(() => {
    const name = pkg.trim()
    if (!/^(@[\w.-]+\/)?[\w.-]+$/.test(name)) {
      setState({ pkg: name })
      return
    }
    let live = true
    const t = setTimeout(() => {
      versionsOf(name).then(
        (data) => live && setState({ pkg: name, data }),
        (e: Error) => live && setState({ pkg: name, error: e.message }),
      )
    }, 350)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [pkg])
  return state.pkg === pkg.trim() ? state : { pkg }
}

interface Props {
  side: 'base' | 'head'
  value: SideInput
  onChange: (v: SideInput) => void
  error?: string | undefined
  info?: SideInfo | undefined
}

/** One source row of the input window. Dropping files anywhere on it switches it to files. */
export function SidePicker({ side, value, onChange, error, info }: Props) {
  const [over, setOver] = useState(false)
  const setKind = (kind: Kind) => {
    if (kind === value.kind) return
    if (kind === 'npm') onChange({ kind: 'npm', pkg: '', version: '' })
    else if (kind === 'github') onChange({ kind: 'github', repo: '', ref: '' })
    else onChange({ kind: 'files', files: [] })
  }
  const versions = useVersions(value.kind === 'npm' ? value.pkg : '')
  const meta = error ? (
    <span className="source__error">{error}</span>
  ) : value.kind === 'npm' && versions.error ? (
    <span className="source__error">{versions.error}</span>
  ) : info ? (
    <span title={info.files.join('\n')}>
      {info.tokens} tokens · {info.files.length === 1 ? info.files[0] : `${info.files.length} files`}
      {info.modifiers.map((m) => ` · ${m.name}: ${m.contexts.join(', ')}`).join('')}
    </span>
  ) : null

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a drop target; the inputs inside are the keyboard path
    <div
      className={`source${over ? ' source--over' : ''}${error ? ' source--error' : ''}`}
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
        const files = await filesFromDrop(e.dataTransfer)
        if (files.length) onChange({ kind: 'files', files })
      }}
    >
      <div className="source__row">
        <span className="source__label">{side === 'base' ? 'Before' : 'After'}</span>
        <div className="seg" role="tablist" aria-label="Source">
          {KINDS.map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={value.kind === k}
              className={value.kind === k ? 'is-on' : ''}
              onClick={() => setKind(k)}
            >
              {label}
            </button>
          ))}
        </div>
        {value.kind === 'npm' && (
          <NpmFields side={side} value={value} onChange={onChange} versions={versions} />
        )}
        {value.kind === 'github' && <GitHubFields value={value} onChange={onChange} />}
        {value.kind === 'files' && <FilesField files={value.files} onChange={onChange} />}
      </div>
      {meta && <div className="source__meta">{meta}</div>}
    </div>
  )
}

function NpmFields({
  side,
  value,
  onChange,
  versions,
}: {
  side: 'base' | 'head'
  value: Extract<SideInput, { kind: 'npm' }>
  onChange: (v: SideInput) => void
  versions: ReturnType<typeof useVersions>
}) {
  const data = versions.data
  // Pick sensible versions once the list arrives and none is chosen yet.
  useEffect(() => {
    if (data && !value.version) onChange({ ...value, version: defaultVersions(data)[side] })
  }, [data, value, side, onChange])
  const options = data
    ? [...new Set([...(data.versions.includes(value.version) ? [] : [value.version]), ...data.versions])]
    : []
  return (
    <>
      <input
        className="source__input"
        aria-label="Package"
        value={value.pkg}
        placeholder="Package name, e.g. @scope/tokens"
        spellCheck={false}
        autoCapitalize="off"
        onChange={(e) => onChange({ kind: 'npm', pkg: e.target.value.trim(), version: '' })}
      />
      {data ? (
        <select
          className="accessory"
          aria-label="Version"
          value={value.version}
          onChange={(e) => onChange({ ...value, version: e.target.value })}
        >
          {options.filter(Boolean).map((v) => (
            <option key={v} value={v}>
              {v}
              {data.tags.latest === v ? '  latest' : ''}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="accessory"
          aria-label="Version"
          value={value.version}
          placeholder={value.pkg && !versions.error ? '…' : 'version'}
          spellCheck={false}
          onChange={(e) => onChange({ ...value, version: e.target.value.trim() })}
        />
      )}
    </>
  )
}

function GitHubFields({
  value,
  onChange,
}: {
  value: Extract<SideInput, { kind: 'github' }>
  onChange: (v: SideInput) => void
}) {
  const shown = value.repo ? `${value.repo}${value.root ? `/${value.root}` : ''}` : ''
  const [text, setText] = useState(shown)
  useEffect(() => setText(shown), [shown])
  const commit = (repoPath: string) => {
    const r = parseRemoteSpec(
      `github:${repoPath.replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '')}`,
    )
    if (r?.kind === 'github') {
      const next: SideInput = { kind: 'github', repo: r.repo, ref: value.ref }
      if (r.root) next.root = r.root
      onChange(next)
    }
  }
  return (
    <>
      <input
        className="source__input"
        aria-label="Repository and folder"
        value={text}
        placeholder="owner/repo/tokens"
        spellCheck={false}
        autoCapitalize="off"
        onChange={(e) => {
          setText(e.target.value)
          commit(e.target.value.trim())
        }}
      />
      <input
        className="accessory"
        aria-label="Branch, tag or commit"
        value={value.ref}
        placeholder="main"
        spellCheck={false}
        onChange={(e) => onChange({ ...value, ref: e.target.value.trim() })}
      />
    </>
  )
}

function FilesField({ files, onChange }: { files: DroppedFile[]; onChange: (v: SideInput) => void }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const dirInput = useRef<HTMLInputElement>(null)
  const set = (list: DroppedFile[]) => onChange({ kind: 'files', files: list })
  return (
    <div className="source__files">
      {files.length === 0 ? (
        <span className="muted">Drop token files or a folder here</span>
      ) : (
        <span className="source__names" title={files.map((f) => f.path).join('\n')}>
          {files.length === 1 ? files[0]!.path : `${files[0]!.path} and ${files.length - 1} more`}
        </span>
      )}
      <span className="source__file-actions">
        <button type="button" className="ghost" onClick={() => fileInput.current?.click()}>
          Files
        </button>
        <button type="button" className="ghost" onClick={() => dirInput.current?.click()}>
          Folder
        </button>
        {files.length > 0 && (
          <button type="button" className="ghost" onClick={() => set([])} aria-label="Clear files">
            Clear
          </button>
        )}
      </span>
      <input
        ref={fileInput}
        type="file"
        multiple
        accept=".json,.jsonc,.tokens,.css"
        hidden
        onChange={async (e) => set(await filesFromInput(e.target.files))}
      />
      <input
        ref={dirInput}
        type="file"
        hidden
        // @ts-expect-error: non-standard but supported by every current browser
        webkitdirectory=""
        onChange={async (e) => set(await filesFromInput(e.target.files))}
      />
    </div>
  )
}

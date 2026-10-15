import { NOT_TOKENS } from '@dsgraph/core'
import type { DroppedFile } from './types'

/** What to read from a drop: token files for a side, or a project's code. */
interface Profile {
  file: RegExp
  /** Folders not walked at all. */
  skipDir: RegExp
  /** Files we refuse to read in full: too big to be what people write. */
  maxBytes: number
  /** Stop after this many files: a drop of a whole disk should not hang the tab. */
  maxFiles: number
}

const TOKENS: Profile = {
  file: /\.(json|jsonc|tokens|css)$/i,
  skipDir: /^(node_modules|\.git)$/,
  maxBytes: 5_000_000,
  maxFiles: 5_000,
}

const CODE: Profile = {
  file: /\.(css|scss|sass|js|jsx|mjs|cjs|ts|tsx|mts|cts|vue|svelte|astro|html?)$/i,
  skipDir:
    /^(node_modules|\.git|dist|build|out|\.next|\.nuxt|\.svelte-kit|\.astro|\.turbo|\.vercel|\.output|coverage|storybook-static|vendor)$/,
  maxBytes: 500_000,
  maxFiles: 5_000,
}

/** Build output, kept only when nothing else has tokens (a published package, or `dist` itself). */
const BUILD = /(^|\/)dist\//

const skippedPath = (path: string, p: Profile) =>
  path
    .split('/')
    .slice(0, -1)
    .some((seg) => p.skipDir.test(seg))

async function readEntry(entry: FileSystemEntry, out: DroppedFile[], p: Profile): Promise<void> {
  if (out.length >= p.maxFiles) return
  if (entry.isFile) {
    const path = entry.fullPath.replace(/^\//, '')
    if (!p.file.test(path)) return
    const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej))
    if (file.size <= p.maxBytes) out.push({ path, text: await file.text() })
    return
  }
  if (entry.isDirectory) {
    if (p.skipDir.test(entry.name)) return
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej))
      if (batch.length === 0) break
      for (const e of batch) await readEntry(e, out, p)
    }
  }
}

async function fromDrop(dt: DataTransfer, p: Profile): Promise<DroppedFile[]> {
  const out: DroppedFile[] = []
  const entries = [...dt.items].map((i) => i.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e)
  if (entries.length) for (const e of entries) await readEntry(e, out, p)
  else await addFiles([...dt.files], out, p)
  return out
}

async function addFiles(files: File[], out: DroppedFile[], p: Profile) {
  for (const f of files) {
    if (out.length >= p.maxFiles) return
    const path = f.webkitRelativePath || f.name
    if (p.file.test(path) && !skippedPath(path, p) && f.size <= p.maxBytes)
      out.push({ path, text: await f.text() })
  }
}

/** Files and folders from a drop; folders are walked, only JSON, .tokens and CSS files are kept. */
export async function filesFromDrop(dt: DataTransfer): Promise<DroppedFile[]> {
  return dropCommonRoot(withoutBuild(await fromDrop(dt, TOKENS)))
}

export async function filesFromInput(list: FileList | null): Promise<DroppedFile[]> {
  const out: DroppedFile[] = []
  await addFiles([...(list ?? [])], out, TOKENS)
  return dropCommonRoot(withoutBuild(out))
}

/** A project's code from a drop: styles, scripts and markup; dependencies and build output left out. */
export async function codeFromDrop(dt: DataTransfer): Promise<DroppedFile[]> {
  return dropCommonRoot(await fromDrop(dt, CODE))
}

export async function codeFromInput(list: FileList | null): Promise<DroppedFile[]> {
  const out: DroppedFile[] = []
  await addFiles([...(list ?? [])], out, CODE)
  return dropCommonRoot(out)
}

function withoutBuild(files: DroppedFile[]): DroppedFile[] {
  const source = files.filter((f) => !BUILD.test(f.path))
  return source.some((f) => !NOT_TOKENS.test(f.path)) ? source : files
}

/** `tokens/a.json`, `tokens/b.json` → `a.json`, `b.json`, so both versions of a folder line up. */
function dropCommonRoot(files: DroppedFile[]): DroppedFile[] {
  if (files.length < 1) return files
  const first = files[0]!.path.split('/')
  if (first.length < 2) return files
  const root = `${first[0]}/`
  if (!files.every((f) => f.path.startsWith(root))) return files
  return files.map((f) => ({ ...f, path: f.path.slice(root.length) }))
}

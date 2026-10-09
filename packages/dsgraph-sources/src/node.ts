import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { matchGlob, type Source, type SourceMeta } from '@dsgraph/core'

const SKIP = new Set(['node_modules', '.git'])

/** Node file system rooted at a directory. CLI and GitHub Action only. */
export class NodeFsSource implements Source {
  readonly id: string
  private files?: string[]

  constructor(readonly root: string) {
    this.id = `node:${root}`
  }

  private async walk(): Promise<string[]> {
    const out: string[] = []
    const visit = async (dir: string) => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (!SKIP.has(entry.name)) await visit(join(dir, entry.name))
        } else if (entry.isFile()) {
          out.push(relative(this.root, join(dir, entry.name)).split(sep).join('/'))
        }
      }
    }
    await visit(this.root)
    return out.sort()
  }

  async list(patterns: string | readonly string[]): Promise<string[]> {
    this.files ??= await this.walk()
    return this.files.filter((p) => matchGlob(p, patterns))
  }

  async readText(path: string): Promise<string> {
    return readFile(join(this.root, ...path.split('/')), 'utf8')
  }

  async meta(): Promise<SourceMeta> {
    return { kind: 'folder', path: this.root }
  }
}

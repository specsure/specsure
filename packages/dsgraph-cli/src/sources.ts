import { readFile, stat } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { cssTokens, jsonTokens } from '@dsgraph/adapters'
import { type Config, DsGraph, type Snapshot, type Source, scan, validateSnapshot } from '@dsgraph/core'
import { MemorySource, parseRemoteSpec, remoteSource } from '@dsgraph/sources'
import { NodeFsSource } from '@dsgraph/sources/node'

/**
 * Turns a source argument into a graph:
 * `npm:@scope/pkg@^2`, `github:owner/repo/path@ref`, a folder, a token file (.json, .tokens, .css,
 * .resolver.json) or a saved snapshot (`dsgraph scan --out`).
 */
export async function loadGraph(spec: string, config: Config, cwd: string): Promise<DsGraph> {
  const { source, config: cfg, snapshot } = await toSource(spec, config, cwd)
  if (snapshot) return DsGraph.from(snapshot)
  return DsGraph.from(await scan(source!, cfg, { adapters: [jsonTokens, cssTokens] }))
}

export async function toSource(
  spec: string,
  config: Config,
  cwd: string,
): Promise<{ source?: Source; config: Config; snapshot?: Snapshot }> {
  const remote = parseRemoteSpec(spec)
  if (remote) {
    const token = process.env.GITHUB_TOKEN
    return { source: remoteSource(remote, token ? { token } : {}), config }
  }

  const path = resolve(cwd, spec)
  const info = await stat(path).catch(() => undefined)
  if (!info) throw new Error(`Source not found: ${spec}`)
  if (info.isDirectory()) return { source: new NodeFsSource(path), config }

  const name = basename(path)
  if (name.endsWith('.resolver.json'))
    return {
      source: new NodeFsSource(dirname(path)),
      config: { ...config, tokens: { ...config.tokens, resolver: name } },
    }
  const text = await readFile(path, 'utf8')
  if (name.endsWith('.json')) {
    try {
      const parsed = JSON.parse(text) as { schema?: unknown }
      if (parsed.schema === 'dsgraph/snapshot@1') {
        const v = validateSnapshot(parsed)
        if (!v.ok) throw new Error(`Invalid snapshot ${spec}: ${v.errors[0]?.path} ${v.errors[0]?.message}`)
        return { snapshot: parsed as Snapshot, config }
      }
    } catch (e) {
      if ((e as Error).message.startsWith('Invalid snapshot')) throw e
    }
  }
  const meta = { kind: 'files', path }
  if (name.endsWith('.css'))
    return {
      source: new MemorySource({ [name]: text }, meta),
      config: { ...config, css: { ...config.css, include: [name] } },
    }
  return {
    source: new MemorySource({ [name]: text }, meta),
    config: { ...config, tokens: { ...config.tokens, include: [name] } },
  }
}

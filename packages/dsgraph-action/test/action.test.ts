import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fit, MARKER, type Runtime, run } from '../src/run.js'

const css = (vars: Record<string, string>) =>
  `:root {\n${Object.entries(vars)
    .map(([k, v]) => `  --${k}: ${v};`)
    .join('\n')}\n}\n`

async function workspace(base: Record<string, string>, head: Record<string, string>) {
  const dir = await mkdtemp(join(tmpdir(), 'dsgraph-action-'))
  await mkdir(join(dir, 'tokens'))
  await mkdir(join(dir, 'previous'))
  await writeFile(join(dir, 'tokens/tokens.css'), css(head))
  await writeFile(join(dir, 'previous/tokens.css'), css(base))
  await writeFile(
    join(dir, 'event.json'),
    JSON.stringify({ pull_request: { number: 7, base: { sha: 'abc', ref: 'main' }, head: { sha: 'def' } } }),
  )
  await writeFile(join(dir, 'summary.md'), '')
  await writeFile(join(dir, 'output.txt'), '')
  return dir
}

interface Call {
  url: string
  method: string
  body?: string
}

function runtime(
  dir: string,
  inputs: Record<string, string>,
  comments: Array<{ id: number; body: string }> = [],
) {
  const calls: Call[] = []
  const logs: string[] = []
  const env: Record<string, string> = {
    GITHUB_WORKSPACE: dir,
    GITHUB_REPOSITORY: 'owner/repo',
    GITHUB_EVENT_PATH: join(dir, 'event.json'),
    GITHUB_STEP_SUMMARY: join(dir, 'summary.md'),
    GITHUB_OUTPUT: join(dir, 'output.txt'),
    GITHUB_API_URL: 'https://api.test',
    'INPUT_GITHUB-TOKEN': 'token',
  }
  for (const [k, v] of Object.entries(inputs)) env[`INPUT_${k.toUpperCase()}`] = v
  const rt: Runtime = {
    env,
    readText: (p) => readFile(p, 'utf8'),
    appendText: async (p, t) => writeFile(p, (await readFile(p, 'utf8')) + t),
    fetch: (async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? 'GET', ...(init?.body ? { body: String(init.body) } : {}) })
      const json = init?.method ? { id: 1 } : comments
      return new Response(JSON.stringify(json), { status: 200 })
    }) as typeof fetch,
    log: (l) => logs.push(l),
  }
  return { rt, calls, logs }
}

describe('dsgraph-action', () => {
  it('reports a breaking change, comments once and fails on major', async () => {
    const dir = await workspace({ 'color-bg': '#fff', 'space-sm': '8px' }, { 'color-bg': '#fafafa' })
    const { rt, calls, logs } = runtime(dir, { path: 'tokens', base: './previous', 'fail-on': 'major' })
    expect(await run(rt)).toBe(1)
    const summary = await readFile(join(dir, 'summary.md'), 'utf8')
    expect(summary).toContain('suggested bump: major')
    expect(summary).toContain('space-sm')
    expect(await readFile(join(dir, 'output.txt'), 'utf8')).toContain('level=major')
    const post = calls.find((c) => c.method === 'POST')
    expect(post?.url).toBe('https://api.test/repos/owner/repo/issues/7/comments')
    expect(JSON.parse(post!.body!).body.startsWith(MARKER)).toBe(true)
    expect(logs.some((l) => l.startsWith('::error::'))).toBe(true)
  })

  it('updates its own comment instead of adding another', async () => {
    const dir = await workspace({ 'color-bg': '#fff' }, { 'color-bg': '#000' })
    const { rt, calls } = runtime(dir, { path: 'tokens', base: './previous' }, [
      { id: 3, body: 'someone else' },
      { id: 5, body: `${MARKER}\nold report` },
    ])
    expect(await run(rt)).toBe(0)
    expect(calls.find((c) => c.method === 'PATCH')?.url).toBe(
      'https://api.test/repos/owner/repo/issues/comments/5',
    )
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('posts nothing while there are no changes', async () => {
    const dir = await workspace({ 'color-bg': '#fff' }, { 'color-bg': '#fff' })
    const { rt, calls } = runtime(dir, { path: 'tokens', base: './previous', 'fail-on': 'patch' })
    expect(await run(rt)).toBe(0)
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([])
    expect(await readFile(join(dir, 'output.txt'), 'utf8')).toContain('level=none')
  })

  it('reads a single file and keeps going when it may not comment', async () => {
    const dir = await workspace({ 'color-bg': '#fff' }, { 'color-bg': '#000' })
    const { rt, logs } = runtime(dir, { path: 'tokens/tokens.css', base: './previous' })
    rt.fetch = (async () => new Response('{}', { status: 403 })) as typeof fetch
    expect(await run(rt)).toBe(0)
    expect(logs.some((l) => l.startsWith('::warning::Could not comment'))).toBe(true)
    expect(await readFile(join(dir, 'summary.md'), 'utf8')).toContain('color-bg')
  })

  it('names the head by its path and keeps comments under the size limit', async () => {
    const dir = await workspace({ 'color-bg': '#fff' }, { 'color-bg': '#000' })
    const { rt } = runtime(dir, { path: 'tokens', base: './previous', comment: 'false' })
    await run(rt)
    const summary = await readFile(join(dir, 'summary.md'), 'utf8')
    expect(summary).not.toContain(dir)
    expect(summary).toContain('→ tokens')
    const long = `<details>\n${'- removed `x`\n'.repeat(10_000)}</details>\n`
    const cut = fit(long, 1000)
    expect(cut.length).toBeLessThan(1200)
    expect(cut).toContain('</details>')
    expect(cut).toContain('job summary')
  })

  it('asks for a base outside pull requests', async () => {
    const dir = await workspace({}, {})
    const { rt, logs } = runtime(dir, { path: 'tokens' })
    delete rt.env.GITHUB_EVENT_PATH
    expect(await run(rt)).toBe(2)
    expect(logs[0]).toContain('Set `base`')
  })
})

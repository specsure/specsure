import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { beforeAll, describe, expect, it } from 'vitest'
import { createServer } from '../src/server.js'

const v1 = `:root {
  --color-blue-500: #2563eb;
  --color-gray-900: #111827;
  --color-accent: var(--color-blue-500);
  --color-text: var(--color-gray-900);
  --space-sm: 8px;
  --space-md: 16px;
  --duration-fast: 120ms;
}
[data-theme="dark"] { --color-text: #f9fafb; }
`
const v2 = v1.replace('#2563eb', '#3366ff').replace('--space-sm', '--space-small')

let client: Client
let dir: string

async function call(name: string, args: Record<string, unknown> = {}) {
  const r = await client.callTool({ name, arguments: args })
  return { text: (r.content as Array<{ text: string }>).map((c) => c.text).join('\n'), isError: !!r.isError }
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dsgraph-mcp-'))
  await mkdir(join(dir, 'tokens'))
  await mkdir(join(dir, 'previous'))
  await writeFile(join(dir, 'tokens/tokens.css'), v2)
  await writeFile(join(dir, 'previous/tokens.css'), v1)
  await mkdir(join(dir, 'src'))
  await writeFile(
    join(dir, 'src/button.css'),
    '.button {\n  color: var(--color-accent);\n  padding: var(--space-sm);\n}\n',
  )
  const server = createServer({ source: './tokens', cwd: dir })
  const [a, b] = InMemoryTransport.createLinkedPair()
  client = new Client({ name: 'test', version: '1' })
  await Promise.all([server.connect(a), client.connect(b)])
})

describe('dsgraph MCP server', () => {
  it('lists read-only tools', async () => {
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual([
      'check_styles',
      'check_tokens',
      'compare_versions',
      'describe_tokens',
      'find_token',
      'get_token',
      'search_tokens',
    ])
    expect(tools.every((t) => t.annotations?.readOnlyHint)).toBe(true)
  })

  it('finds the token for a literal, semantic tokens first', async () => {
    const { text } = await call('find_token', { value: '#3366ff' })
    expect(text).toContain('- #3366ff — exact: `color-accent` → color-blue-500, `color-blue-500`')
    expect(text).toContain('Use `color-accent` instead of the literal value, or another token')
  })

  it('reports the closest token when none matches, in px across units', async () => {
    const { text } = await call('find_token', { value: '0.875rem' })
    expect(text).toContain('- 16px — off by 2: `space-md`')
    expect(text).toContain('No token matches exactly')
  })

  it('reads values in a theme', async () => {
    const { text } = await call('find_token', { value: '#f9fafb', context: { theme: 'dark' } })
    expect(text).toContain('- #f9fafb — exact: `color-text`')
  })

  it('reads a token with its values per theme, references and users', async () => {
    const { text } = await call('get_token', { id: 'color-blue-500' })
    expect(text).toContain('#3366ff')
    expect(text).toContain('Used by 1 token: `color-accent`')
    const text2 = (await call('get_token', { id: 'color-text' })).text
    expect(text2).toContain('theme: dark: #f9fafb')
    expect(text2).toContain('← color-gray-900')
    expect((await call('get_token', { id: 'color' })).isError).toBe(true)
  })

  it('searches and describes', async () => {
    expect((await call('search_tokens', { query: 'color', type: 'color' })).text).toMatch(/^4 tokens/)
    const d = (await call('describe_tokens')).text
    expect(d).toContain('7 tokens')
    expect(d).toContain('theme (default, dark')
  })

  it('compares versions and checks', async () => {
    const { text } = await call('compare_versions', { base: './previous' })
    expect(text).toContain('suggested bump: major')
    expect(text).toContain('space-small')
    expect((await call('check_tokens')).text).toBeTruthy()
  })

  it('checks style text an agent wrote, pointing to the tokens to use', async () => {
    const { text, isError } = await call('check_styles', {
      css: '.card {\n  color: #3366ff;\n  padding: 15px;\n  margin: 16px;\n}',
    })
    expect(isError).toBe(false)
    expect(text).toContain('Color "#3366ff" in color is written by hand; use "color-accent"')
    expect(text).toContain('"15px" in padding is off the scale; closest is "space-md" (16px)')
    expect(text).toContain('"16px" in margin is on the scale; use "space-md"')
    expect((await call('check_styles', { css: '.a { color: var(--color-text) }' })).text).toMatch(
      /^No problems/,
    )
    expect((await call('check_styles', {})).isError).toBe(true)
  })

  it('shows where a new version reaches into the code', async () => {
    const { text } = await call('compare_versions', { base: './previous', code: 'src' })
    expect(text).toContain('In the code: 1 place breaks, 1 place looks different (1 file).')
    expect(text).toMatch(
      /renamed `space-sm` → `space-small`.*\n\s+- breaks 1 place in the code: `button\.css:3`/,
    )
  })
})

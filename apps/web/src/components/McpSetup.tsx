import { useState } from 'react'
import type { Lang } from '../i18n'
import { LangProvider, useT } from '../i18n/react'

type SourceKind = 'folder' | 'npm' | 'github'
type ClientId = 'claude-code' | 'claude-desktop' | 'cursor' | 'vscode' | 'windsurf' | 'codex'

const SOURCES: Array<[SourceKind, string]> = [
  ['folder', './tokens'],
  ['npm', '@scope/tokens'],
  ['github', 'owner/repo/tokens'],
]

interface Client {
  id: ClientId
  label: string
  /** Desktop apps start servers outside the project: a folder must be an absolute path. */
  absolute: boolean
  snippet: (args: string[]) => string
}

const quote = (a: string) => (/^[\w@./:=-]+$/.test(a) ? a : `"${a.replace(/"/g, '\\"')}"`)
const json = (servers: string, entry: Record<string, unknown>) =>
  JSON.stringify({ [servers]: { dsgraph: entry } }, null, 2)

const CLIENTS: Client[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    absolute: false,
    snippet: (args) => `claude mcp add dsgraph -- npx -y ${args.map(quote).join(' ')}`,
  },
  {
    id: 'claude-desktop',
    label: 'Claude Desktop',
    absolute: true,
    snippet: (args) => json('mcpServers', { command: 'npx', args: ['-y', ...args] }),
  },
  {
    id: 'cursor',
    label: 'Cursor',
    absolute: true,
    snippet: (args) => json('mcpServers', { command: 'npx', args: ['-y', ...args] }),
  },
  {
    id: 'vscode',
    label: 'VS Code',
    absolute: false,
    snippet: (args) =>
      json('servers', {
        type: 'stdio',
        command: 'npx',
        args: ['-y', ...args.map((a) => (a.startsWith('./') ? `\${workspaceFolder}/${a.slice(2)}` : a))],
      }),
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    absolute: true,
    snippet: (args) => json('mcpServers', { command: 'npx', args: ['-y', ...args] }),
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    absolute: true,
    snippet: (args) =>
      `[mcp_servers.dsgraph]\ncommand = "npx"\nargs = [${['-y', ...args].map((a) => JSON.stringify(a)).join(', ')}]`,
  },
]

/** The server argument for a source: a path, `npm:pkg` or `github:owner/repo/path@ref`. */
function sourceArg(kind: SourceKind, value: string, ref: string): string {
  const v = value.trim()
  if (kind === 'npm')
    return `npm:${v || '@scope/tokens'}${/@[^@/]*$/.test(v.replace(/^@/, '')) ? '' : '@latest'}`
  if (kind === 'github')
    return `github:${(v || 'owner/repo/tokens').replace(/^https?:\/\/github\.com\//, '')}@${ref.trim() || 'main'}`
  return v || './tokens'
}

/** Picks a source and an agent, and gives the exact command or config to paste. */
export default function McpSetup({ lang = 'en' }: { lang?: Lang }) {
  return (
    <LangProvider lang={lang}>
      <Setup />
    </LangProvider>
  )
}

function Setup() {
  const t = useT().mcp
  const [kind, setKind] = useState<SourceKind>('folder')
  const [value, setValue] = useState('')
  const [ref, setRef] = useState('')
  const [client, setClient] = useState<ClientId>('claude-code')
  const [copied, setCopied] = useState(false)

  const c = CLIENTS.find((x) => x.id === client)!
  const arg = sourceArg(kind, value, ref)
  const relative = kind === 'folder' && !arg.startsWith('/') && !/^[A-Za-z]:\\/.test(arg) && !/^~/.test(arg)
  const snippet = c.snippet(['@dsgraph/mcp', arg])
  const copy = async () => {
    await navigator.clipboard.writeText(snippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="window mcp-setup">
      <div className="source">
        <div className="source__row">
          <span className="source__label">{t.tokens}</span>
          <div className="seg" role="tablist" aria-label={t.sourcesAria}>
            {SOURCES.map(([k]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={kind === k}
                className={kind === k ? 'is-on' : ''}
                onClick={() => {
                  setKind(k)
                  setValue('')
                }}
              >
                {t.sources[k]}
              </button>
            ))}
          </div>
          <input
            className="source__input"
            aria-label={t.locationAria}
            value={value}
            placeholder={SOURCES.find(([k]) => k === kind)![1]}
            spellCheck={false}
            autoCapitalize="off"
            onChange={(e) => setValue(e.target.value)}
          />
          {kind === 'github' && (
            <input
              className="accessory"
              aria-label={t.refAria}
              value={ref}
              placeholder="main"
              spellCheck={false}
              onChange={(e) => setRef(e.target.value)}
            />
          )}
        </div>
        <div className="source__meta">{t.hints[kind]}</div>
      </div>
      <div className="source">
        <div className="source__row">
          <span className="source__label">{t.agent}</span>
          <div className="seg seg--wrap" role="tablist" aria-label={t.agentsAria}>
            {CLIENTS.map((x) => (
              <button
                key={x.id}
                type="button"
                role="tab"
                aria-selected={client === x.id}
                className={client === x.id ? 'is-on' : ''}
                onClick={() => setClient(x.id)}
              >
                {x.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mcp-setup__out">
        <p className="mcp-setup__where">{t.where[c.id]}</p>
        <pre className="mcp-setup__code">
          <code>{snippet}</code>
        </pre>
        {relative && c.absolute && <p className="mcp-setup__note">{t.absolute}</p>}
      </div>
      <footer className="actionbar">
        <span className="actionbar__status">{t.status}</span>
        <button type="button" onClick={copy}>
          {copied ? t.copied : t.copy}
        </button>
      </footer>
    </div>
  )
}

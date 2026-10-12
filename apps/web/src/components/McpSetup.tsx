import { useState } from 'react'

type SourceKind = 'folder' | 'npm' | 'github'
type ClientId = 'claude-code' | 'claude-desktop' | 'cursor' | 'vscode' | 'windsurf' | 'codex'

const SOURCES: Array<[SourceKind, string, string]> = [
  ['folder', 'Folder', './tokens'],
  ['npm', 'npm package', '@scope/tokens'],
  ['github', 'GitHub', 'owner/repo/tokens'],
]

interface Client {
  id: ClientId
  label: string
  /** Where the snippet goes, in a sentence. */
  where: string
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
    where:
      'Run in the project folder. Add --scope project to share it with your team through .mcp.json in the repository.',
    absolute: false,
    snippet: (args) => `claude mcp add dsgraph -- npx -y ${args.map(quote).join(' ')}`,
  },
  {
    id: 'claude-desktop',
    label: 'Claude Desktop',
    where:
      'Settings → Developer → Edit Config opens claude_desktop_config.json. Add this to it (merge with any servers already there) and restart the app.',
    absolute: true,
    snippet: (args) => json('mcpServers', { command: 'npx', args: ['-y', ...args] }),
  },
  {
    id: 'cursor',
    label: 'Cursor',
    where:
      'Save as .cursor/mcp.json in the project (or ~/.cursor/mcp.json for every project), then turn the server on in Settings → MCP.',
    absolute: true,
    snippet: (args) => json('mcpServers', { command: 'npx', args: ['-y', ...args] }),
  },
  {
    id: 'vscode',
    label: 'VS Code',
    where: 'Save as .vscode/mcp.json in the project; Copilot Chat in agent mode picks it up.',
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
    where: 'Add to ~/.codeium/windsurf/mcp_config.json and refresh the MCP servers in Cascade.',
    absolute: true,
    snippet: (args) => json('mcpServers', { command: 'npx', args: ['-y', ...args] }),
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    where: 'Add to ~/.codex/config.toml.',
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
export default function McpSetup() {
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
          <span className="source__label">Tokens</span>
          <div className="seg" role="tablist" aria-label="Where the tokens are">
            {SOURCES.map(([k, label]) => (
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
                {label}
              </button>
            ))}
          </div>
          <input
            className="source__input"
            aria-label="Tokens location"
            value={value}
            placeholder={SOURCES.find(([k]) => k === kind)![2]}
            spellCheck={false}
            autoCapitalize="off"
            onChange={(e) => setValue(e.target.value)}
          />
          {kind === 'github' && (
            <input
              className="accessory"
              aria-label="Branch, tag or commit"
              value={ref}
              placeholder="main"
              spellCheck={false}
              onChange={(e) => setRef(e.target.value)}
            />
          )}
        </div>
        <div className="source__meta">
          {kind === 'folder'
            ? 'The folder with your token files: DTCG, a resolver, token JSON or CSS.'
            : kind === 'npm'
              ? 'A published token package. Without a version, the latest one.'
              : 'A public repository, or a private one with GITHUB_TOKEN set for the server.'}
        </div>
      </div>
      <div className="source">
        <div className="source__row">
          <span className="source__label">Agent</span>
          <div className="seg seg--wrap" role="tablist" aria-label="Agent">
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
        <p className="mcp-setup__where">{c.where}</p>
        <pre className="mcp-setup__code">
          <code>{snippet}</code>
        </pre>
        {relative && c.absolute && (
          <p className="mcp-setup__note">
            This app starts servers outside your project, so write the folder as a full path, for example
            /Users/you/project/tokens.
          </p>
        )}
      </div>
      <footer className="actionbar">
        <span className="actionbar__status">
          Needs Node.js 20 or newer. Runs on your machine and only reads.
        </span>
        <button type="button" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </footer>
    </div>
  )
}

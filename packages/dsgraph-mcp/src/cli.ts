#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { loadConfig } from 'dsgraph'
import { createServer } from './server.js'

const HELP = `dsgraph-mcp — MCP server for design tokens

Usage
  dsgraph-mcp [source]

  source   the project's tokens: a folder or file (default .), npm:pkg@version
           or github:owner/repo/path@ref. Tools accept another source per call.

Options
  -c, --config <file>   dsgraph.config.json (default: ./dsgraph.config.json if present)
  -h, --help

Claude Code
  claude mcp add dsgraph -- npx -y @dsgraph/mcp ./tokens
`

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { config: { type: 'string', short: 'c' }, help: { type: 'boolean', short: 'h' } },
})
if (values.help) {
  process.stdout.write(HELP)
  process.exit(0)
}
const cwd = process.cwd()
const server = createServer({
  source: positionals[0] ?? process.env.DSGRAPH_SOURCE ?? '.',
  cwd,
  config: await loadConfig(values.config, cwd),
})
await server.connect(new StdioServerTransport())

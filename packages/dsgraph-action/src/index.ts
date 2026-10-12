import { appendFile, readFile } from 'node:fs/promises'
import { run } from './run.js'

// GitHub sources read private repositories with the job's token.
const token = process.env['INPUT_GITHUB-TOKEN']?.trim()
if (token && !process.env.GITHUB_TOKEN) process.env.GITHUB_TOKEN = token

process.exitCode = await run({
  env: process.env,
  readText: (path) => readFile(path, 'utf8'),
  appendText: (path, text) => appendFile(path, text),
  fetch: globalThis.fetch.bind(globalThis),
  log: (line) => console.log(line),
})

/// <reference lib="webworker" />
import { compare } from './compare'
import type { Progress, RunRequest, RunResponse } from './types'

// Scanning and diffing run here so that thousands of tokens never freeze the page.
self.onmessage = async (e: MessageEvent<RunRequest>) => {
  const post = (r: RunResponse | Progress) => self.postMessage(r)
  post(await compare(e.data, (progress) => post({ id: e.data.id, progress })))
}

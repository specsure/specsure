/// <reference lib="webworker" />
import type { LookupRequest } from './lookup-types'

// The design system stays here between questions, so typing in the search never reloads it.
// Everything is imported dynamically: chunks loaded later must never import from this entry file,
// because Safari evaluates a worker's entry a second time when a chunk imports it, and the second
// copy replaces the handler with a session that has no design system open.
const ask = import('./lookup').then((m) => m.session())
self.onmessage = async (e: MessageEvent<LookupRequest>) => self.postMessage(await (await ask)(e.data))

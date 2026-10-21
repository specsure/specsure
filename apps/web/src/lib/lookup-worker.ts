/// <reference lib="webworker" />
import { session } from './lookup'
import type { LookupRequest } from './lookup-types'

// The design system stays here between questions, so typing in the search never reloads it.
const ask = session()
self.onmessage = async (e: MessageEvent<LookupRequest>) => self.postMessage(await ask(e.data))

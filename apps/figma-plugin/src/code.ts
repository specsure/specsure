/// <reference types="@figma/plugin-typings" />
import { figmaTokens } from '@dsgraph/adapters/figma'
import { gather } from './gather'

// Reads the open file's variables and styles and hands the DTCG files to the UI, which saves them.
// Nothing in the file is changed.
figma.showUI(__html__, { width: 320, height: 440, themeColors: true })

figma.ui.onmessage = async (msg: { type: string; url?: string }) => {
  // Links from the UI: Specsure's own pages and the source, opened in the browser.
  if (msg.type === 'open' && msg.url?.startsWith('https://')) {
    figma.openExternal(msg.url)
    return
  }
  if (msg.type !== 'export') return
  try {
    const out = figmaTokens(await gather())
    figma.ui.postMessage({ type: 'result', name: figma.root.name, ...out })
  } catch (e) {
    figma.ui.postMessage({ type: 'error', message: (e as Error).message })
  }
}

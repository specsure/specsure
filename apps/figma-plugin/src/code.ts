/// <reference types="@figma/plugin-typings" />
import { convert } from './convert'
import { gather } from './gather'

// Reads the open file's variables and styles and hands the DTCG files to the UI, which saves them.
// Nothing in the file is changed.
figma.showUI(__html__, { width: 360, height: 300, themeColors: true })

figma.ui.onmessage = async (msg: { type: string }) => {
  if (msg.type !== 'export') return
  try {
    const out = convert(await gather())
    figma.ui.postMessage({ type: 'result', name: figma.root.name, ...out })
  } catch (e) {
    figma.ui.postMessage({ type: 'error', message: (e as Error).message })
  }
}

import { createContext, type ReactNode, useContext } from 'react'
import { DEFAULT_LANG, type Lang } from './index'
import { type Messages, messages } from './messages'

const LangContext = createContext<Lang>(DEFAULT_LANG)

/** Every island wraps its tree in this, with the page's language passed from Astro. */
export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>
}

export const useLang = (): Lang => useContext(LangContext)
export const useT = (): Messages => messages[useContext(LangContext)]

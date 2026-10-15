import type { Lang } from '../i18n'
import { LangProvider } from '../i18n/react'
import type { CodeReport } from '../lib/types'
import { CodeReportView } from './CodeReportView'

/** The Your code window as a figure: rendered once when the site is built, no script on the page. */
export default function CodeReportFigure({
  report,
  lang,
  caption,
}: {
  report: CodeReport
  lang: Lang
  caption: string
}) {
  return (
    <LangProvider lang={lang}>
      <figure className="figure code-figure">
        <CodeReportView report={report} label="" />
        <figcaption>{caption}</figcaption>
      </figure>
    </LangProvider>
  )
}

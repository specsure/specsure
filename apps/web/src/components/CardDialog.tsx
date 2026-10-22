import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n/react'
import { type CardData, canvasBlob, drawCard } from '../lib/card'

interface Props {
  data: CardData
  fileName: string
  onClose: () => void
}

/** Preview of the 1200×630 share card with download and copy. */
export function CardDialog({ data, fileName, onClose }: Props) {
  const t = useT()
  const dialog = useRef<HTMLDialogElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState('')

  useEffect(() => {
    dialog.current?.showModal()
    // The window itself takes the focus, not its first button.
    dialog.current?.focus()
    if (canvas.current) drawCard(canvas.current, data, 2)
  }, [data])

  const save = async () => {
    const blob = await canvasBlob(canvas.current!)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const copy = async () => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': canvasBlob(canvas.current!) })])
      setStatus(t.card.copied)
    } catch {
      setStatus(t.card.cannotCopy)
    }
  }

  return (
    <dialog ref={dialog} className="card-dialog" tabIndex={-1} onClose={onClose} onCancel={onClose}>
      <header>
        <h2>{t.card.title}</h2>
        <button
          type="button"
          className="ghost"
          onClick={() => dialog.current?.close()}
          aria-label={t.card.close}
        >
          ✕
        </button>
      </header>
      <canvas ref={canvas} className="card-preview" />
      <footer>
        <span className="muted small">{status || t.card.size}</span>
        <button type="button" onClick={copy}>
          {t.card.copy}
        </button>
        <button type="button" onClick={save}>
          {t.card.download}
        </button>
      </footer>
    </dialog>
  )
}

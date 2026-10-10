import { useEffect, useRef, useState } from 'react'
import { type CardData, canvasBlob, drawCard } from '../lib/card'

interface Props {
  data: CardData
  fileName: string
  onClose: () => void
}

/** Preview of the 1200×630 share card with download and copy. */
export function CardDialog({ data, fileName, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState('')

  useEffect(() => {
    dialog.current?.showModal()
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
      setStatus('Copied')
    } catch {
      setStatus('This browser cannot copy images; download it instead')
    }
  }

  return (
    <dialog ref={dialog} className="card-dialog" onClose={onClose} onCancel={onClose}>
      <header>
        <h2>Card for a post</h2>
        <button type="button" className="ghost" onClick={() => dialog.current?.close()} aria-label="Close">
          ✕
        </button>
      </header>
      <canvas ref={canvas} className="card-preview" />
      <footer>
        <span className="muted small">{status || '1200 × 630, sized for LinkedIn and link previews'}</span>
        <button type="button" onClick={copy}>
          Copy image
        </button>
        <button type="button" onClick={save}>
          Download PNG
        </button>
      </footer>
    </dialog>
  )
}

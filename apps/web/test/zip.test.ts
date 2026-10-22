import { describe, expect, it } from 'vitest'
import { zipEntries } from '../src/lib/zip'

/** A .zip of the given files, each stored or deflated, with a comment after the end record. */
async function zip(
  files: Array<{ path: string; text: string; deflate?: boolean }>,
): Promise<Uint8Array<ArrayBuffer>> {
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const f of files) {
    const raw = enc.encode(f.text)
    const data = f.deflate
      ? new Uint8Array(
          await new Response(
            new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw')),
          ).arrayBuffer(),
        )
      : raw
    const name = enc.encode(f.path)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(8, f.deflate ? 8 : 0, true)
    local.setUint32(18, data.length, true)
    local.setUint32(22, raw.length, true)
    local.setUint16(26, name.length, true)
    const head = new DataView(new ArrayBuffer(46))
    head.setUint32(0, 0x02014b50, true)
    head.setUint16(8, 0x800, true)
    head.setUint16(10, f.deflate ? 8 : 0, true)
    head.setUint32(20, data.length, true)
    head.setUint32(24, raw.length, true)
    head.setUint16(28, name.length, true)
    head.setUint32(42, offset, true)
    parts.push(new Uint8Array(local.buffer), name, data)
    central.push(new Uint8Array(head.buffer), name)
    offset += 30 + name.length + data.length
  }
  const size = central.reduce((n, c) => n + c.length, 0)
  const comment = enc.encode('made in a test')
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, size, true)
  end.setUint32(16, offset, true)
  end.setUint16(20, comment.length, true)
  const all = [...parts, ...central, new Uint8Array(end.buffer), comment]
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0))
  let at = 0
  for (const c of all) {
    out.set(c, at)
    at += c.length
  }
  return out
}

describe('a .zip read in the browser', () => {
  it('reads stored and deflated entries, skips folders and macOS metadata', async () => {
    const tokens = JSON.stringify({ color: { ink: { $type: 'color', $value: '#000000' } } })
    const bytes = await zip([
      { path: 'tokens/', text: '' },
      { path: 'tokens/Primitives.tokens.json', text: tokens },
      { path: 'tokens/Theme/Тёмная.tokens.json', text: tokens.repeat(3), deflate: true },
      { path: '__MACOSX/tokens/._Primitives.tokens.json', text: 'x' },
    ])
    const entries = zipEntries(bytes)
    expect(entries.map((e) => [e.path, e.size])).toEqual([
      ['tokens/Primitives.tokens.json', tokens.length],
      ['tokens/Theme/Тёмная.tokens.json', Buffer.byteLength(tokens.repeat(3))],
    ])
    const text = new TextDecoder()
    expect(text.decode(await entries[0]!.bytes())).toBe(tokens)
    expect(text.decode(await entries[1]!.bytes())).toBe(tokens.repeat(3))
  })

  it('says so when the file is not an archive', () => {
    expect(() => zipEntries(new TextEncoder().encode('{"not": "a zip"}'.repeat(4)))).toThrow(/Not a \.zip/)
  })
})

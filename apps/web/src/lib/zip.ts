/**
 * The files in a .zip, read in the browser: the archive's central directory names them, stored
 * entries are read as they are and deflated ones through the browser's own inflater
 * (`DecompressionStream`). Encrypted entries, folders and macOS metadata are skipped; ZIP64 archives
 * (over 4 GB) are not read.
 */
export interface ZipEntry {
  path: string
  /** Size once unpacked, as the archive says. */
  size: number
  bytes: () => Promise<Uint8Array>
}

const EOCD = 0x06054b50
const CENTRAL = 0x02014b50
const LOCAL = 0x04034b50

export function zipEntries(bytes: Uint8Array<ArrayBuffer>): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  // The end record is in the last 22 bytes, after a comment of up to 64 KB.
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--)
    if (view.getUint32(i, true) === EOCD) {
      end = i
      break
    }
  if (end < 0) throw new Error('Not a .zip archive, or a damaged one')
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const utf8 = new TextDecoder()
  const out: ZipEntry[] = []
  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== CENTRAL) throw new Error('A damaged .zip archive')
    const flags = view.getUint16(at + 8, true)
    const method = view.getUint16(at + 10, true)
    const packed = view.getUint32(at + 20, true)
    const size = view.getUint32(at + 24, true)
    const nameLength = view.getUint16(at + 28, true)
    const extraLength = view.getUint16(at + 30, true)
    const commentLength = view.getUint16(at + 32, true)
    const local = view.getUint32(at + 42, true)
    const path = utf8.decode(bytes.subarray(at + 46, at + 46 + nameLength))
    at += 46 + nameLength + extraLength + commentLength
    const encrypted = (flags & 1) !== 0
    if (encrypted || path.endsWith('/') || path.startsWith('__MACOSX/') || (method !== 0 && method !== 8))
      continue
    if (view.getUint32(local, true) !== LOCAL) continue
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
    const data = bytes.subarray(start, start + packed)
    out.push({
      path,
      size,
      bytes: async () =>
        method === 0
          ? data
          : new Uint8Array(
              await new Response(
                new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')),
              ).arrayBuffer(),
            ),
    })
  }
  return out
}

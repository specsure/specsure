/** Parses JSON, falling back to JSONC (comments, trailing commas) when strict parsing fails. */
export function parseJsonLenient(text: string): { value: unknown; lenient: boolean } {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  try {
    return { value: JSON.parse(clean), lenient: false }
  } catch (strictError) {
    try {
      return { value: JSON.parse(stripJsonc(clean)), lenient: true }
    } catch {
      throw strictError
    }
  }
}

function stripJsonc(text: string): string {
  let out = ''
  let inString = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (inString) {
      out += c
      if (c === '\\') out += text[++i] ?? ''
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') {
      inString = true
      out += c
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
      out += '\n'
    } else if (c === '/' && text[i + 1] === '*') {
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++
      i++
    } else out += c
  }
  return out.replace(/,(\s*[}\]])/g, '$1')
}

/** Code pasted into the search: markup and JSX, a stylesheet, or bare declarations. */
export function looksLikeCode(text: string): boolean {
  const t = text.trim()
  return (
    /\n/.test(t) ||
    /<[a-z][\w-]*[\s>/]/i.test(t) ||
    /\bclass(Name)?=/.test(t) ||
    /[{}]/.test(t) ||
    (t.match(/:[^;]+;/g)?.length ?? 0) > 1
  )
}

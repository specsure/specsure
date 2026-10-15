const SHA = /^[0-9a-f]{40}$/i

/** A branch or tag with its commit, `main (7c970d9)`; a commit once and short. */
export const refLabel = (ref: string | undefined, commit?: string): string =>
  !ref
    ? (commit?.slice(0, 7) ?? 'HEAD')
    : SHA.test(ref)
      ? ref.slice(0, 7)
      : `${ref}${commit && commit !== ref ? ` (${commit.slice(0, 7)})` : ''}`

import type { Token } from '@dsgraph/core'

/** A token's custom property: CSS tokens keep their name, DTCG paths join with dashes. */
export const cssName = (t: Pick<Token, 'id' | 'origin'>): string =>
  /\.css$/i.test(t.origin.file) ? `--${t.id}` : `--${t.id.replace(/\./g, '-')}`

import { type NearestToken, nearestTokens } from '@dsgraph/core'

export { parseValue } from '@dsgraph/adapters'

/** Tokens nearest to a value in one context; see `nearestTokens` in `@dsgraph/core`. */
export const nearest = nearestTokens
export type Match = NearestToken

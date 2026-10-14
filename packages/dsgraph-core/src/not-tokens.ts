/**
 * JSON files that are never token files, skipped when looking through all `*.json`.
 * A module of its own so that browser code can use it without pulling in the scanner.
 */
export const NOT_TOKENS =
  /(^|\/)(package(-lock)?|tsconfig[\w.-]*|jsconfig|composer|lerna|nx|project|turbo|vercel|biome|renovate|manifest|\.?[\w-]*rc|[\w.-]*\.schema|([\w.-]*\.)?resolver|dsgraph\.config)\.json$/i

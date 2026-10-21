export * from '@dsgraph/schema'
export {
  type CodeIndex,
  type CodeLoc,
  type Coverage,
  coverageOf,
  formatCoverage,
  type NearestToken,
  nearestTokens,
  roleOfProperty,
  type StyleContext,
  type StyleLiteral,
  styleContext,
  type TokenUse,
  VarMatcher,
  valueDistance,
  varNames,
} from './code.js'
export { DiagnosticBag } from './diagnostics.js'
export { type DiffOptions, diff } from './diff/diff.js'
export { detectRenames, pathSimilarity, stableIdOf } from './diff/rename.js'
export { DEFAULT_POLICY, levelOf, maxLevel, mergePolicy, type SemverPolicy } from './diff/semver.js'
export { type FlatDoc, flattenDocument, type RawGroup, type RawToken } from './dtcg/flatten.js'
export { expandExtends, mergeDocs } from './dtcg/merge.js'
export { type ResolvedDoc, type ResolvedToken, resolveDoc } from './dtcg/resolve.js'
export { DsGraph, type TokenFilter } from './graph.js'
export { type ChangeImpact, type Impact, type ImpactSite, impactOf } from './impact.js'
export { parseJsonLenient } from './json.js'
export {
  type CompiledVocabulary,
  DEFAULT_VOCABULARY,
  type Knowledge,
  type LayerKind,
  type Role,
  readKnowledge,
  type Vocabulary,
  vocabularyOf,
} from './knowledge.js'
export {
  type InferredLayer,
  inferLayers,
  type LayerCrossing,
  type Layers,
  type TokenLayer,
} from './layers.js'
export { NOT_TOKENS } from './not-tokens.js'
export { cssVarToName, globToRegExp, matchGlob, matchPath, normalizeName, tokenId } from './path.js'
export { getAt, parsePointer, toPointer } from './pointer.js'
export { expandModes } from './resolver/modes.js'
export { createResolver, type SystemResolver } from './resolver/resolve.js'
export {
  defaultInput,
  enumerateInputs,
  type Input,
  modifiersOf,
  selectDocuments,
  systemFromDocuments,
  systemFromResolver,
  type TokenDocument,
  type TokenSystem,
  validateInput,
} from './resolver/system.js'
export {
  DEFAULT_EXCLUDE,
  excludeFor,
  loadSystem,
  type ScanConfig,
  type ScanOptions,
  scan,
  type TokenAdapter,
} from './scan.js'
export { type BuildOptions, buildSnapshot, GENERATOR, type LayerConfig } from './snapshot.js'
export { prefetch, type Source } from './source.js'
export { canonicalValue, INTERNAL_TYPES, STANDARD_TYPES } from './values/canonical.js'
export {
  COLOR_SPACES,
  type ColorSpace,
  type ColorValue,
  colorToCss,
  colorToDtcg,
  colorToHex,
  cssColorToDtcg,
  deltaEOK,
  isInSrgbGamut,
  looseColor,
  toCulori,
  toOklab,
} from './values/color.js'
export { type CompareOptions, type CompareResult, compareValues, DEFAULT_COMPARE } from './values/compare.js'
export { type DimensionValue, STANDARD_UNITS, toPx } from './values/dimension.js'
export {
  type ColorModifier,
  type ExpressionHint,
  evaluateExpression,
  evaluateMath,
  modifyColor,
  type Quantity,
} from './values/expression.js'

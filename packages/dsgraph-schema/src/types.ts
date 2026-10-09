import { type Static, Type as T } from '@sinclair/typebox'

/** A selection of context per modifier, e.g. `{ theme: "dark" }`. An empty object means "all contexts". */
export const When = T.Record(T.String(), T.String(), { $id: 'When' })
export type When = Static<typeof When>

export const Severity = T.Union([T.Literal('error'), T.Literal('warning'), T.Literal('info')])
export type Severity = Static<typeof Severity>

export const Loc = T.Object(
  {
    file: T.Optional(T.String()),
    pointer: T.Optional(T.String()),
    line: T.Optional(T.Integer()),
    column: T.Optional(T.Integer()),
  },
  { $id: 'Loc' },
)
export type Loc = Static<typeof Loc>

export const Diagnostic = T.Object(
  {
    code: T.String(),
    severity: Severity,
    message: T.String(),
    loc: T.Optional(Loc),
  },
  { $id: 'Diagnostic' },
)
export type Diagnostic = Static<typeof Diagnostic>

/** A reference from one token's value to another token. */
export const Ref = T.Object(
  {
    to: T.String(),
    /** JSON Pointer inside the referencing token's value; absent for a whole-value alias. */
    property: T.Optional(T.String()),
    /** JSON Pointer inside the target token's value, for property-level `$ref`. */
    targetPath: T.Optional(T.String()),
  },
  { $id: 'Ref' },
)
export type Ref = Static<typeof Ref>

export const TokenValue = T.Object(
  {
    when: When,
    /** The value as authored after merging, references unresolved. */
    raw: T.Unknown(),
    /** Canonical resolved value, or null when it could not be resolved. */
    value: T.Unknown(),
    refs: T.Array(Ref),
  },
  { $id: 'TokenValue' },
)
export type TokenValue = Static<typeof TokenValue>

export const Deprecated = T.Object(
  { reason: T.Optional(T.String()), replacement: T.Optional(T.String()) },
  { $id: 'Deprecated' },
)
export type Deprecated = Static<typeof Deprecated>

export const TypeSource = T.Union([
  T.Literal('explicit'),
  T.Literal('inherited'),
  T.Literal('alias'),
  T.Literal('inferred'),
])
export type TypeSource = Static<typeof TypeSource>

export const Origin = T.Object({ file: T.String(), pointer: T.String() }, { $id: 'Origin' })
export type Origin = Static<typeof Origin>

export const Token = T.Object(
  {
    id: T.String(),
    path: T.Array(T.String()),
    type: T.Union([T.String(), T.Null()]),
    typeSource: T.Union([TypeSource, T.Null()]),
    layer: T.Union([T.String(), T.Null()]),
    description: T.Optional(T.String()),
    deprecated: T.Union([Deprecated, T.Null()]),
    values: T.Array(TokenValue),
    origin: Origin,
    inheritedFrom: T.Union([T.String(), T.Null()]),
    extensions: T.Optional(T.Record(T.String(), T.Unknown())),
    flags: T.Array(T.String()),
  },
  { $id: 'Token' },
)
export type Token = Static<typeof Token>

export const Group = T.Object(
  {
    id: T.String(),
    path: T.Array(T.String()),
    type: T.Optional(T.String()),
    description: T.Optional(T.String()),
    deprecated: T.Optional(Deprecated),
    extends: T.Optional(T.String()),
    extensions: T.Optional(T.Record(T.String(), T.Unknown())),
    origin: Origin,
  },
  { $id: 'Group' },
)
export type Group = Static<typeof Group>

export const EdgeKind = T.Union([
  T.Literal('aliases'),
  T.Literal('extends'),
  T.Literal('deprecated_by'),
  T.Literal('uses_token'),
  T.Literal('imports'),
  T.Literal('renders'),
  T.Literal('used_at'),
  T.Literal('hardcodes'),
])
export type EdgeKind = Static<typeof EdgeKind>

export const EdgeAttrs = T.Object(
  {
    property: T.Optional(T.String()),
    targetPath: T.Optional(T.String()),
    when: T.Optional(When),
  },
  { additionalProperties: true },
)
export type EdgeAttrs = Static<typeof EdgeAttrs>

/** `[kind, from, to, attrs?]` */
export const Edge = T.Union([
  T.Tuple([EdgeKind, T.String(), T.String()]),
  T.Tuple([EdgeKind, T.String(), T.String(), EdgeAttrs]),
])
export type Edge = Static<typeof Edge>

export const SourceMeta = T.Object(
  {
    kind: T.String(),
    package: T.Optional(T.String()),
    version: T.Optional(T.String()),
    repo: T.Optional(T.String()),
    ref: T.Optional(T.String()),
    commit: T.Optional(T.String()),
    path: T.Optional(T.String()),
  },
  { $id: 'SourceMeta', additionalProperties: true },
)
export type SourceMeta = Static<typeof SourceMeta>

export const Modifier = T.Object(
  {
    name: T.String(),
    contexts: T.Array(T.String()),
    default: T.Optional(T.String()),
  },
  { $id: 'Modifier' },
)
export type Modifier = Static<typeof Modifier>

export const SNAPSHOT_SCHEMA = 'dsgraph/snapshot@1'

export const Snapshot = T.Object(
  {
    schema: T.Literal(SNAPSHOT_SCHEMA),
    source: SourceMeta,
    contexts: T.Object({
      modifiers: T.Array(Modifier),
      permutations: T.Integer(),
      partial: T.Boolean(),
    }),
    nodes: T.Object({
      groups: T.Array(Group),
      tokens: T.Array(Token),
    }),
    edges: T.Array(Edge),
    diagnostics: T.Array(Diagnostic),
    hash: T.String(),
    meta: T.Optional(T.Record(T.String(), T.Unknown())),
  },
  { $id: 'Snapshot' },
)
export type Snapshot = Static<typeof Snapshot>

export const ChangeKind = T.Union([
  T.Literal('token.added'),
  T.Literal('token.removed'),
  T.Literal('token.renamed'),
  T.Literal('token.value-changed'),
  T.Literal('token.notation-changed'),
  T.Literal('token.alias-retargeted'),
  T.Literal('token.type-changed'),
  T.Literal('token.contexts-changed'),
  T.Literal('token.missing-in-context'),
  T.Literal('token.deprecated'),
  T.Literal('token.undeprecated'),
  T.Literal('token.description-changed'),
  T.Literal('token.extensions-changed'),
  T.Literal('group.extends-changed'),
  T.Literal('context.added'),
  T.Literal('context.removed'),
  T.Literal('modifier.added'),
  T.Literal('modifier.removed'),
])
export type ChangeKind = Static<typeof ChangeKind>

export const Level = T.Union([T.Literal('major'), T.Literal('minor'), T.Literal('patch'), T.Literal('none')])
export type Level = Static<typeof Level>

export const Change = T.Object(
  {
    id: T.String(),
    kind: ChangeKind,
    target: T.String(),
    from: T.Optional(T.String()),
    when: T.Union([When, T.Null()]),
    before: T.Optional(T.Unknown()),
    after: T.Optional(T.Unknown()),
    delta: T.Optional(T.Record(T.String(), T.Unknown())),
    origin: T.Union([T.Literal('direct'), T.Literal('propagated')]),
    cause: T.Array(T.String()),
    level: Level,
    confidence: T.Number(),
    possibleRenames: T.Optional(T.Array(T.String())),
    note: T.Optional(T.String()),
  },
  { $id: 'Change' },
)
export type Change = Static<typeof Change>

export const CHANGESET_SCHEMA = 'dsgraph/changeset@1'

export const Changeset = T.Object(
  {
    schema: T.Literal(CHANGESET_SCHEMA),
    base: T.Object({ hash: T.String(), source: SourceMeta }),
    head: T.Object({ hash: T.String(), source: SourceMeta }),
    contexts: T.Object({
      compared: T.Array(When),
      partial: T.Boolean(),
    }),
    summary: T.Object({
      counts: T.Record(T.String(), T.Integer()),
      level: Level,
      reasons: T.Array(T.String()),
    }),
    changes: T.Array(Change),
    diagnostics: T.Array(Diagnostic),
  },
  { $id: 'Changeset' },
)
export type Changeset = Static<typeof Changeset>

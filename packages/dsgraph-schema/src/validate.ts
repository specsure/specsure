import type { TSchema } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'
import { Changeset, Config, Snapshot } from './types.js'

export interface ValidationResult {
  ok: boolean
  errors: Array<{ path: string; message: string }>
}

/** Validation without code generation (safe under strict CSP, e.g. in browser extensions). */
function validate(schema: TSchema, value: unknown): ValidationResult {
  if (Value.Check(schema, value)) return { ok: true, errors: [] }
  const errors = [...Value.Errors(schema, value)]
    .slice(0, 50)
    .map((e) => ({ path: e.path, message: e.message }))
  return { ok: false, errors }
}

export const validateSnapshot = (value: unknown) => validate(Snapshot, value)
export const validateChangeset = (value: unknown) => validate(Changeset, value)
export const validateConfig = (value: unknown) => validate(Config, value)

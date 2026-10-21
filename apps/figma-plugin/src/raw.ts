/**
 * What the plugin reads from a Figma file, as plain data: variable collections with their modes,
 * variables with their values per mode, and paint, text and effect styles. `convert` turns it into
 * DTCG files; nothing here depends on the plugin API, so it is tested without Figma.
 */

export interface RawColor {
  r: number
  g: number
  b: number
  a?: number
}

/** An easing: one of Figma's named curves, a cubic Bézier, or a spring. */
export interface RawEasing {
  type: string
  bezier?: { x1: number; y1: number; x2: number; y2: number }
}

/**
 * A value in one mode: a color, a number, a string, a boolean, an easing, a reference to another
 * variable, or a color composed of a color and an opacity, either of them a reference.
 */
export type RawValue =
  | RawColor
  | number
  | string
  | boolean
  | { alias: string }
  | { easing: RawEasing }
  | { composed: { color: RawColor | { alias: string }; opacity: number | { alias: string } } }

export interface RawCollection {
  id: string
  name: string
  modes: Array<{ id: string; name: string }>
  defaultModeId: string
  hidden?: boolean
}

export interface RawVariable {
  id: string
  name: string
  collectionId: string
  type: 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN' | 'EASING' | 'TIMING'
  description?: string
  /** Where Figma offers it: `GAP`, `CORNER_RADIUS`, `FONT_WEIGHT`, `ALL_SCOPES`… */
  scopes: string[]
  /** How code names it, per platform: `{ WEB: 'var(--color-text)' }`. */
  codeSyntax?: Record<string, string>
  hiddenFromPublishing?: boolean
  valuesByMode: Record<string, RawValue>
}

/** A variable from a library the file uses: its name and its value, for references that leave the file. */
export interface RawExternal {
  name: string
  type: RawVariable['type']
  scopes: string[]
  value: RawValue
}

export interface RawPaint {
  type: string
  color?: RawColor
  opacity?: number
  /** The variable the color is bound to. */
  variable?: string
  stops?: Array<{ position: number; color: RawColor; variable?: string }>
}

export interface RawEffect {
  type: string
  color?: RawColor
  offset?: { x: number; y: number }
  radius?: number
  spread?: number
  visible?: boolean
}

export interface RawTextStyle {
  id: string
  name: string
  description?: string
  fontFamily: string
  /** Figma's style name: `Semi Bold`, `Bold Italic`. */
  fontStyle: string
  fontSize: number
  lineHeight: { unit: 'PIXELS' | 'PERCENT' | 'AUTO'; value?: number }
  letterSpacing: { unit: 'PIXELS' | 'PERCENT'; value: number }
  textCase?: string
  textDecoration?: string
  /** Variables bound to the style's fields: `fontSize`, `fontFamily`, `lineHeight`… */
  bound?: Record<string, string>
}

export interface RawExport {
  file: { name: string }
  collections: RawCollection[]
  variables: RawVariable[]
  external: Record<string, RawExternal>
  styles: {
    paint: Array<{ id: string; name: string; description?: string; paints: RawPaint[] }>
    text: RawTextStyle[]
    effect: Array<{ id: string; name: string; description?: string; effects: RawEffect[] }>
  }
}

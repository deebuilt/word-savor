/**
 * The reading faces.
 *
 * Two separate settings, not one: the **word** face and the **body** face are
 * different decisions. Someone may want a high-contrast serif for the word
 * itself and a hyperlegible sans for the definitions underneath it, and
 * collapsing those into a single "theme" choice would deny that.
 *
 * A short curated list rather than a font menu. Each face is a different
 * reading voice, not a different flavour of the same one, so the choice
 * actually changes the experience instead of nudging it.
 *
 * All are self-hosted via @fontsource. An installed PWA opened offline must not
 * be waiting on a network font — a face that fails to load silently falls back
 * to a system default and undoes the whole design.
 */

export type TypefaceId = 'editorial' | 'plain' | 'hyperlegible' | 'dyslexic'

export interface Typeface {
  id: TypefaceId
  /** Shown in the picker. */
  name: string
  /** One line on the voice it carries, or the reading need it serves. */
  voice: string
  stack: string
  /**
   * The heaviest weight this family actually ships.
   *
   * Atkinson Hyperlegible and OpenDyslexic publish only 400 and 700. Asking
   * either for 500 or 600 gets a browser-synthesised weight — smeared strokes
   * that are worse than the regular weight, and actively harmful in the two
   * faces chosen specifically for legibility. Components read this instead of
   * hardcoding a mid weight.
   */
  mediumWeight: 400 | 500 | 600
  boldWeight: 600 | 700
  /**
   * Optical size correction, relative to the design's base size.
   *
   * The same px value reads very differently across a high-contrast serif and
   * a face with tall x-height and wide spacing. OpenDyslexic in particular runs
   * large — its weighted bottoms and generous sidebearings make it read a full
   * step bigger than Fraunces at the same size. Scaling here means the type
   * scale in `tokens.ts` stays one system rather than being re-picked per face.
   */
  scale: number
  /**
   * Line-height multiplier, relative to the design's base.
   *
   * Faces built for legibility want more leading, not less — the extra space
   * between lines is doing as much work as the letterforms.
   */
  leading: number
}

export const TYPEFACES: readonly Typeface[] = [
  {
    id: 'editorial',
    name: 'Editorial',
    voice: 'High-contrast serif. Bookish and warm.',
    stack: '"Fraunces", Georgia, "Times New Roman", serif',
    mediumWeight: 500,
    boldWeight: 600,
    scale: 1,
    leading: 1,
  },
  {
    id: 'plain',
    name: 'Plain',
    voice: 'Modern grotesque. Quiet and neutral.',
    stack: '"Archivo", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    mediumWeight: 500,
    boldWeight: 600,
    // Archivo carries more weight per pixel than Fraunces, so it is nudged down
    // to sit at the same optical size.
    scale: 0.97,
    leading: 1,
  },
  {
    id: 'hyperlegible',
    name: 'Hyperlegible',
    voice: 'Letterforms drawn so similar characters cannot be confused.',
    stack: '"Atkinson Hyperlegible", -apple-system, BlinkMacSystemFont, sans-serif',
    // Ships 400 and 700 only.
    mediumWeight: 400,
    boldWeight: 700,
    scale: 1,
    leading: 1.06,
  },
  {
    id: 'dyslexic',
    name: 'Dyslexia',
    voice: 'Weighted bottoms and wider spacing.',
    stack: '"OpenDyslexic", Verdana, sans-serif',
    // Ships 400 and 700 only.
    mediumWeight: 400,
    boldWeight: 700,
    // Runs noticeably large; pulled back so a word set in it fills the same
    // space as one set in Fraunces.
    scale: 0.9,
    leading: 1.12,
  },
]

const BY_ID = new Map(TYPEFACES.map((face) => [face.id, face]))

/**
 * Look up a face, falling back to the default rather than throwing.
 *
 * A stored preference can name a face that no longer exists — a removed option,
 * or a database restored from a newer version of the app. Neither is a reason
 * to fail to render text.
 */
export function getTypeface(id: TypefaceId, fallback: TypefaceId): Typeface {
  return BY_ID.get(id) ?? BY_ID.get(fallback) ?? TYPEFACES[0]
}

/** The word itself, wherever it appears. */
export const DEFAULT_WORD_FACE: TypefaceId = 'editorial'
/** Definitions, labels, nav — everything that is not the word. */
export const DEFAULT_BODY_FACE: TypefaceId = 'plain'

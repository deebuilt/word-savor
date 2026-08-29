import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_BODY_FACE,
  DEFAULT_WORD_FACE,
  getTypeface,
  type Typeface,
  type TypefaceId,
} from '../design/typefaces'

/**
 * Reading face preferences.
 *
 * Two independent settings — the word face and the body face — applied to the
 * root element as CSS custom properties. Every component reads
 * `var(--ws-font-word)` or `var(--ws-font-body)` and never names a family
 * directly, so a face added or swapped here lands everywhere at once.
 *
 * That indirection is the entire point of wiring this before the screens get
 * built. A component that hardcodes `'Fraunces', Georgia, serif` has to be
 * found and rewritten when the setting arrives; one reading a variable never
 * has to change at all.
 *
 * Alongside the families, each face publishes its own optical corrections —
 * scale, leading, and the heaviest weight it actually ships. Atkinson
 * Hyperlegible and OpenDyslexic have no 500 or 600, so asking for one gets a
 * browser-synthesised weight: smeared strokes, in the two faces chosen
 * precisely for legibility. Components read `--ws-weight-medium` rather than
 * writing `font-weight: 500`.
 *
 * Stored in localStorage, like the theme, and for the same reason: it is two
 * short strings that must be readable synchronously before first paint, or the
 * app renders a frame in the wrong face and reflows.
 */

export const FACE_STORAGE_KEY = 'wordsavor:faces'

export interface FacePreference {
  word: TypefaceId
  body: TypefaceId
}

const DEFAULTS: FacePreference = {
  word: DEFAULT_WORD_FACE,
  body: DEFAULT_BODY_FACE,
}

function readStored(): FacePreference {
  try {
    const raw = localStorage.getItem(FACE_STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return DEFAULTS
    const { word, body } = parsed as Partial<Record<keyof FacePreference, unknown>>
    return {
      // `getTypeface` falls back rather than throwing, so a stored id that no
      // longer exists degrades to the default instead of breaking the app.
      word: getTypeface(word as TypefaceId, DEFAULT_WORD_FACE).id,
      body: getTypeface(body as TypefaceId, DEFAULT_BODY_FACE).id,
    }
  } catch {
    // Unparseable JSON, or storage blocked entirely. Defaults are right for
    // both, and neither is worth surfacing to the reader.
    return DEFAULTS
  }
}

/**
 * Write one face's variables onto the root element.
 *
 * Both faces publish the same five properties under different prefixes, so a
 * component styling the word and one styling a definition read the same shape.
 */
function applyFace(root: HTMLElement, prefix: 'word' | 'body', face: Typeface): void {
  root.style.setProperty(`--ws-font-${prefix}`, face.stack)
  root.style.setProperty(`--ws-scale-${prefix}`, String(face.scale))
  root.style.setProperty(`--ws-leading-${prefix}`, String(face.leading))
  root.style.setProperty(`--ws-weight-${prefix}-medium`, String(face.mediumWeight))
  root.style.setProperty(`--ws-weight-${prefix}-bold`, String(face.boldWeight))
}

interface UseTypefacesResult {
  preference: FacePreference
  /** The resolved face objects, for anything that needs more than the family. */
  wordFace: Typeface
  bodyFace: Typeface
  setWordFace: (id: TypefaceId) => void
  setBodyFace: (id: TypefaceId) => void
  reset: () => void
}

export function useTypefaces(): UseTypefacesResult {
  const [preference, setPreference] = useState<FacePreference>(readStored)

  const wordFace = getTypeface(preference.word, DEFAULT_WORD_FACE)
  const bodyFace = getTypeface(preference.body, DEFAULT_BODY_FACE)

  useEffect(() => {
    const root = document.documentElement
    applyFace(root, 'word', wordFace)
    applyFace(root, 'body', bodyFace)
  }, [wordFace, bodyFace])

  const persist = useCallback((next: FacePreference) => {
    try {
      localStorage.setItem(FACE_STORAGE_KEY, JSON.stringify(next))
    } catch {
      // The choice still applies for this session; only its persistence is
      // lost, which is not worth an error.
    }
  }, [])

  const setWordFace = useCallback(
    (id: TypefaceId) => {
      setPreference((current) => {
        const next = { ...current, word: id }
        persist(next)
        return next
      })
    },
    [persist],
  )

  const setBodyFace = useCallback(
    (id: TypefaceId) => {
      setPreference((current) => {
        const next = { ...current, body: id }
        persist(next)
        return next
      })
    },
    [persist],
  )

  const reset = useCallback(() => {
    setPreference(DEFAULTS)
    persist(DEFAULTS)
  }, [persist])

  return { preference, wordFace, bodyFace, setWordFace, setBodyFace, reset }
}

/**
 * Single source of truth for every visual value in WordSavor.
 *
 * Nothing outside this file should contain a raw pixel number. When a component
 * needs a size, a gap, or a colour, it reads it from here — so a change to the
 * type scale or the spacing rhythm happens once and lands everywhere.
 *
 * Colour is resolved at runtime from CSS custom properties, so light and dark
 * are one system rather than two parallel palettes. The literals below are the
 * light values, kept as fallbacks; `theme.css` redefines the same variables for
 * dark.
 */

export const color = {
  ink: 'var(--ws-ink, #16130f)',
  inkSoft: 'var(--ws-ink-soft, #4a443c)',
  inkFaint: 'var(--ws-ink-faint, #8b8279)',
  paper: 'var(--ws-paper, #faf7f2)',
  paperRaised: 'var(--ws-paper-raised, #fffefb)',
  paperSunken: 'var(--ws-paper-sunken, #f2ede4)',
  line: 'var(--ws-line, #e5ded2)',
  lineStrong: 'var(--ws-line-strong, #cfc5b5)',
  /** Deep ink-blue. Carries the app's few real actions. */
  accent: 'var(--ws-accent, #2f4858)',
  accentSoft: 'var(--ws-accent-soft, #e3ebf0)',
  /** Warm amber, for streaks and the "used it" moment. */
  gold: 'var(--ws-gold, #b07d2b)',
  goldSoft: 'var(--ws-gold-soft, #f6ecd9)',
  /** Muted green, for a word that has reached Owned. */
  success: 'var(--ws-success, #4a6b4f)',
  successSoft: 'var(--ws-success-soft, #e6efe7)',
  danger: 'var(--ws-danger, #8c3a30)',
} as const

/**
 * Type scale, in px.
 *
 * Wider at the top than a uniform ramp, because this app has one piece of
 * content that matters more than anything around it: the word. `display` exists
 * so a single word can be set large enough to be the whole screen, with body
 * text far enough below it that the two never compete.
 */
export const fontSize = {
  xs: 12,
  sm: 13,
  base: 15,
  md: 17,
  lg: 21,
  xl: 28,
  xxl: 38,
  display: 52,
} as const

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const

/**
 * Two faces, each with one job.
 *
 * `word` is the content — every saved word, wherever it appears, is set in
 * Fraunces. A high-contrast serif gives a single word presence that a UI sans
 * cannot, and it is the reason the library reads as a collection rather than a
 * list of records.
 *
 * `ui` is everything else: labels, buttons, definitions, nav. It stays quiet on
 * purpose. Two faces, strictly divided, is what keeps the app from looking like
 * a font sampler.
 */
export const font = {
  word: '"Fraunces", Georgia, "Times New Roman", serif',
  ui: '"Archivo", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
} as const

/** 4px base unit. Every gap, pad, and inset comes from here. */
export const space = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  xxxxl: 64,
} as const

/**
 * Corner radii, kept deliberately tight.
 *
 * Large radii are the single fastest way to make an app read as generic — the
 * rounded-card look is exactly what this design is avoiding. `pill` exists for
 * tags and status chips only, where the shape carries meaning.
 */
export const radius = {
  none: 0,
  sm: 2,
  md: 4,
  lg: 8,
  pill: 999,
} as const

/**
 * Screen breakpoints. Mobile is the design target; these mark where the layout
 * earns more room, not where it starts working.
 */
export const breakpoint = {
  phone: 480,
  tablet: 768,
  desktop: 1080,
} as const

/** Chrome sizing that must clear a thumb, not a cursor. */
export const control = {
  minTouchTarget: 44,
  bottomBarHeight: 64,
  drawerHandleHeight: 28,
} as const

export const zIndex = {
  base: 1,
  sticky: 10,
  bottomBar: 100,
  drawer: 200,
  modal: 300,
  toast: 400,
} as const

export const duration = {
  fast: 120,
  base: 200,
  slow: 320,
} as const

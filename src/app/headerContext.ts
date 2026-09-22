import { createContext, use } from 'react'

/**
 * What the header is showing right now.
 *
 * The header used to be constant — a wordmark and the theme control — and every
 * screen carried its own `<h1>` plus, where it needed one, its own back button.
 * That cost two rows of vertical space at the top of every screen on a phone:
 * the app's name, then the screen's name directly beneath it, then the content.
 *
 * Now the bar says where you are, and the screens say nothing. Which means the
 * bar has to learn something it never had to know before.
 *
 * **Most titles come from the path, not from here.** `/library` is "Library" on
 * every render, and a screen re-announcing that on mount would be a round trip
 * through state for a constant. `titleForPath` resolves those, and a screen that
 * only needs a static title registers nothing at all.
 *
 * This context is for the two things a path cannot answer: a title that is
 * *data* — the open word, the date of a past session — and a back button whose
 * destination is not simply "up one". A screen with either calls `useHeader`
 * with what it wants shown, and clears it on unmount.
 */

export interface HeaderState {
  /**
   * The title, when it cannot be read from the path.
   *
   * `undefined` leaves the path's own answer in place, which is what a screen
   * whose title is static but whose *back* is dynamic wants.
   */
  title?: string
  /**
   * What tapping back does, and what it is called.
   *
   * The label is announced to screen readers rather than drawn — the chevron
   * carries it visually, and a header wide enough for a mark, a title, a
   * labelled back and a theme toggle does not exist at 375px. The label still
   * matters: "Back to sagacious" is a different promise from "Back to Library",
   * and the difference is exactly what a reader three synonyms deep needs.
   */
  back?: { label: string; onBack: () => void }
}

export interface HeaderValue extends HeaderState {
  /**
   * Registers a screen's header contribution, replacing whatever was there.
   *
   * Called from an effect, never during render, and never cleaned up on
   * unmount — the shell resets the header on navigation instead, which is the
   * only point in the cycle that can order the two correctly. See
   * `useHeaderState`.
   */
  set: (state: HeaderState) => void
}

export const HeaderContext = createContext<HeaderValue | undefined>(undefined)

export function useHeader(): HeaderValue {
  const value = use(HeaderContext)
  if (!value) {
    throw new Error('useHeader must be used inside the app shell.')
  }
  return value
}

/**
 * The title for a path, for every screen whose title is a constant.
 *
 * Longest prefix first, the same order `tabForPath` uses, so `/practice/cards`
 * resolves to Flashcards rather than to Practice. A path with no entry gets no
 * title and the header simply shows none — which is the honest answer for
 * `/share`, an address that redirects before anyone reads it.
 *
 * The practice screens are listed by their own names rather than all reading
 * "Practice". A reader inside a drill knows they are practicing; what the
 * header can usefully add is *which* practice, which is the thing they picked
 * from the menu and the thing a back tap returns them to.
 */
const TITLES: ReadonlyArray<readonly [string, string]> = [
  ['/practice/choose', 'Choose your own'],
  ['/practice/speak', 'Audio practice'],
  ['/practice/cards', 'Flashcards'],
  ['/practice/session', 'Practice'],
  ['/practice/done', 'Session complete'],
  ['/practice/results', 'Session'],
  ['/practice', 'Practice'],
  ['/library', 'Library'],
  ['/lookup', 'Look Up'],
  ['/progress', 'Progress'],
  ['/more', 'More'],
]

export function titleForPath(pathname: string): string | undefined {
  return TITLES.find(([prefix]) => pathname.startsWith(prefix))?.[1]
}

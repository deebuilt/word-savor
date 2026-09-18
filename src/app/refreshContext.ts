import { createContext, use } from 'react'

/**
 * The refresh context and the hook that reads it.
 *
 * Split from the provider so that file exports only a component. A module that
 * exports both a component and a plain function loses fast refresh for
 * everything in it — editing the provider would full-reload the app instead of
 * swapping the component, which in an app whose state is entirely in memory
 * means losing the screen you were looking at on every save.
 *
 * `refresh.tsx` has the reasoning for why these signals exist at all.
 */

interface RefreshValue {
  /** Bumped when the set of saved words changes. Library re-reads on it. */
  libraryToken: number
  /** Bumped when anything Progress reports on changes. Progress re-reads on it. */
  progressToken: number
  /** How many words are due, for the nav badge. */
  dueCount: number
  /**
   * A word was saved.
   *
   * Marks both the library and Progress stale: a saved word joins the ladder at
   * `spotted`, so the distribution Progress draws has changed too.
   */
  onSaved: () => void
  /** A word's schedule moved — an answered drill, a finished session. */
  onProgressed: () => void
  /** A word was deleted. Same reach as a save, in the other direction. */
  onDeleted: () => void
}

export const RefreshContext = createContext<RefreshValue | undefined>(undefined)

/**
 * Read the refresh signals.
 *
 * Throws outside the provider rather than returning a no-op default. A screen
 * that silently stops refreshing is the kind of bug that is noticed weeks later
 * by a number that will not move; failing at the first render names it instead.
 */
export function useRefresh(): RefreshValue {
  const value = use(RefreshContext)
  if (!value) throw new Error('useRefresh must be used inside a RefreshProvider.')
  return value
}

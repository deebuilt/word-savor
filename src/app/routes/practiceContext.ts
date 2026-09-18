import { createContext, use } from 'react'
import type { PracticeSelection, SavedWord } from '../../types/domain'
import type { Outcome, RunState } from '../../practice/session'
import type { ResumeOffer } from '../../practice/usePracticeRun'
import type { UsageGrade } from '../../domain/scheduler'

/**
 * The live run, shared by the four screens under `/practice`.
 *
 * Context rather than props because a route element takes no props from
 * whatever decided to render it — the same reason the refresh tokens moved here
 * when the router landed.
 *
 * Split from `PracticeRoute` so that file exports only a component. A module
 * exporting both a component and a plain function loses fast refresh for
 * everything in it, which in an app whose state is entirely in memory means
 * losing the session you were looking at on every save.
 */

export interface PracticeValue {
  /** The run in progress, or `undefined` between sessions. */
  run: RunState | undefined
  /** The whole library, for drill material and for the landing page's counts. */
  pool: SavedWord[]
  offer: ResumeOffer
  start: (selection: PracticeSelection, words: SavedWord[], pool: SavedWord[]) => void
  resume: () => void
  answer: (outcome: Outcome) => void
  gradeCheckIn: (grade: UsageGrade) => void
  back: () => void
  quit: () => void
  discard: () => void
}

export const PracticeContext = createContext<PracticeValue | undefined>(undefined)

/**
 * Read the run.
 *
 * Throws outside the layout rather than returning a no-op. A practice screen
 * rendered outside `/practice` is a routing mistake, and failing at the first
 * render names it instead of drawing an empty session nobody can start.
 */
export function usePractice(): PracticeValue {
  const value = use(PracticeContext)
  if (!value) throw new Error('usePractice must be used inside the /practice layout.')
  return value
}

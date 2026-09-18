import { useCallback } from 'react'
import { Outlet, useNavigate } from 'react-router'
import type { PracticeSelection, SavedWord } from '../../types/domain'
import { usePracticeRun } from '../../practice/usePracticeRun'
import { useRefresh } from '../refreshContext'
import { PracticeContext } from './practiceContext'

/**
 * `/practice` — the layout the four practice screens live under.
 *
 * **The run lives here, not in any one screen.** The landing page, the session,
 * the end screen and the results view are four addresses, and React Router
 * unmounts the old route's element on navigation exactly as a conditional
 * render did. A run owned by the session screen would die on the way to its own
 * end screen. Owned by the layout, it survives every move between them — the
 * layout is not remounted by navigating within it.
 *
 * That still leaves a run dying when the reader leaves `/practice` entirely,
 * which is the case the parked run in IndexedDB answers: the answers are
 * already written, and the position is stored, so coming back offers it whole.
 * In-memory state is the fast path, not the record.
 *
 * The children read all of this through context rather than props, because a
 * route element takes no props from whatever decided to render it.
 */
export function PracticeRoute() {
  const { onProgressed } = useRefresh()
  const navigate = useNavigate()
  const run = usePracticeRun({ onProgress: onProgressed })

  const { start: startRun, state } = run

  /*
   * Starting navigates as well as building the run, so the two can never
   * disagree — a run with no session on screen, or a session screen with no
   * run, are both states this app should not be able to reach.
   */
  const start = useCallback(
    (selection: PracticeSelection, words: SavedWord[], pool: SavedWord[]) => {
      if (words.length === 0) return
      startRun(selection, words, pool)
      void navigate('/practice/session')
    },
    [navigate, startRun],
  )

  const resume = useCallback(() => {
    run.resume()
    void navigate('/practice/session')
  }, [navigate, run])

  return (
    <PracticeContext
      value={{
        run: state,
        pool: run.pool,
        offer: run.offer,
        start,
        resume,
        answer: run.answer,
        gradeCheckIn: run.gradeCheckIn,
        back: run.back,
        quit: run.quit,
        discard: run.discard,
      }}
    >
      <Outlet />
    </PracticeContext>
  )
}

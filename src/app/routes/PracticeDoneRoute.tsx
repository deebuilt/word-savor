import { useMemo } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { PracticeDone } from '../../screens/PracticeDone'
import { sessionRecord, skippedCount } from '../../practice/session'
import { usePractice } from './practiceContext'

/**
 * `/practice/done` — what the session just did.
 *
 * The record is rebuilt from the run in memory rather than read back from the
 * store. It is the same arithmetic over the same state, it cannot be a
 * different answer, and going to the disk for a row this screen's own data
 * produced would mean showing a spinner for something already in hand.
 *
 * Landing here with no run means a refresh or a stale bookmark, and there is
 * nothing to report — the menu is where to go.
 */
export function PracticeDoneRoute() {
  const { run, pool, discard } = usePractice()
  const navigate = useNavigate()

  /*
   * `endedAt` is left to default to now. It is only used for the date on this
   * screen and the stored row already carries the instant of the last answer,
   * which is within a second of this and is the one the record keeps.
   */
  const session = useMemo(() => (run ? sessionRecord(run, true) : undefined), [run])
  const skipped = useMemo(() => (run ? skippedCount(run.answers, run.steps) : 0), [run])

  if (!run || !session) return <Navigate to="/practice" replace />

  return (
    <PracticeDone
      session={session}
      words={pool}
      skipped={skipped}
      onDone={() => {
        // The run is finished with, so it goes — otherwise the menu would still
        // be holding a completed session that its Back could return into.
        discard()
        void navigate('/practice', { replace: true })
      }}
    />
  )
}

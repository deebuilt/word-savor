import { useEffect } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { PracticeSession } from '../../screens/PracticeSession'
import { usePractice } from './practiceContext'

/**
 * `/practice/session` — the run itself.
 *
 * **Reaching this address with no run redirects to the menu.** A reader can get
 * here by refreshing mid-session or by opening a bookmark, and in-memory state
 * does not survive either. What does survive is the parked run, so the menu
 * they land on is already offering to continue — the redirect sends them to the
 * screen that can actually restart what they were doing, rather than to an
 * empty session.
 *
 * **Finishing navigates to the end screen** rather than rendering it here. The
 * end screen is its own address, which is what lets Back out of it mean
 * something and what stops "session" holding two screens again.
 */
export function PracticeSessionRoute() {
  const { run, answer, gradeCheckIn, back, quit } = usePractice()
  const navigate = useNavigate()

  /*
   * A run whose index has stopped moving and whose last step is answered is
   * over. Derived rather than signalled from the hook, so this is true however
   * the run reached it — including a reader stepping Back and then forward
   * through the final answer again.
   */
  const finished =
    run !== undefined &&
    run.index === run.steps.length - 1 &&
    run.answers.has(run.index)

  useEffect(() => {
    if (finished) void navigate('/practice/done', { replace: true })
  }, [finished, navigate])

  if (!run) return <Navigate to="/practice" replace />

  return (
    <PracticeSession
      run={run}
      onAnswer={answer}
      onGradeCheckIn={gradeCheckIn}
      onBack={back}
      onQuit={() => {
        quit()
        void navigate('/practice', { replace: true })
      }}
    />
  )
}

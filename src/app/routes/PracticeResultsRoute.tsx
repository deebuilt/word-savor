import { Navigate, useNavigate, useParams } from 'react-router'
import { PracticeResults } from '../../screens/PracticeResults'

/**
 * `/practice/results/:sessionId` — a past session in detail.
 *
 * Reads its session from the store by id, so the address works cold: from
 * Progress days later, from a bookmark, from anywhere. It takes nothing from
 * the live run, which is what makes it a real address rather than a screen that
 * happens to be reachable.
 */
export function PracticeResultsRoute() {
  const { sessionId } = useParams()
  const navigate = useNavigate()

  if (!sessionId) return <Navigate to="/practice" replace />

  return (
    <PracticeResults
      sessionId={sessionId}
      onBack={() => void navigate('/practice')}
    />
  )
}

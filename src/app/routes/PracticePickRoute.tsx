import { useNavigate } from 'react-router'
import { PracticePick } from '../../screens/PracticePick'
import { usePractice } from './practiceContext'

/** `/practice/choose` — hand-picking the session's words. */
export function PracticePickRoute() {
  const { pool, start } = usePractice()
  const navigate = useNavigate()

  return (
    <PracticePick
      words={pool}
      onStart={(words) => start('hand-picked', words, pool)}
      onBack={() => void navigate('/practice')}
    />
  )
}

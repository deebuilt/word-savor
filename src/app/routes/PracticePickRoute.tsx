import { PracticePick } from '../../screens/PracticePick'
import { usePractice } from './practiceContext'
import { useBackToPractice } from './useBackToPractice'

/** `/practice/choose` — hand-picking the session's words. */
export function PracticePickRoute() {
  const { pool, start } = usePractice()
  const back = useBackToPractice()

  return (
    <PracticePick
      words={pool}
      onStart={(words) => start('hand-picked', words, pool)}
      onBack={back}
    />
  )
}

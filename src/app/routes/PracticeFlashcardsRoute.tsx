import { PracticeFlashcards } from '../../screens/PracticeFlashcards'
import { usePractice } from './practiceContext'
import { useBackToPractice } from './useBackToPractice'

/** `/practice/cards` — paging through the words. Nothing is scored or written. */
export function PracticeFlashcardsRoute() {
  const { pool } = usePractice()
  const back = useBackToPractice()

  return <PracticeFlashcards words={pool} onBack={back} />
}

import { useNavigate } from 'react-router'
import { PracticeFlashcards } from '../../screens/PracticeFlashcards'
import { usePractice } from './practiceContext'

/** `/practice/cards` — paging through the words. Nothing is scored or written. */
export function PracticeFlashcardsRoute() {
  const { pool } = usePractice()
  const navigate = useNavigate()

  return <PracticeFlashcards words={pool} onBack={() => void navigate('/practice')} />
}

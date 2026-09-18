import { useNavigate } from 'react-router'
import type { PracticeSelection, SavedWord } from '../../types/domain'
import { PracticeStart } from '../../screens/PracticeStart'
import { usePractice } from './practiceContext'

/** `/practice` — the menu of ways to practice. */
export function PracticeStartRoute() {
  const { pool, offer, start, resume } = usePractice()
  const navigate = useNavigate()

  return (
    <PracticeStart
      words={pool}
      offer={offer}
      onStart={(selection: PracticeSelection, words: SavedWord[]) =>
        start(selection, words, pool)
      }
      onResume={resume}
      onHandPick={() => void navigate('/practice/choose')}
      onSpeak={() => void navigate('/practice/speak')}
    />
  )
}

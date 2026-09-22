import { PracticeSpeak } from '../../screens/PracticeSpeak'
import { usePractice } from './practiceContext'
import { useBackToPractice } from './useBackToPractice'

/** `/practice/speak` — hearing the words said. Not a scored session. */
export function PracticeSpeakRoute() {
  const { pool } = usePractice()
  const back = useBackToPractice()

  return <PracticeSpeak words={pool} onBack={back} />
}

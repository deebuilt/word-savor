import { useNavigate } from 'react-router'
import { PracticeSpeak } from '../../screens/PracticeSpeak'
import { usePractice } from './practiceContext'

/** `/practice/speak` — hearing the words said. Not a scored session. */
export function PracticeSpeakRoute() {
  const { pool } = usePractice()
  const navigate = useNavigate()

  return <PracticeSpeak words={pool} onBack={() => void navigate('/practice')} />
}

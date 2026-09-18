import { RightOutlined } from '@ant-design/icons'
import type { PracticeSession, SavedWord } from '../types/domain'
import { SessionBreakdown } from '../components/practice/SessionBreakdown'
import styles from './PracticeDone.module.css'

/**
 * The end of a session.
 *
 * It used to be a score and one button reading "Practice again", which meant
 * the same hundred steps over — the queue was the whole library every time, so
 * the only offer at the end of a long run was to do the long run again.
 *
 * Two things replace it:
 *
 * **What the session actually did**, word by word and weakest first. The score
 * is kept but demoted, because "31 of 44" is a fact you cannot act on and
 * *these four words are the ones that let you down* is one you can.
 *
 * **A way back to the menu**, not a repeat. Choosing again is the right offer:
 * the reader who just finished ten overdue words may well want five minutes on
 * the ones they missed, and the landing page is where that is chosen.
 *
 * **The accuracy line names its denominator.** "31 of 44 answered" rather than
 * "70%", because questions declined with "I don't know this yet" are in
 * neither number — a percentage with an invisible denominator invites the
 * reader to check it against the question count and find it does not match.
 */

interface PracticeDoneProps {
  session: PracticeSession
  words: SavedWord[]
  /** How many questions were declined, which is a fact the record deliberately does not hold. */
  skipped: number
  onDone: () => void
}

export function PracticeDone({ session, words, skipped, onDone }: PracticeDoneProps) {
  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>
        {session.completed ? 'Session complete' : 'Session so far'}
      </h1>

      <p className={styles.score}>
        <span className={styles.scoreFigure}>
          {session.correct} of {session.total}
        </span>{' '}
        <span className={styles.scoreLabel}>answered correctly</span>
      </p>

      {skipped > 0 && (
        <p className={styles.skipped}>
          {skipped} {skipped === 1 ? 'question' : 'questions'} set aside as not known yet —
          not counted either way, and those words will come round sooner.
        </p>
      )}

      <SessionBreakdown session={session} words={words} />

      <button type="button" className={styles.done} onClick={onDone}>
        Choose another session
        <RightOutlined />
      </button>
    </div>
  )
}

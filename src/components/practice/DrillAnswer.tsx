import type { ReactNode } from 'react'
import styles from './PracticeCards.module.css'

/**
 * The answer, appended below the question rather than replacing it.
 *
 * Swapping the question out for a separate reveal screen loses the thing
 * that made the question legible — the sentence, the definition, the four
 * options are gone by the time the answer shows up, so there is nothing to
 * check the answer against. This renders underneath the still-visible
 * question instead: read the question, see the answer, both on screen
 * together.
 *
 * `reference` is deliberately not fixed to one thing (always definitions,
 * say) — what is worth showing next depends on what was just drilled. An
 * odd-one-out drill just exercised the word's *related* terms, so its answer
 * strip shows the word's synonyms: a different, complementary layer of the
 * word's web rather than a repeat of content the reader just worked with.
 * Each card passes the reference content that follows naturally from its own
 * question.
 */

interface DrillAnswerProps {
  correct: boolean
  /** Stated plainly — the fact, not a re-explanation. */
  statement: ReactNode
  /** What to show underneath: synonyms, definitions, whatever complements this drill. */
  reference?: ReactNode
  onNext: () => void
}

export function DrillAnswer({ correct, statement, reference, onNext }: DrillAnswerProps) {
  return (
    <div className={styles.answerStrip}>
      <p className={correct ? styles.revealCorrect : styles.revealIncorrect}>{statement}</p>
      <div className={styles.revealReference}>{reference}</div>
      <button type="button" className={styles.nextButton} onClick={onNext}>
        Next
      </button>
    </div>
  )
}

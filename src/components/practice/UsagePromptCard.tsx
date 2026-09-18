import type { SavedWord } from '../../types/domain'
import type { UsageGrade } from '../../domain/scheduler'
import { Word } from '../word/Word'
import styles from './PracticeCards.module.css'

/**
 * A light check-in after practising a word, not a gate on practising it.
 *
 * Shown once, after the last drill for a word — never in place of one. Its
 * answer feeds the usage-graded schedule and, later, the Progress page; it
 * does not decide whether this word gets drilled again. Every answer,
 * "Not yet" included, leads straight to the next word.
 */

interface UsagePromptCardProps {
  word: SavedWord
  /** Set when Back has returned to this check-in — shows the picked answer without allowing a re-pick. */
  answered?: UsageGrade
  onAnswer: (grade: UsageGrade) => void
}

/*
 * Three answers, not four.
 *
 * "Almost had it" was dropped: nobody could say what almost using a word means,
 * and it was logging a use in the wild for a word that never left your mouth —
 * which inflated the usage count and the Progress page with fumbles. A miss is
 * not a use. Its FSRS rating was the only thing it did that the remaining three
 * do not, and a scheduling nuance nobody can see is not worth a button nobody
 * can read.
 */
const ANSWERS: Array<{ grade: UsageGrade; label: string; hint: string }> = [
  { grade: 'used', label: 'Used it', hint: 'Said or wrote it for real' },
  { grade: 'fuzzy', label: 'Still fuzzy', hint: 'Know it when you see it, not ready to use it' },
  { grade: 'not-yet', label: 'Not yet', hint: 'No attempt since last time' },
]

export function UsagePromptCard({ word, answered, onAnswer }: UsagePromptCardProps) {
  return (
    <div className={styles.card}>
      <span className={styles.eyebrow}>Before moving on — have you used this?</span>
      <Word size="title" as="h2" className={styles.prompt}>
        {word.word}
      </Word>

      <div className={styles.answers}>
        {ANSWERS.map((answer) => (
          <button
            key={answer.grade}
            type="button"
            className={[styles.answer, answered === answer.grade ? styles.answerPicked : ''].filter(Boolean).join(' ')}
            onClick={() => answered === undefined && onAnswer(answer.grade)}
            disabled={answered !== undefined}
          >
            <span className={styles.answerLabel}>{answer.label}</span>
            <span className={styles.answerHint}>{answer.hint}</span>
          </button>
        ))}
      </div>

      {answered !== undefined && (
        <button type="button" className={styles.nextButton} onClick={() => onAnswer(answered)}>
          Next
        </button>
      )}
    </div>
  )
}

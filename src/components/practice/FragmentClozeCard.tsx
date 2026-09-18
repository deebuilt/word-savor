import { useState } from 'react'
import type { FragmentClozeDrill } from '../../domain/puzzles'
import { Word } from '../word/Word'
import { SenseList } from '../word/SenseList'
import { DrillAnswer } from './DrillAnswer'
import { outcomeOf, readsAsCorrect, type Outcome } from './drillOutcome'
import styles from './PracticeCards.module.css'

/**
 * A usage fragment with the word masked, answered by picking from four words.
 *
 * The recognition counterpart to the typed fill-blank. That drill needs a real
 * sentence, because a short collocation ("a ___ suit") would give the answer
 * away by shape. As a *pick*, the same fragment is fair — the reader chooses
 * rather than reconstructs — so words that only have collocations still get a
 * blank-style exercise instead of their example data going to waste.
 *
 * The answer shows the word's senses: having placed the word in a phrase, the
 * natural next thing to see is what it means.
 */

interface FragmentClozeCardProps {
  drill: FragmentClozeDrill
  /** Set when Back has returned to this card, or when the reader skipped it — shows the outcome without allowing a fresh pick. */
  answered?: Outcome
  onAnswer: (outcome: Outcome) => void
}

export function FragmentClozeCard({ drill, answered, onAnswer }: FragmentClozeCardProps) {
  const [picked, setPicked] = useState<string | undefined>(undefined)

  const settled =
    answered ?? (picked !== undefined ? outcomeOf(picked === drill.answer) : undefined)
  const showOptionState = answered !== undefined || picked !== undefined

  return (
    <div className={styles.card}>
      <span className={styles.eyebrow}>Which word fits?</span>

      <p className={styles.sentence}>
        {drill.before}
        <span className={styles.blank}>{settled ? drill.word.word : '     '}</span>
        {drill.after}
      </p>

      <div className={styles.options}>
        {drill.options.map((option) => {
          const isAnswer = showOptionState && option === drill.answer
          const isWrongPick = picked !== undefined && option === picked && option !== drill.answer
          return (
            <button
              key={option}
              type="button"
              className={[styles.option, isAnswer ? styles.optionCorrect : '', isWrongPick ? styles.optionIncorrect : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => answered === undefined && picked === undefined && setPicked(option)}
              disabled={showOptionState}
            >
              <Word size="inline" as="span">
                {option}
              </Word>
            </button>
          )
        })}
      </div>

      {settled && (
        <DrillAnswer
          correct={readsAsCorrect(settled)}
          statement={
            settled === 'correct' ? 'Right.' : `The word is “${drill.word.word}.”`
          }
          reference={<SenseList senses={drill.word.senses} />}
          onNext={() => onAnswer(settled)}
        />
      )}
    </div>
  )
}

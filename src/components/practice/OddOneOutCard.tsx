import { useState } from 'react'
import type { OddOneOutDrill } from '../../domain/puzzles'
import { Word } from '../word/Word'
import { DrillAnswer } from './DrillAnswer'
import { outcomeOf, readsAsCorrect, type Outcome } from './drillOutcome'
import { TermList } from './TermList'
import styles from './PracticeCards.module.css'

/**
 * Three terms related to the word, one impostor borrowed from elsewhere in
 * the library. Picking the impostor tests whether the word's own web of
 * associations has stuck, which is a different kind of knowing than
 * defining it.
 *
 * The answer strip leads with the *related* terms this drill actually drew
 * its options from — so every belonging option is present in the reveal.
 * Showing synonyms here instead (a different list) dropped correct options
 * from view and made a working drill look broken. Synonyms still follow, as a
 * separate labeled layer of the word's web, not a rehash of the definition.
 */

interface OddOneOutCardProps {
  drill: OddOneOutDrill
  /** Set when Back has returned to this card — shows the outcome without allowing a fresh pick. */
  answered?: Outcome
  onAnswer: (outcome: Outcome) => void
}

export function OddOneOutCard({ drill, answered, onAnswer }: OddOneOutCardProps) {
  const [picked, setPicked] = useState<string | undefined>(undefined)

  const settled =
    answered ?? (picked !== undefined ? outcomeOf(picked === drill.impostor) : undefined)
  const showOptionState = answered !== undefined || picked !== undefined

  // The terms the drill drew from — every option except the impostor. Shown in
  // the answer so the belonging options are all accounted for.
  const relatedShown = drill.options.filter((option) => option !== drill.impostor)

  return (
    <div className={styles.card}>
      <span className={styles.eyebrow}>
        Which one doesn’t belong with <Word size="inline">{drill.word.word}</Word>?
      </span>

      <div className={styles.options}>
        {drill.options.map((option) => {
          const isAnswer = showOptionState && option === drill.impostor
          const isWrongPick = picked !== undefined && option === picked && option !== drill.impostor
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
            settled === 'correct'
              ? `Right — the rest are related to “${drill.word.word}.”`
              : `“${drill.impostor}” was the odd one out.`
          }
          reference={
            <div className={styles.referenceGroups}>
              <div>
                <p className={styles.referenceLabel}>
                  Related to “{drill.word.word}”
                </p>
                <TermList terms={relatedShown} />
              </div>
              {drill.word.synonyms.length > 0 && (
                <div>
                  <p className={styles.referenceLabel}>Synonyms</p>
                  <TermList terms={drill.word.synonyms} />
                </div>
              )}
            </div>
          }
          onNext={() => onAnswer(settled)}
        />
      )}
    </div>
  )
}

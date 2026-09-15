import { useState } from 'react'
import type { OddOneOutDrill } from '../../domain/puzzles'
import { Word } from '../word/Word'
import { DrillAnswer } from './DrillAnswer'
import { TermList } from './TermList'
import styles from './PracticeCards.module.css'

/**
 * Three terms related to the word, one impostor borrowed from elsewhere in
 * the library. Picking the impostor tests whether the word's own web of
 * associations has stuck, which is a different kind of knowing than
 * defining it.
 *
 * The answer shows synonyms, not definitions — repeating the definition
 * after a drill that never mentioned it reads as a non sequitur. This drill
 * already exercised one layer of the word's web (related terms); synonyms is
 * the next layer, not a rehash of the same one.
 */

interface OddOneOutCardProps {
  drill: OddOneOutDrill
  /** Set when Back has returned to this card — shows the outcome without allowing a fresh pick. */
  answered?: boolean
  onAnswer: (correct: boolean) => void
}

export function OddOneOutCard({ drill, answered, onAnswer }: OddOneOutCardProps) {
  const [picked, setPicked] = useState<string | undefined>(undefined)

  const settled = answered ?? (picked !== undefined ? picked === drill.impostor : undefined)
  const showOptionState = answered !== undefined || picked !== undefined

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

      {settled !== undefined && (
        <DrillAnswer
          correct={settled}
          statement={
            settled
              ? `Right — the rest are related to “${drill.word.word}.”`
              : `“${drill.impostor}” was the odd one out.`
          }
          reference={
            drill.word.synonyms.length > 0 ? (
              <>
                <p className={styles.referenceLabel}>Synonyms</p>
                <TermList terms={drill.word.synonyms} />
              </>
            ) : undefined
          }
          onNext={() => onAnswer(settled)}
        />
      )}
    </div>
  )
}

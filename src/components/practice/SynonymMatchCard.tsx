import { useState } from 'react'
import type { SynonymMatchDrill } from '../../domain/puzzles'
import { Word } from '../word/Word'
import { DrillAnswer } from './DrillAnswer'
import { TermList } from './TermList'
import styles from './PracticeCards.module.css'

/**
 * Given the definition, pick which of four words means it.
 *
 * The lighter follow-up to `DefinitionMatchCard`'s typed recall — same
 * question, recognition instead of production. Comes after the typed version
 * in `buildDrillsForWord`'s order on purpose.
 *
 * The answer confirms the pick against the word's *full* synonym set, not its
 * definitions — this drill already exercised the synonym relationship, so
 * the follow-up extends that (every synonym saved, not just the one option
 * that was right) rather than repeating content from a different drill.
 */

interface SynonymMatchCardProps {
  drill: SynonymMatchDrill
  /** Set when Back has returned to this card — shows the outcome without allowing a fresh pick. */
  answered?: boolean
  onAnswer: (correct: boolean) => void
}

export function SynonymMatchCard({ drill, answered, onAnswer }: SynonymMatchCardProps) {
  const [picked, setPicked] = useState<string | undefined>(undefined)

  const settled = answered ?? (picked !== undefined ? picked === drill.answer : undefined)
  const showOptionState = answered !== undefined || picked !== undefined

  return (
    <div className={styles.card}>
      <span className={styles.eyebrow}>Which word means this?</span>
      <p className={styles.definitionLarge}>{drill.definition}</p>

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

      {settled !== undefined && (
        <DrillAnswer
          correct={settled}
          statement={settled ? 'Right.' : `The word is “${drill.word.word}.”`}
          reference={<TermList terms={drill.word.synonyms} />}
          onNext={() => onAnswer(settled)}
        />
      )}
    </div>
  )
}

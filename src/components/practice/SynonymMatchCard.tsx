import { useState } from 'react'
import type { SynonymMatchDrill } from '../../domain/puzzles'
import { Word } from '../word/Word'
import { DrillAnswer } from './DrillAnswer'
import { TermList } from './TermList'
import styles from './PracticeCards.module.css'

/**
 * Given the definition, pick which of four words is a *synonym* of the word it
 * describes.
 *
 * Deliberately not "which word means this?" — that is `DefinitionMatchCard`'s
 * question, and back to back on the same word an identical prompt reads as the
 * same question asked twice. This one branches out: recognising an association,
 * eliminating distractors. Its prompt says so, and its answer names the
 * relationship ("'accede' is a synonym of 'acquiesce'") so the reader learns
 * *why* the pick was right.
 *
 * The answer confirms the pick against the word's *full* synonym set — every
 * synonym saved, not just the one option that was right.
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
      <span className={styles.eyebrow}>Which of these is a synonym?</span>
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
          statement={
            settled
              ? `“${drill.answer}” is a synonym of “${drill.word.word}.”`
              : `Not quite — “${drill.answer}” is a synonym of “${drill.word.word}.”`
          }
          reference={
            <>
              <p className={styles.referenceLabel}>Synonyms</p>
              <TermList terms={drill.word.synonyms} />
            </>
          }
          onNext={() => onAnswer(settled)}
        />
      )}
    </div>
  )
}

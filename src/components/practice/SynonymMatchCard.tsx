import { useState } from 'react'
import type { SynonymMatchDrill } from '../../domain/puzzles'
import { Word } from '../word/Word'
import { DrillAnswer } from './DrillAnswer'
import { outcomeOf, readsAsCorrect, type Outcome } from './drillOutcome'
import { TermList } from './TermList'
import styles from './PracticeCards.module.css'

/**
 * Pick which of four words is a synonym of *this* word, in *this* sense.
 *
 * The prompt names the word rather than asking for "a synonym" of the
 * definition below it — a word is a synonym of another word, not of a
 * definition, and the looser phrasing made the question read as vaguer than it
 * is. The definition is still shown, because it is what says which sense is
 * meant, and reasoning from it is the skill being practised.
 *
 * Deliberately not "which word means this?" — that is `DefinitionMatchCard`'s
 * question, and back to back on the same word an identical prompt reads as the
 * same question asked twice. This one branches out: recognising an association,
 * eliminating distractors. Its prompt says so, and its answer names the
 * relationship ("'accede' is a synonym of 'acquiesce'") so the reader learns
 * *why* the pick was right.
 *
 * The definition, the answer, and the synonyms listed underneath all come from
 * one part of speech, which is named above the definition. A word like
 * *precipitate* has a verb sense ("to throw violently, hurl") and an adjective
 * sense ("hasty") with entirely separate synonyms, and crossing them produces a
 * question with no right answer. The label is the reader's half of that
 * guarantee: it says which sense is on trial before they weigh a single option.
 */

interface SynonymMatchCardProps {
  drill: SynonymMatchDrill
  /** Set when Back has returned to this card — shows the outcome without allowing a fresh pick. */
  answered?: Outcome
  onAnswer: (outcome: Outcome) => void
}

export function SynonymMatchCard({ drill, answered, onAnswer }: SynonymMatchCardProps) {
  const [picked, setPicked] = useState<string | undefined>(undefined)

  const settled =
    answered ?? (picked !== undefined ? outcomeOf(picked === drill.answer) : undefined)
  const showOptionState = answered !== undefined || picked !== undefined

  return (
    <div className={styles.card}>
      <span className={styles.eyebrow}>
        Which of these is a synonym of{' '}
        <Word size="inline" as="span">
          {drill.word.word}
        </Word>
        ?
      </span>
      <p className={styles.partOfSpeech}>{drill.partOfSpeech}</p>
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

      {settled && (
        <DrillAnswer
          correct={readsAsCorrect(settled)}
          statement={
            settled === 'correct'
              ? `“${drill.answer}” is a synonym of “${drill.word.word}.”`
              : settled === 'skipped'
                ? `“${drill.answer}” is a synonym of “${drill.word.word}.”`
                : `Not quite — “${drill.answer}” is a synonym of “${drill.word.word}.”`
          }
          reference={
            <>
              <p className={styles.referenceLabel}>Synonyms ({drill.partOfSpeech})</p>
              <TermList terms={drill.senseSynonyms} />
            </>
          }
          onNext={() => onAnswer(settled)}
        />
      )}
    </div>
  )
}

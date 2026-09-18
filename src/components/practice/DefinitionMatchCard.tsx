import { useState } from 'react'
import type { DefinitionMatchDrill } from '../../domain/puzzles'
import { SenseList } from '../word/SenseList'
import { DrillAnswer } from './DrillAnswer'
import { outcomeOf, readsAsCorrect, type Outcome } from './drillOutcome'
import styles from './PracticeCards.module.css'

/**
 * Given the definition, type the word — recall, not a pick from four.
 *
 * This is the app's reverse of how a word is read everywhere else (word,
 * then definition): starting from meaning and reaching for the word is
 * closer to what using a word in the wild actually asks of you than
 * recognising it in a list of options would be.
 *
 * A typed answer is graded by exact string match, which cannot tell "knew
 * the word, fumbled the spelling" from "didn't know it" — the first is real
 * knowledge and the second is not, but they land as the same wrong answer.
 * "I had it, just misspelled" lets the reader say which one this was, after
 * seeing the correct spelling. It counts as correct, because the thing this
 * drill is actually testing — can you reach for this word from its meaning —
 * was demonstrated.
 */

interface DefinitionMatchCardProps {
  drill: DefinitionMatchDrill
  /** Set when Back has returned to this card, or when the reader skipped it — shows the outcome without allowing a fresh submit. */
  answered?: Outcome
  onAnswer: (outcome: Outcome) => void
}

export function DefinitionMatchCard({ drill, answered, onAnswer }: DefinitionMatchCardProps) {
  const [value, setValue] = useState('')
  const [result, setResult] = useState<Outcome | undefined>(undefined)
  const [closeOverride, setCloseOverride] = useState(false)

  const settled = answered ?? result

  const check = () => {
    if (result !== undefined) return
    setResult(outcomeOf(value.trim().toLowerCase() === drill.word.word.toLowerCase()))
  }

  /*
   * A near miss counts as correct, because what this drill tests — reaching for
   * the word from its meaning — was demonstrated. It is offered only on a wrong
   * answer: a reader who has just said they do not know the word cannot then
   * claim they had it, and offering the escape there would turn the honest
   * option into the one that costs you.
   */
  const reported: Outcome = settled === 'wrong' && closeOverride ? 'correct' : (settled ?? 'wrong')

  return (
    <div className={styles.card}>
      <span className={styles.eyebrow}>Which word means this?</span>
      <p className={styles.definitionLarge}>{drill.definition}</p>

      <div className={styles.inputRow}>
        <input
          type="text"
          className={styles.textInput}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') check()
          }}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder={settled ? drill.word.word : 'Type the word'}
          disabled={settled !== undefined}
          autoFocus={answered === undefined}
        />
        {result === undefined && answered === undefined && (
          <button type="button" className={styles.checkButton} onClick={check} disabled={!value.trim()}>
            Check
          </button>
        )}
      </div>

      {settled && (
        <DrillAnswer
          correct={readsAsCorrect(reported)}
          statement={
            settled === 'correct' ? (
              'Right.'
            ) : closeOverride ? (
              `Counted — the word is “${drill.word.word}.”`
            ) : (
              <>
                The word is “{drill.word.word}.”{' '}
                {answered === undefined && settled === 'wrong' && (
                  <button
                    type="button"
                    className={styles.closeLink}
                    onClick={() => setCloseOverride(true)}
                  >
                    I had it, just misspelled
                  </button>
                )}
              </>
            )
          }
          reference={<SenseList senses={drill.word.senses} />}
          onNext={() => onAnswer(reported)}
        />
      )}
    </div>
  )
}

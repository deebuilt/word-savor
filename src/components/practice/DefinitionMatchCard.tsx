import { useState } from 'react'
import type { DefinitionMatchDrill } from '../../domain/puzzles'
import { SenseList } from '../word/SenseList'
import { DrillAnswer } from './DrillAnswer'
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
  /** Set when Back has returned to this card — shows the same outcome without allowing a fresh submit. */
  answered?: boolean
  onAnswer: (correct: boolean) => void
}

export function DefinitionMatchCard({ drill, answered, onAnswer }: DefinitionMatchCardProps) {
  const [value, setValue] = useState('')
  const [result, setResult] = useState<boolean | undefined>(undefined)
  const [closeOverride, setCloseOverride] = useState(false)

  const settled = answered ?? result

  const check = () => {
    if (result !== undefined) return
    setResult(value.trim().toLowerCase() === drill.word.word.toLowerCase())
  }

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
          placeholder={settled !== undefined ? drill.word.word : 'Type the word'}
          disabled={settled !== undefined}
          autoFocus={answered === undefined}
        />
        {result === undefined && answered === undefined && (
          <button type="button" className={styles.checkButton} onClick={check} disabled={!value.trim()}>
            Check
          </button>
        )}
      </div>

      {settled !== undefined && (
        <DrillAnswer
          correct={settled || closeOverride}
          statement={
            settled ? (
              'Right.'
            ) : closeOverride ? (
              `Counted — the word is “${drill.word.word}.”`
            ) : (
              <>
                The word is “{drill.word.word}.”{' '}
                {answered === undefined && (
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
          onNext={() => onAnswer(settled || closeOverride)}
        />
      )}
    </div>
  )
}

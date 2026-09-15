import { useState } from 'react'
import type { FillBlankDrill } from '../../domain/puzzles'
import { SenseList } from '../word/SenseList'
import { DrillAnswer } from './DrillAnswer'
import styles from './PracticeCards.module.css'

/**
 * A real sentence the word appears in, masked out. Typing the answer rather
 * than picking one — the sentence already gives away the part of speech and
 * the general shape, so multiple choice here would be closer to "spot the
 * only word that fits" than a real test. Checked case-insensitively.
 *
 * Same self-report as `DefinitionMatchCard`: an exact-match grade cannot
 * separate a genuine miss from a correct answer typed with a typo, so the
 * reader is given the choice after seeing the correct spelling.
 */

interface FillBlankCardProps {
  drill: FillBlankDrill
  /** Set when Back has returned to this card — shows the same outcome without allowing a fresh submit. */
  answered?: boolean
  onAnswer: (correct: boolean) => void
}

export function FillBlankCard({ drill, answered, onAnswer }: FillBlankCardProps) {
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
      <span className={styles.eyebrow}>Fill in the blank</span>

      <p className={styles.sentence}>
        {drill.before}
        <span className={styles.blank}>
          {settled !== undefined ? drill.word.word : value || '     '}
        </span>
        {drill.after}
      </p>

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
          placeholder="Type the word"
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

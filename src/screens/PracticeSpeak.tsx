import { useMemo } from 'react'
import type { SavedWord } from '../types/domain'
import { sortWords } from '../domain/library'
import { AudioButton } from '../components/word/AudioButton'
import { useHeaderState } from '../app/useHeaderState'
import styles from './PracticeSpeak.module.css'

/**
 * Hearing the words said.
 *
 * **This is not a drill and is deliberately not scored.** No right answer, no
 * FSRS, nothing written to the record — a list of words, each tappable to hear.
 * It fills a real gap rather than adding a seventh way to be tested: every
 * existing drill builds *recognition*, and not one of them ever confirms the
 * reader can say the word out loud. A word you can pick out of four options and
 * cannot pronounce is not a word you will use in front of anyone.
 *
 * Because nothing is recorded, there is no session to abandon and no position
 * to resume. Leaving is just leaving, which is why it has a back link and no
 * quit confirm.
 *
 * **Words with no audio are excluded, not shown silent.** Merriam-Webster does
 * not have a recording for everything, and a row that does nothing when tapped
 * is worse than a row that is not there — the reader taps it twice, then
 * wonders whether the feature is broken. The count says how many are missing so
 * the absence is stated rather than hidden.
 */

interface PracticeSpeakProps {
  words: SavedWord[]
  onBack: () => void
}

export function PracticeSpeak({ words, onBack }: PracticeSpeakProps) {
  /*
   * The way out lives in the app bar now, beside the title.
   *
   * It used to be a labelled link above the heading, which meant every screen
   * under Practice opened with two rows of chrome — a back link, then a 38px
   * title — before anything you came for. Both facts are now in the bar, where
   * they cost no vertical space at all and where the phone's own back gesture
   * already points.
   */
  useHeaderState({ backLabel: 'Back to Practice', onBack })

  const spoken = useMemo(
    () => sortWords(words.filter((word) => Boolean(word.audioUrl)), 'alphabetical'),
    [words],
  )

  const missing = words.length - spoken.length

  return (
    <div className={styles.screen}>
      <p className={styles.blurb}>Listen and repeat. Nothing is scored.</p>

      {spoken.length === 0 ? (
        <p className={styles.state}>
          None of your words have a recording yet. Merriam-Webster does not have audio for
          every entry.
        </p>
      ) : (
        <>
          <ul className={styles.list}>
            {spoken.map((word) => (
              <li key={word.id} className={styles.row}>
                <span className={styles.rowText}>
                  <span className={styles.word}>{word.word}</span>
                  {word.pronunciation && (
                    <span className={styles.pronunciation}>{word.pronunciation}</span>
                  )}
                </span>
                {/*
                 * `word.audioUrl` is non-null by construction — the list is
                 * filtered on it above — but TypeScript cannot see through the
                 * filter, and the alternative is an assertion. A fallback of
                 * empty string would be a silent button, so the guard stays.
                 */}
                {word.audioUrl && (
                  <AudioButton src={word.audioUrl} word={word.word} size="large" />
                )}
              </li>
            ))}
          </ul>

          {missing > 0 && (
            <p className={styles.missing}>
              {missing} {missing === 1 ? 'word has' : 'words have'} no recording, so
              {missing === 1 ? ' it is' : ' they are'} not listed.
            </p>
          )}
        </>
      )}
    </div>
  )
}

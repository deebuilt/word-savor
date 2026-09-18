import type { SavedWord } from '../../types/domain'
import styles from './StatusMark.module.css'

/**
 * What has happened to one word, as a dot.
 *
 * Two independent facts, not a position on a ramp: has it been **practiced**,
 * and has it been **used**. Both can be true, either can be true alone, and
 * neither cancels the other.
 *
 * It used to render `SavedWord.status` directly, which held a single value —
 * so a word could not be both, and `showLabel` printed the raw stored word
 * ("spotted", "rehearsed") on screen. That model implied a progression the app
 * cannot observe: nothing ever set `understood`, and `owned` only meant the
 * check-in button had been tapped twice.
 *
 * Read from the word's own counters rather than its status, so the mark cannot
 * disagree with what Progress counts. `usageCount` is incremented in the same
 * transaction that logs each use, and `used` is the one status value that is
 * genuinely reported by the reader.
 *
 * Colour is never the only signal — the dot always carries a text label for a
 * screen reader, and for anyone who cannot separate the gold from the grey.
 */

interface StatusMarkProps {
  word: SavedWord
  /** Show the description beside the dot. Off in dense lists. */
  showLabel?: boolean
}

/**
 * Whether a word has been used, from the status the reader actually reports.
 *
 * `owned` is folded in: it means the same thing, recorded twice.
 */
function isUsed(word: SavedWord): boolean {
  return word.status === 'used' || word.status === 'owned'
}

/**
 * Whether a word has been through a drill.
 *
 * `usageCount` counts both practice answers and reported uses, so a non-zero
 * count means the word has been worked on. A used word counts as practiced —
 * it was answered in a drill to reach the check-in.
 */
function isPracticed(word: SavedWord): boolean {
  return word.usageCount > 0 || word.status === 'rehearsed' || isUsed(word)
}

function describe(word: SavedWord): string {
  if (isUsed(word)) return 'Used. Practiced too.'
  if (isPracticed(word)) return 'Practiced. Not used yet.'
  return 'Saved. Not practiced yet.'
}

export function StatusMark({ word, showLabel = false }: StatusMarkProps) {
  const description = describe(word)
  // Gold once used, a filled ring once practiced, an empty ring otherwise.
  const state = isUsed(word) ? 'used' : isPracticed(word) ? 'practiced' : 'saved'

  return (
    <span className={styles.mark} title={description}>
      <span className={`${styles.dot} ${styles[state]}`} role="img" aria-label={description} />
      {showLabel && <span className={styles.label}>{description}</span>}
    </span>
  )
}

import type { SavedWord } from '../../types/domain'
import { isPracticed, isUsed } from '../../domain/library'
import styles from './StatusMark.module.css'

/**
 * What has happened to one word.
 *
 * Two independent facts, not a position on a ramp: has it been **practiced**,
 * and has it been **used**. Both can be true, either can be true alone, and
 * neither cancels the other.
 *
 * **Two shapes, because two screens ask differently.** In a library row this is
 * a mark at the end of the line — it has to be readable at a glance across
 * fifty rows without competing with the words themselves, which are the thing
 * worth looking at. On the word's own screen there is room to say it in words,
 * and a bare dot there is a puzzle: the reader has nothing to compare it
 * against, so the colour means nothing.
 *
 * **The mark was a single dot and that was not enough.** Three states encoded
 * as a border colour on an 8px circle put the difference between "saved" and
 * "practiced" into 1.5px of a tone most people cannot pick out — and it carried
 * no information at all about *how much* had happened. It now shows the two
 * facts as two marks, so "practiced but not used" is visibly a different shape
 * from "used", not a different shade.
 *
 * Colour is never the only signal. The shapes differ, and every mark carries a
 * text label for a screen reader.
 *
 * Reads counters rather than `SavedWord.status`, so the mark cannot disagree
 * with what Progress counts — status is one slot that practicing and using
 * overwrite in turn. Both predicates live in `domain/library.ts`, shared with
 * the filters, so a word the "not practiced" filter shows can never render a
 * practiced mark.
 */

interface StatusMarkProps {
  word: SavedWord
  /**
   * Say it in words rather than as a mark. For the word's own screen, where
   * there is room and no other row to compare against.
   */
  showLabel?: boolean
}

function describe(word: SavedWord): string {
  if (isUsed(word)) return 'Used and practiced'
  if (isPracticed(word)) return 'Practiced, not used yet'
  return 'Saved, not practiced yet'
}

export function StatusMark({ word, showLabel = false }: StatusMarkProps) {
  const practiced = isPracticed(word)
  const used = isUsed(word)
  const description = describe(word)

  if (showLabel) {
    return (
      <span className={styles.detail}>
        <Pip filled={practiced} tone="practiced" />
        <Pip filled={used} tone="used" />
        <span className={styles.label}>{description}</span>
      </span>
    )
  }

  /*
   * Two pips in a row, so the state is a shape before it is a colour: nothing,
   * one filled, or two. An unfilled pip stays visible as a faint ring rather
   * than vanishing, because "one of two" only reads as partial when the empty
   * half is still there to be seen.
   */
  return (
    <span className={styles.mark} role="img" aria-label={description} title={description}>
      <Pip filled={practiced} tone="practiced" />
      <Pip filled={used} tone="used" />
    </span>
  )
}

function Pip({ filled, tone }: { filled: boolean; tone: 'practiced' | 'used' }) {
  return (
    <span
      aria-hidden="true"
      className={`${styles.pip} ${filled ? styles[tone] : styles.empty}`}
    />
  )
}

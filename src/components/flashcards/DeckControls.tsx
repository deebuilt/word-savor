import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import styles from './DeckControls.module.css'

/**
 * Where you are in the deck, and the way through it.
 *
 * **The position is between the two buttons, not above the card.** It is the
 * one number on this screen and it belongs with the controls that change it —
 * put at the top it would read as a heading for the card, which would make the
 * card look like item 3 of 47 in a list rather than the thing being looked at.
 *
 * **Buttons rather than swipe.** A swipe has no affordance: there is nothing on
 * a card to suggest it, so it is a feature the reader has to be told about
 * somewhere outside the app. Visible arrows also give the deck a keyboard and a
 * screen reader, which a gesture does not.
 *
 * **The ends stop rather than wrap.** A deck that loops has no end, and the
 * whole promise of this screen is that it is a finite set you can get through —
 * the count on the Practice page says how long it is, and an endless deck would
 * make that number a lie. The end is a real place, and the screen says so.
 */

interface DeckControlsProps {
  /** Zero-based, for arithmetic. Displayed one-based, for reading. */
  index: number
  total: number
  onPrevious: () => void
  onNext: () => void
}

export function DeckControls({ index, total, onPrevious, onNext }: DeckControlsProps) {
  return (
    <div className={styles.controls}>
      <button
        type="button"
        className={styles.step}
        onClick={onPrevious}
        disabled={index === 0}
        aria-label="Previous card"
      >
        <LeftOutlined />
      </button>

      {/*
       * `aria-live` so moving through the deck is announced. Without it the
       * card's label changes silently and there is no signal that anything
       * advanced — the buttons are unlabelled arrows to a screen reader
       * otherwise.
       */}
      <p className={styles.position} aria-live="polite">
        <span className={styles.figure}>{index + 1}</span>
        <span className={styles.total}>of {total}</span>
      </p>

      <button
        type="button"
        className={styles.step}
        onClick={onNext}
        disabled={index >= total - 1}
        aria-label="Next card"
      >
        <RightOutlined />
      </button>
    </div>
  )
}

import { SwapOutlined } from '@ant-design/icons'
import type { DeckDirection, DeckOrder } from '../../domain/flashcards'
import styles from './DeckOptions.module.css'

/**
 * How you are paging: which face opens, and in what order.
 *
 * **Quiet text controls, not a second row of tabs.** Scope is the loud choice —
 * it changes the count and what set you are in, so it keeps the tab row above.
 * These two change nothing about *what* is in the deck, only how it comes at
 * you, and three full-width switches stacked over a phone would spend the
 * card's height on settings.
 *
 * The split is conceptual as well as spatial: scope is *what am I paging
 * through*, and these are *how*. Grouping them on one line says that.
 *
 * Each control states its current value and flips on tap, rather than showing
 * both options with one selected. Two positions do not need four words and a
 * selected state to explain them, and at 375px the difference is what keeps
 * this to a single line.
 */

interface DeckOptionsProps {
  direction: DeckDirection
  order: DeckOrder
  onDirection: (direction: DeckDirection) => void
  onOrder: (order: DeckOrder) => void
  /** Deal a new shuffled order. Only offered when already shuffled. */
  onReshuffle: () => void
}

export function DeckOptions({
  direction,
  order,
  onDirection,
  onOrder,
  onReshuffle,
}: DeckOptionsProps) {
  return (
    <div className={styles.options}>
      <button
        type="button"
        className={styles.option}
        onClick={() => onDirection(direction === 'word' ? 'meaning' : 'word')}
        /*
         * The label is the *current* state, so the accessible name has to say
         * what tapping does — otherwise a screen reader hears "Word first" and
         * has no way to know it is a control rather than a caption.
         */
        aria-label={
          direction === 'word'
            ? 'Showing the word first. Switch to meaning first.'
            : 'Showing the meaning first. Switch to word first.'
        }
      >
        {direction === 'word' ? 'Word first' : 'Meaning first'}
      </button>

      <span className={styles.divider} aria-hidden="true">
        ·
      </span>

      <button
        type="button"
        className={styles.option}
        onClick={() => onOrder(order === 'sorted' ? 'shuffled' : 'sorted')}
        aria-label={
          order === 'sorted'
            ? 'In alphabetical order. Switch to shuffled.'
            : 'Shuffled. Switch to alphabetical order.'
        }
      >
        {order === 'sorted' ? 'In order' : 'Shuffled'}
      </button>

      {/*
       * Shuffling again is only meaningful once shuffled, so it appears with
       * the state it belongs to rather than sitting greyed out the rest of the
       * time. Without it, "shuffled" is just a second fixed order — which gets
       * memorised exactly the way the alphabetical one does, and that is the
       * whole thing shuffle was added to prevent.
       */}
      {order === 'shuffled' && (
        <button
          type="button"
          className={styles.reshuffle}
          onClick={onReshuffle}
          aria-label="Shuffle the deck again"
        >
          <SwapOutlined />
          Again
        </button>
      )}
    </div>
  )
}

import { StarFilled, StarOutlined } from '@ant-design/icons'
import styles from './FavoriteStar.module.css'

/**
 * The favourite star, for a word and for a definition alike.
 *
 * **One component for both**, because they are the same interaction at two
 * scales — filled means kept, outline means not, a tap flips it. Two components
 * would be two places for the filled colour, the tap target, and the pressed
 * state to drift apart, and the reader would learn the same control twice.
 *
 * Always visible rather than revealed on hover: hover does not exist on the
 * phone this app is designed for first, and a control that only appears on a
 * pointer device is a control half the readers never find. Outline at rest is
 * quiet enough to live permanently beside a definition.
 *
 * The label is required and specific — "Favourite" alone, repeated down a page
 * of definitions, gives a screen reader a list of identical buttons with no way
 * to tell which definition each one belongs to.
 */

interface FavoriteStarProps {
  /** Filled when true, outline when false. */
  active: boolean
  /** What this star favourites, for assistive tech. Names the target, not the action. */
  label: string
  /** Bigger, for the word itself; the default suits a definition. */
  size?: 'word' | 'sense'
  onToggle: () => void
}

export function FavoriteStar({ active, label, size = 'sense', onToggle }: FavoriteStarProps) {
  return (
    <button
      type="button"
      /*
       * `aria-pressed` rather than a checkbox role: this is a toggle on an
       * existing thing, and the pressed state is what conveys "starred" without
       * the label having to change between taps.
       */
      aria-pressed={active}
      aria-label={label}
      className={`${styles.star} ${size === 'word' ? styles.word : styles.sense} ${
        active ? styles.on : ''
      }`}
      onClick={(event) => {
        /*
         * Both stars sit inside larger tappable surfaces in places — a library
         * row is a button, and a sense may later be one. Stopping here means a
         * tap on the star never also opens what is underneath it.
         */
        event.stopPropagation()
        event.preventDefault()
        onToggle()
      }}
    >
      {active ? <StarFilled /> : <StarOutlined />}
    </button>
  )
}

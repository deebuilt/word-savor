import type { DeckScope } from '../../domain/flashcards'
import styles from './ScopeSwitch.module.css'

/**
 * Which words the deck is drawn from: all of them, or the favorites.
 *
 * **This is here and not on the Practice page's card**, and that is the one
 * real structural decision in this feature. The menu's premise is that tapping
 * a card *is* the choice and it starts — putting a toggle on the card would
 * turn an entry point into a settings row, which is what that screen was built
 * to not be. Two separate cards would be worse: the same verb twice with a
 * filter attached, dressed as two ways to practice when it is one way over two
 * sets.
 *
 * Choosing what you are looking through, while you are looking through it, is
 * the same act as the Library's Favorites filter. It belongs next to the
 * cards. See `docs/flashcards-plan.md`.
 *
 * **An empty Favorites set is disabled, not hidden** — the practice menu's rule
 * for an empty card, for the same reason: a control that comes and goes as the
 * library changes cannot be learned, and "you have not starred any words yet"
 * is worth being told rather than left to infer from a missing button.
 */

interface ScopeSwitchProps {
  scope: DeckScope
  /** How many words each scope would deal, so the choice states its own size. */
  counts: Record<DeckScope, number>
  onChange: (scope: DeckScope) => void
}

const OPTIONS: { id: DeckScope; label: string }[] = [
  { id: 'all', label: 'All words' },
  { id: 'favorites', label: 'Favorites' },
]

export function ScopeSwitch({ scope, counts, onChange }: ScopeSwitchProps) {
  return (
    /*
     * A tablist, because that is what this is: two views of the same screen,
     * switched in place. Radio semantics would describe a form field that is
     * submitted somewhere, and nothing here is submitted.
     */
    <div className={styles.switch} role="tablist" aria-label="Which words to page through">
      {OPTIONS.map((option) => {
        const count = counts[option.id]
        const active = scope === option.id

        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={active ? `${styles.option} ${styles.active}` : styles.option}
            onClick={() => onChange(option.id)}
            disabled={count === 0}
          >
            <span className={styles.label}>{option.label}</span>
            <span className={styles.count}>{count}</span>
          </button>
        )
      })}
    </div>
  )
}

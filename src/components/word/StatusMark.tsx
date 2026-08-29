import type { WordStatus } from '../../types/domain'
import styles from './StatusMark.module.css'

/**
 * How far a word has travelled, as a dot.
 *
 * The progression fills in as it goes: an empty ring for a word only spotted, a
 * solid dot once it has actually been used. That is the app's whole argument in
 * one mark — the early states are prologue, and only `used` and `owned` carry
 * colour.
 *
 * Colour is never the only signal. The dot always has an accessible label, so
 * the state is available to a screen reader and to anyone who cannot separate
 * the gold from the green.
 */

const DESCRIPTION: Record<WordStatus, string> = {
  spotted: 'Spotted. Saved, not read closely yet.',
  understood: 'Understood. The definition has landed.',
  rehearsed: 'Rehearsed. Practised in the app.',
  used: 'Used. Said or written it for real.',
  owned: 'Owned. Used more than once, unprompted.',
}

interface StatusMarkProps {
  status: WordStatus
  /** Show the status name beside the dot. Off in dense lists. */
  showLabel?: boolean
}

export function StatusMark({ status, showLabel = false }: StatusMarkProps) {
  return (
    <span className={styles.mark} title={DESCRIPTION[status]}>
      <span
        className={`${styles.dot} ${styles[status]}`}
        role="img"
        aria-label={DESCRIPTION[status]}
      />
      {showLabel && <span className={styles.label}>{status}</span>}
    </span>
  )
}

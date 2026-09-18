import type { SessionRecord } from '../../domain/progress'
import styles from './SessionList.module.css'

/**
 * Past practice sessions, newest first.
 *
 * Until this existed, every session's score was written to the database and
 * never shown again — Practice looped straight from "12 of 13 landed" back to
 * starting another run. Scores were being kept with nowhere to see them.
 *
 * Each row states the score as a fraction rather than only a percentage: "12 of
 * 13" carries how much work the session was, which a bare 92% throws away. The
 * percentage sits beside it for comparison across sessions of different sizes.
 */

interface SessionListProps {
  sessions: SessionRecord[]
}

export function SessionList({ sessions }: SessionListProps) {
  return (
    <ol className={styles.list}>
      {sessions.map((session) => (
        <li key={session.id} className={styles.row}>
          <span className={styles.when}>{formatWhen(session.endedAt)}</span>
          <span className={styles.score}>
            {session.correct} of {session.total}
          </span>
          <span className={styles.accuracy}>
            {session.accuracy === undefined ? '—' : `${Math.round(session.accuracy * 100)}%`}
          </span>
        </li>
      ))}
    </ol>
  )
}

/**
 * When a session happened, in the shortest form that stays unambiguous.
 *
 * Relative for the first two days because "yesterday" is read faster than a
 * date, then an absolute date, because "17 days ago" is a number a reader has
 * to do arithmetic on to place.
 */
function formatWhen(at: number): string {
  const then = new Date(at)
  const now = new Date()

  const midnight = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const daysAgo = Math.round((midnight(now) - midnight(then)) / 86_400_000)

  if (daysAgo === 0) return 'Today'
  if (daysAgo === 1) return 'Yesterday'

  return then.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    // The year only when it is not this one — printing it always is noise for
    // the sessions a reader is most likely looking at.
    year: then.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  })
}

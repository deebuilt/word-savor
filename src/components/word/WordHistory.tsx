import type { DrillKind, Usage } from '../../types/domain'
import { markedInterval, type WordPracticeRecord } from '../../domain/progress'
import styles from './WordHistory.module.css'

/**
 * One word's own record: figures and labels, not sentences.
 *
 * This is the narrowest altitude in the app. Progress asks about the whole
 * library, Library ranks words against each other, and this asks only what has
 * happened with this word.
 *
 * **Figures, in the same label-and-value rows the Progress page uses.** An
 * earlier version wrote this as prose, and on a screen already carrying a
 * word's senses, synonyms, opposites and related terms, two more grey sentences
 * read as metadata to skip. Numbers in a column can be scanned; sentences in
 * the same rhythm as everything above them cannot. Matching Progress rather
 * than inventing a layout also means one convention for reading a figure
 * anywhere in the app.
 *
 * **Every label says what was actually measured.** A `wild` usage is the reader
 * tapping a button, so it reads "marked used" and never "used" — the app cannot
 * observe someone saying a word out loud. A drill is one question, and a word
 * generates about four a session, so drills are never labeled as sessions.
 *
 * **A figure is omitted, never zeroed, when there is nothing to report.** Zero
 * is a score, and a word that has never been drilled has not earned one.
 *
 * Sessions that ran before per-drill results were stored are simply not counted.
 * `wordPracticeRecord` still reports them as `unrecordedSessions`, because the
 * distinction is real in the data, but nothing on screen mentions it — a note
 * explaining which build of the app recorded what is the app talking about
 * itself, not about the reader's word.
 */

interface WordHistoryProps {
  record: WordPracticeRecord
  usages: Usage[]
}

/**
 * What each drill asks, in the reader's terms.
 *
 * The stored kinds are internal names — "fragment-cloze" means nothing to
 * anyone who has not read `puzzles.ts`. These name the task, because the whole
 * value of splitting a word's record by drill kind is showing which kind of
 * knowing is weak: producing a word from its meaning is a different skill from
 * picking it out of four options.
 */
const DRILL_LABELS: Record<DrillKind, string> = {
  'definition-match': 'From its meaning',
  'fill-blank': 'Written into a sentence',
  'fragment-cloze': 'Chosen for a sentence',
  'synonym-match': 'Matched to a synonym',
  'odd-one-out': 'Told from unrelated words',
}

export function WordHistory({ record, usages }: WordHistoryProps) {
  const marks = usages.filter((usage) => usage.kind === 'wild')
  const interval = markedInterval(usages)
  const hasPractice = record.answered > 0

  if (!hasPractice && marks.length === 0) {
    return (
      <p className={styles.none}>
        Nothing recorded yet. Practice this word, or mark it used, and its record starts here.
      </p>
    )
  }

  const lastMark = marks[0]

  return (
    <div className={styles.history}>
      <dl className={styles.stats}>
        {marks.length > 0 && (
          <div className={styles.stat}>
            <dt className={styles.statLabel}>Marked used</dt>
            <dd className={styles.statValue}>
              {marks.length} {marks.length === 1 ? 'time' : 'times'}
            </dd>
          </div>
        )}

        {/*
          The typical gap between marks, shown only once there are enough marks
          to have a typical anything. See `MIN_MARKS_FOR_INTERVAL`.
        */}
        {interval !== undefined && (
          <div className={styles.stat}>
            <dt className={styles.statLabel}>Frequency</dt>
            <dd className={styles.statValue}>
              {interval === 1 ? 'about daily' : `every ${interval} days`}
            </dd>
          </div>
        )}

        {lastMark && (
          <div className={styles.stat}>
            <dt className={styles.statLabel}>Last marked used</dt>
            <dd className={styles.statValue}>{relativeDate(lastMark.at)}</dd>
          </div>
        )}

        {hasPractice && (
          <div className={styles.stat}>
            <dt className={styles.statLabel}>Drills correct</dt>
            <dd className={styles.statValue}>
              {record.correct} of {record.answered}
            </dd>
          </div>
        )}

        {record.sessions > 0 && (
          <div className={styles.stat}>
            <dt className={styles.statLabel}>Practiced in</dt>
            <dd className={styles.statValue}>
              {record.sessions} {record.sessions === 1 ? 'session' : 'sessions'}
            </dd>
          </div>
        )}
      </dl>

      {/*
        The same rows again, one per kind of drill, weakest first — the reason
        to split a record by drill kind is to name what to work on, and a list
        led by what is already known buries it.
      */}
      {record.byKind.length > 0 && (
        <div className={styles.kinds}>
          <h3 className={styles.kindsTitle}>By drill</h3>
          <dl className={styles.stats}>
            {record.byKind.map((kind) => (
              <div key={kind.drill} className={styles.stat}>
                <dt className={styles.statLabel}>{DRILL_LABELS[kind.drill]}</dt>
                <dd className={styles.statValue}>
                  {kind.correct} of {kind.answered}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* The reader's own sentence, if they recorded one with the last mark.
          The only text in this section that is theirs. */}
      {lastMark?.sentence && <p className={styles.sentence}>{lastMark.sentence}</p>}

    </div>
  )
}

/**
 * A date as a short phrase.
 *
 * Relative while that is the more useful form — "3 days ago" is what "last
 * marked used" is asking, and "14 Sep 2026" makes the reader work out how long
 * ago that was. Past a month the day count stops meaning anything.
 */
function relativeDate(at: number, now = Date.now()): string {
  const days = Math.floor((now - at) / (24 * 60 * 60 * 1000))

  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`

  return new Date(at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

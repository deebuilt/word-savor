import { useMemo } from 'react'
import type { DrillResult, PracticeSession, SavedWord } from '../../types/domain'
import styles from './SessionBreakdown.module.css'

/**
 * One session, word by word.
 *
 * This is what `DrillResult` was added for and the thing nothing in the app
 * could show: the Progress page lists sessions with a score each, which answers
 * "how did that go" and never "which words let me down". A score of 31 out of
 * 44 is not actionable; *obfuscate, missed on typed recall* is.
 *
 * **Weakest first.** The order is the point — a reader scanning this wants the
 * words that need another look, and burying them below eleven perfect rows in
 * alphabetical order makes the screen a list to read rather than a result to
 * act on.
 *
 * **Skipped questions are visible but are not misses.** They are not in
 * `results` at all, by design — a skip is not a wrong answer. So a word that was
 * skipped throughout shows no score rather than a zero, and says so. Printing
 * 0% for questions nobody answered would be exactly the invented evidence the
 * whole stats plan refuses.
 *
 * **Words with nothing recorded are shown last, under their own note.** A
 * session names every word it drew, and the ones that were never reached are
 * part of what happened — silently dropping them would make an abandoned
 * session look like a complete one.
 */

interface SessionBreakdownProps {
  session: PracticeSession
  /** The library, for turning stored ids back into words. */
  words: SavedWord[]
}

interface WordRow {
  id: string
  /** The display word, or the id when the word has since been deleted. */
  label: string
  correct: number
  total: number
  /** Which drills went wrong, for the second line. */
  missed: DrillResult[]
}

export function SessionBreakdown({ session, words }: SessionBreakdownProps) {
  const rows = useMemo(() => buildRows(session, words), [session, words])

  /*
   * A session recorded before per-drill results existed has `results:
   * undefined`, which is not the same as a session where nothing was answered.
   * Saying so beats drawing an empty breakdown that implies the session did
   * nothing.
   */
  if (!session.results) {
    return (
      <p className={styles.note}>
        This session was recorded before the app kept per-word results, so only its
        score survives.
      </p>
    )
  }

  const answered = rows.filter((row) => row.total > 0)
  const untouched = rows.filter((row) => row.total === 0)

  return (
    <div className={styles.breakdown}>
      {answered.length > 0 && (
        <ul className={styles.list}>
          {answered.map((row) => (
            <li key={row.id} className={styles.row}>
              <span className={styles.rowText}>
                <span className={styles.word}>{row.label}</span>
                {row.missed.length > 0 && (
                  <span className={styles.missed}>
                    Missed {row.missed.map((result) => drillLabel(result.drill)).join(', ')}
                  </span>
                )}
              </span>
              <span className={styles.score}>
                <span className={styles.scoreFigure}>
                  {row.correct}/{row.total}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {untouched.length > 0 && (
        <div className={styles.untouched}>
          <p className={styles.untouchedLabel}>
            {/*
             * "Not answered" rather than "skipped", because these two are
             * different facts and the app has a name for each. A skipped
             * question was declined on purpose; these were never reached, or
             * were reached and declined — either way nothing was recorded, and
             * a label claiming a deliberate skip would be reporting an
             * intention nobody expressed.
             */}
            Nothing recorded
          </p>
          <p className={styles.untouchedWords}>
            {untouched.map((row) => row.label).join(', ')}
          </p>
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function buildRows(session: PracticeSession, words: SavedWord[]): WordRow[] {
  const byId = new Map(words.map((word) => [word.id, word]))

  const rows = new Map<string, WordRow>()
  for (const id of session.wordIds) {
    rows.set(id, {
      id,
      // A deleted word keeps its place in the record. The session happened, and
      // dropping the row would quietly change what the session was.
      label: byId.get(id)?.word ?? 'a deleted word',
      correct: 0,
      total: 0,
      missed: [],
    })
  }

  for (const result of session.results ?? []) {
    const row = rows.get(result.wordId)
    if (!row) continue
    row.total++
    if (result.correct) row.correct++
    else row.missed.push(result)
  }

  /*
   * Weakest first: lowest share correct, then most questions answered — so
   * between two words that both went 1-for-2, the one that was drilled more is
   * the more solid reading and sorts above. Words with nothing recorded fall to
   * the end, where they are drawn separately.
   */
  return [...rows.values()].sort((a, b) => {
    if (a.total === 0 || b.total === 0) return a.total === 0 ? 1 : -1
    const share = a.correct / a.total - b.correct / b.total
    if (share !== 0) return share
    return b.total - a.total || a.label.localeCompare(b.label, 'en', { sensitivity: 'base' })
  })
}

/**
 * A drill kind in the words the reader sees.
 *
 * The stored strings are a database vocabulary, not labels — "fragment-cloze"
 * on a results screen is the app talking to itself. These say what the question
 * asked, because that is what makes "missed" mean something: failing to produce
 * a word from its definition is a different fact from picking the wrong synonym
 * out of four.
 */
function drillLabel(kind: DrillResult['drill']): string {
  switch (kind) {
    case 'definition-match':
      return 'typing it from its meaning'
    case 'fill-blank':
      return 'typing it into a sentence'
    case 'fragment-cloze':
      return 'picking it for a phrase'
    case 'synonym-match':
      return 'its synonym'
    case 'odd-one-out':
      return 'the odd one out'
  }
}

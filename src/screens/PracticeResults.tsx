import { useEffect, useState } from 'react'
import { LeftOutlined } from '@ant-design/icons'
import type { PracticeSession, SavedWord } from '../types/domain'
import { getSession, listWords } from '../storage/db'
import { practiceCard } from '../domain/practiceSelection'
import { SessionBreakdown } from '../components/practice/SessionBreakdown'
import styles from './PracticeResults.module.css'

/**
 * One past session, in detail.
 *
 * Progress already lists sessions with a score each, so rebuilding that list
 * here would give the app a second place to read the same thing. What is
 * missing everywhere is the *inside* of a session — which words came up and how
 * each went — so that is all this screen is, plus the header it needs to say
 * which session you are looking at.
 *
 * It reads from the store by id rather than taking a session as a prop, because
 * its address is shareable: this is the screen a reader reaches from Progress
 * days later, from a bookmark, or by pressing Back out of the end screen. A
 * screen that only works when something else hands it state is not a screen
 * with an address.
 */

interface PracticeResultsProps {
  sessionId: string
  onBack: () => void
}

type Load =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'found'; session: PracticeSession; words: SavedWord[] }

export function PracticeResults({ sessionId, onBack }: PracticeResultsProps) {
  const [load, setLoad] = useState<Load>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [session, words] = await Promise.all([getSession(sessionId), listWords()])
      if (cancelled) return
      setLoad(session ? { status: 'found', session, words } : { status: 'missing' })
    })()
    return () => {
      cancelled = true
    }
  }, [sessionId])

  return (
    <div className={styles.screen}>
      <div className={styles.head}>
        <button type="button" className={styles.back} onClick={onBack}>
          <LeftOutlined />
          Practice
        </button>
      </div>

      {load.status === 'loading' && <p className={styles.state}>Reading the session…</p>}

      {load.status === 'missing' && (
        <p className={styles.state}>
          That session is no longer in the record.
        </p>
      )}

      {load.status === 'found' && (
        <>
          <h1 className={styles.title}>{formatWhen(load.session.endedAt)}</h1>
          <p className={styles.subtitle}>{describe(load.session)}</p>

          <p className={styles.score}>
            <span className={styles.scoreFigure}>
              {load.session.correct} of {load.session.total}
            </span>{' '}
            <span className={styles.scoreLabel}>answered correctly</span>
          </p>

          <SessionBreakdown session={load.session} words={load.words} />
        </>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

/**
 * What the session was, in one line.
 *
 * The selection is named where it was recorded and described as the whole
 * library where it was not. Sessions from before the landing page existed had
 * no selection to store — the queue was everything, every time — so saying so
 * is accurate rather than a guess at a card that did not exist yet.
 */
function describe(session: PracticeSession): string {
  const count = session.wordIds.length
  const words = `${count} ${count === 1 ? 'word' : 'words'}`
  const label = session.selection ? practiceCard(session.selection)?.label : undefined
  const how = label ? `${label} · ${words}` : `${words}, from the whole library`

  // Only sessions that record it can say they were left unfinished. Absence
  // means the row predates the flag, and every one of those was filed on
  // completion — so reading it as unfinished would invent a fact.
  return session.completed === false ? `${how} · left unfinished` : how
}

/**
 * When the session happened, spelled out.
 *
 * Longer than the Progress list's form on purpose: there the date is one column
 * of many and is read by scanning, while here it is the page's title and the
 * only thing saying which session this is.
 */
function formatWhen(at: number): string {
  const then = new Date(at)
  const now = new Date()

  const midnight = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const daysAgo = Math.round((midnight(now) - midnight(then)) / 86_400_000)

  const time = then.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

  if (daysAgo === 0) return `Today, ${time}`
  if (daysAgo === 1) return `Yesterday, ${time}`

  return then.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: then.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  })
}

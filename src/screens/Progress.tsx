import { useEffect, useState } from 'react'
import { listAllUsages, listSessions, listWords } from '../storage/db'
import {
  computeStreak,
  libraryTotals,
  raritySpread,
  recentAccuracy,
  sessionHistory,
  weeklyTrend,
  type LibraryTotals,
  type RaritySpread,
  type SessionRecord,
  type Streak,
  type WeekPoint,
} from '../domain/progress'
import { SpreadBar, type SpreadRow } from '../components/progress/SpreadBar'
import { TrendBars } from '../components/progress/TrendBars'
import { SessionList } from '../components/progress/SessionList'
import styles from './Progress.module.css'

/**
 * Progress — the library, its rarity, the streak, and practice history.
 *
 * Ordered by what each section answers. The totals lead because they answer the
 * app's own question: of the words you saved, how many have you used? Rarity is
 * second because it is the only stat that describes *what kind* of vocabulary
 * this is rather than how much of it there is. Streak, capture and use trends,
 * and session history follow.
 *
 * **Every figure here obeys the rules in `docs/progress-stats-plan.md`.** The
 * short version: counts come from the `usages` event log and never from
 * `SavedWord.status`, which is one slot and cannot say a word is both practiced
 * and used; overlapping counts are never drawn as a stacked bar; and nothing is
 * reported that the app cannot observe.
 *
 * Everything is read from IndexedDB on mount and recomputed rather than stored,
 * so a deleted word or a restored backup can never leave a stale counter
 * behind. See `domain/progress.ts` for why that trade is worth the read.
 */

/** Weeks of history in the two trends. Twelve fits at 375px and spans a season. */
const TREND_WEEKS = 12

/** Sessions listed before the list is cut. Enough to see a run, not a log. */
const SESSIONS_SHOWN = 8

interface ProgressProps {
  /**
   * Bumped by the shell after a session or a save, so the screen re-reads.
   *
   * Progress is the one screen whose every number can change while it is *not*
   * open — finishing a session on the Practice tab moves the totals, the
   * streak, and the history at once. Re-reading on the token means walking back
   * here shows what just happened rather than what was true when the tab first
   * mounted.
   */
  refreshToken?: number
}

interface Reading {
  totals: LibraryTotals
  rarity: RaritySpread
  streak: Streak
  saves: WeekPoint[]
  uses: WeekPoint[]
  sessions: SessionRecord[]
  sessionCount: number
  accuracy: number | undefined
}

export function Progress({ refreshToken = 0 }: ProgressProps) {
  const [reading, setReading] = useState<Reading | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      /*
       * All three reads are unbounded, because all three answer lifetime
       * questions: the streak's longest run can be anywhere in the history, and
       * "has this word ever been practiced" is not a date range. An earlier
       * version bounded the usage read to a year, which was fine for the week
       * and the streak but would have made a word practiced longer ago look
       * untouched.
       */
      const [words, sessions, usages] = await Promise.all([
        listWords(),
        listSessions(),
        listAllUsages(),
      ])
      if (cancelled) return

      setReading({
        totals: libraryTotals(words, usages),
        rarity: raritySpread(words),
        streak: computeStreak(sessions, usages),
        saves: weeklyTrend(
          words.map((word) => word.addedAt),
          TREND_WEEKS,
        ),
        uses: weeklyTrend(
          usages.filter((usage) => usage.kind === 'wild').map((usage) => usage.at),
          TREND_WEEKS,
        ),
        sessions: sessionHistory(sessions, SESSIONS_SHOWN),
        sessionCount: sessions.length,
        accuracy: recentAccuracy(sessions),
      })
    })()
    return () => {
      cancelled = true
    }
  }, [refreshToken])

  if (!reading) {
    return (
      <div className={styles.screen}>
        <p className={styles.state}>Reading your history…</p>
      </div>
    )
  }

  const { totals, rarity, streak, saves, uses, sessions, sessionCount, accuracy } = reading

  return (
    <div className={styles.screen}>
      {totals.saved === 0 ? (
        <p className={styles.state}>
          Nothing to show yet. Save a word in Look Up, and this screen starts
          keeping count.
        </p>
      ) : (
        <>
          {/*
            Three independent counts, each out of the library total. No bar: a
            stacked bar can only show parts of a whole, and these overlap — a
            practiced word is still saved. Drawing them as segments was what
            made "saved" read as zero.
          */}
          <section className={styles.block}>
            <dl className={styles.stats}>
              <div className={styles.stat}>
                <dt className={styles.statLabel}>Words saved</dt>
                <dd className={styles.statValue}>{totals.saved}</dd>
              </div>
              <div className={styles.stat}>
                <dt className={styles.statLabel}>Practiced</dt>
                <dd className={styles.statValue}>
                  {totals.practiced} of {totals.saved}
                </dd>
              </div>
              <div className={styles.stat}>
                <dt className={styles.statLabel}>Marked used</dt>
                <dd className={styles.statValue}>
                  {totals.used} of {totals.saved}
                </dd>
              </div>
            </dl>
          </section>

          {/*
            Rarity is a genuine parts-of-a-whole split — every scored word sits
            in exactly one band — so unlike the totals above, a proportional bar
            is honest here.
          */}
          {rarity.scored > 0 && (
            <section className={styles.block}>
              <h2 className={styles.heading}>How rare your words are</h2>
              <SpreadBar rows={rarityRows(rarity)} summary={rarirySummary(rarity)} />
              {rarity.unscored > 0 && (
                <p className={styles.aside}>
                  {rarity.unscored} {rarity.unscored === 1 ? 'word has' : 'words have'} no
                  frequency measurement, so {rarity.unscored === 1 ? 'it is' : 'they are'} not
                  counted above.
                </p>
              )}
            </section>
          )}

          <section className={styles.block}>
            <h2 className={styles.heading}>Streak</h2>
            <StreakReading streak={streak} />
          </section>

          <section className={styles.block}>
            <h2 className={styles.heading}>Words saved</h2>
            <TrendBars
              points={saves}
              summary={`Words saved each week for the last ${TREND_WEEKS} weeks.`}
            />
          </section>

          {/*
            Only once something has been marked used. Twelve empty bars would be
            an accusation rather than a chart, and the totals above already say
            that nothing has been used yet.
          */}
          {totals.used > 0 && (
            <section className={styles.block}>
              <h2 className={styles.heading}>Words marked used</h2>
              <TrendBars
                points={uses}
                summary={`Words marked used each week for the last ${TREND_WEEKS} weeks.`}
              />
            </section>
          )}

          <section className={styles.block}>
            <h2 className={styles.heading}>Practice</h2>
            {sessionCount === 0 ? (
              <p className={styles.reading}>
                No finished sessions yet. A session records its score when you reach
                the end.
              </p>
            ) : (
              <>
                <dl className={styles.stats}>
                  <div className={styles.stat}>
                    <dt className={styles.statLabel}>Sessions finished</dt>
                    <dd className={styles.statValue}>{sessionCount}</dd>
                  </div>
                  {accuracy !== undefined && (
                    <div className={styles.stat}>
                      {/*
                        Session-indexed, not date-indexed: a session covers the
                        whole library, so it is long and infrequent, and a
                        seven-day accuracy figure is empty more often than not.
                      */}
                      <dt className={styles.statLabel}>
                        Drills correct, last {Math.min(sessionCount, 5)}{' '}
                        {sessionCount === 1 ? 'session' : 'sessions'}
                      </dt>
                      <dd className={styles.statValue}>{Math.round(accuracy * 100)}%</dd>
                    </div>
                  )}
                </dl>

                <h3 className={styles.subheading}>Recent sessions</h3>
                <SessionList sessions={sessions} />
                {sessionCount > sessions.length && (
                  <p className={styles.aside}>
                    Showing the last {sessions.length} of {sessionCount}.
                  </p>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

/**
 * Rarity bands as rows for the bar.
 *
 * Tone classes are owned by this screen rather than the bar component, so
 * `SpreadBar` stays about layout and knows nothing about what a rarity scale
 * means.
 */
function rarityRows(rarity: RaritySpread): SpreadRow[] {
  return rarity.bands.map((band) => ({
    key: band.band,
    label: band.label,
    hint: band.example,
    count: band.count,
    share: band.share,
    toneClass: styles[toneKey(band.band)] ?? '',
  }))
}

/** `very-rare` is not a valid identifier, so the classes are camelCased. */
function toneKey(band: string): string {
  return `tone${band
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')}`
}

/**
 * The rarity bar, described for a screen reader.
 *
 * Names the two rarest bands together, because that is the reading that matters
 * — a library weighted to the rare end is one that will take deliberate effort
 * to use.
 */
function rarirySummary(rarity: RaritySpread): string {
  const rare = rarity.bands
    .filter((band) => band.band === 'rare' || band.band === 'very-rare')
    .reduce((sum, band) => sum + band.count, 0)

  const parts = rarity.bands
    .filter((band) => band.count > 0)
    .map((band) => `${band.label}: ${band.count}`)
    .join(', ')

  return `${parts}. ${rare} of ${rarity.scored} are rare or very rare.`
}

/* -------------------------------------------------------------------------- */

/**
 * The streak as a number and its unit, and nothing else.
 *
 * "Running" came off the unit and the today/tomorrow commentary came out
 * entirely: a word that does not add information limits the thing it is
 * attached to. What survives is the count, the one note that says something a
 * reader cannot already see (today is not counted yet), and the longest run
 * when it beats the current one. At zero it says what starts a streak rather
 * than printing an accusatory nought.
 */
function StreakReading({ streak }: { streak: Streak }) {
  if (streak.current === 0) {
    return (
      <>
        <p className={styles.reading}>
          No streak going. A finished practice session or one word used starts
          one.
        </p>
        {streak.longest > 0 && (
          <p className={styles.aside}>
            Longest: {streak.longest} {streak.longest === 1 ? 'day' : 'days'}.
          </p>
        )}
      </>
    )
  }

  return (
    <>
      <p className={styles.figureLine}>
        <span className={styles.figure}>{streak.current}</span>
        <span className={styles.figureUnit}>{streak.current === 1 ? 'day' : 'days'}</span>
      </p>
      {/*
        The only note worth printing is the one that tells you something you
        cannot see: that today is not counted yet. When today *is* counted there
        is nothing to say, so nothing is said.
      */}
      {!streak.earnedToday && (
        <p className={styles.reading}>
          Today is not counted yet — practice or use a word to keep it.
        </p>
      )}
      {streak.longest > streak.current && (
        <p className={styles.aside}>Longest: {streak.longest} days.</p>
      )}
    </>
  )
}

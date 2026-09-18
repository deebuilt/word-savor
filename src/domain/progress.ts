import type { PracticeSession, SavedWord, Usage } from '../types/domain'
import { BANDS, rarityBand, type RarityBand } from './rarity'

/**
 * What the Progress screen knows, derived rather than stored.
 *
 * Every number here is computed from the three stores that already record what
 * happened — `sessions`, `usages`, and the words themselves. Nothing is kept as
 * a running counter, because a counter can only be wrong: it drifts the first
 * time a word is deleted or a session is restored from a backup, and there is
 * no way to notice that it has. Recomputing from the log is slower and always
 * true.
 *
 * **Counts come from the `usages` event log, never from `SavedWord.status`.**
 * Status holds one value per word, so it cannot say that a word is saved *and*
 * practiced *and* used — writing one erases the last. Those three facts are
 * independent and simultaneously true, so each is asked of the log separately.
 */

/* Days --------------------------------------------------------------------- */

/**
 * The local calendar day an instant falls in, as `YYYY-MM-DD`.
 *
 * Local rather than UTC, and a string rather than a number, for the same
 * reason: a streak is about the day the *reader* had. Practising at 11pm on
 * Tuesday and again at 1am on Wednesday is two days in London and one in
 * Los Angeles, and the only answer that is ever right is the one the clock on
 * their wall gave. Built from the date parts rather than `toISOString`, which
 * converts to UTC and so would file that 11pm session under Wednesday.
 */
export function dayKey(at: number): string {
  const date = new Date(at)
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** The day `offset` days before `from`, as a key. Negative walks backwards. */
function shiftedDayKey(from: number, offset: number): string {
  const date = new Date(from)
  /*
   * `setDate` past the end or start of a month rolls the month over, and it
   * handles daylight saving: adding 24 hours to a clock that springs forward
   * lands on the wrong day, where asking for "yesterday's date" never does.
   */
  date.setDate(date.getDate() + offset)
  return dayKey(date.getTime())
}

/* Streak ------------------------------------------------------------------- */

export interface Streak {
  /** Days in the run ending today, or yesterday if today is not yet earned. */
  current: number
  /** The longest run anywhere in the history. */
  longest: number
  /** Whether the current day already counts, so the UI can say what is at stake. */
  earnedToday: boolean
}

/**
 * Consecutive days of practice.
 *
 * **What earns a day:** finishing a practice session, or using a word for real.
 * Saving a word does not. The rule follows from what the app claims to be for —
 * a wild use is the strongest evidence a vocabulary is being built, so a streak
 * that honoured a drill session and ignored a real conversation would be
 * measuring the rehearsal and not the performance. Capture is excluded because
 * it costs nothing: a streak kept by pasting a word a day would be a streak
 * about opening the app.
 *
 * **Today is not required.** A run that ended yesterday is still the current
 * streak until the day is out, because the alternative is an app that tells you
 * at breakfast that you have lost something you still have all day to keep.
 * `earnedToday` is what the UI reads to tell the two apart.
 */
export function computeStreak(
  sessions: PracticeSession[],
  usages: Usage[],
  now = Date.now(),
): Streak {
  const days = new Set<string>()
  for (const session of sessions) days.add(dayKey(session.endedAt))
  for (const usage of usages) {
    if (usage.kind === 'wild') days.add(dayKey(usage.at))
  }

  if (days.size === 0) return { current: 0, longest: 0, earnedToday: false }

  const today = dayKey(now)
  const earnedToday = days.has(today)

  /*
   * Walk back a day at a time from whichever end the run can start at. Counting
   * by stepping the calendar rather than by sorting and diffing timestamps
   * keeps daylight saving and month ends out of the arithmetic entirely — every
   * comparison is between two day keys, which are just strings.
   */
  let current = 0
  const startsAt = earnedToday ? 0 : days.has(shiftedDayKey(now, -1)) ? -1 : undefined
  if (startsAt !== undefined) {
    let offset = startsAt
    while (days.has(shiftedDayKey(now, offset))) {
      current++
      offset--
    }
  }

  /*
   * Longest is found by sorting the days and counting runs. Sorted
   * lexicographically, which for zero-padded `YYYY-MM-DD` is the same as
   * chronologically — the reason the key is built that way.
   */
  const sorted = [...days].sort()
  let longest = 0
  let run = 0
  let previous: string | undefined
  for (const day of sorted) {
    const isNextDay = previous !== undefined && shiftedDayKey(dayStart(day), -1) === previous
    run = isNextDay ? run + 1 : 1
    if (run > longest) longest = run
    previous = day
  }

  return { current, longest: Math.max(longest, current), earnedToday }
}

/**
 * A day key back to an instant — noon, not midnight.
 *
 * Noon so that shifting by a day can never cross a daylight-saving boundary
 * into the previous or next date: an hour either side of midnight is exactly
 * where that arithmetic goes wrong, and noon is eleven hours clear of it.
 */
function dayStart(key: string): number {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day, 12).getTime()
}

/* The library --------------------------------------------------------------- */

export interface LibraryTotals {
  /** Every word in the library. Not a stage — the set everything else is drawn from. */
  saved: number
  /** Words that have been through a drill at least once. */
  practiced: number
  /** Words marked used at least once. */
  used: number
}

/**
 * Three independent counts, from events rather than status.
 *
 * **They overlap, and that is the point.** A practiced word is still saved; a
 * used word is still practiced. The earlier version read `SavedWord.status`,
 * which holds one value per word, so practicing a word erased "saved" and using
 * it erased "practiced" — a library of four words showed "saved 0", and
 * "practiced 2" meant *practiced and not yet used*. Both were false, and the
 * single-slot field made them unfixable: the word could not be two things at
 * once.
 *
 * `usages` is an append-only log of what happened, so each question is asked
 * against it directly and independently. Practiced is boolean per word — a
 * drill either happened or it did not — and nothing that happens later can
 * un-happen it.
 */
export function libraryTotals(words: SavedWord[], usages: Usage[]): LibraryTotals {
  const practiced = new Set<string>()
  const used = new Set<string>()
  for (const usage of usages) {
    if (usage.kind === 'practice') practiced.add(usage.wordId)
    else used.add(usage.wordId)
  }

  /*
   * Counted against words still in the library, so a deleted word's leftover
   * log rows cannot push a count above the total. `deleteWord` removes usages
   * with the word, but a restored backup or an interrupted delete can leave
   * them, and "5 of 4 practiced" is the kind of number that destroys trust in
   * every other number on the page.
   */
  const ids = new Set(words.map((word) => word.id))

  /*
   * A word marked used counts as practiced too. The drill it was answered in
   * logs its own `practice` row, so this only matters for a word whose use was
   * recorded without a drill ever being answered — but "used but never
   * practiced" is a contradiction, not a state worth reporting.
   */
  for (const id of used) {
    if (ids.has(id)) practiced.add(id)
  }

  return {
    saved: words.length,
    practiced: [...practiced].filter((id) => ids.has(id)).length,
    used: [...used].filter((id) => ids.has(id)).length,
  }
}

/* Rarity -------------------------------------------------------------------- */

export interface RaritySpread {
  bands: Array<{
    band: RarityBand
    label: string
    /** A real word in this band, so the label means something. */
    example: string
    count: number
    share: number
  }>
  /** Words Datamuse never scored. Reported separately, never as a band. */
  unscored: number
  /** Words that do have a frequency — the denominator for `share`. */
  scored: number
}

/**
 * How the library spreads across the five rarity bands.
 *
 * The one stat that describes *what kind* of vocabulary is being built rather
 * than how much of it there is. A library weighted to the rare end is one that
 * will take deliberate effort to actually use, which is worth knowing about a
 * collection as a whole.
 *
 * **Unscored words are counted separately, never folded into "very rare."**
 * `rarityLabel` already refuses to invent a band for an unmeasured word, and
 * quietly treating "Datamuse had no frequency" as "extremely rare" would
 * overstate the collection in exactly the direction its owner wants to believe.
 *
 * Shares are out of the *scored* words, so the percentages describe the words
 * the measurement actually applies to.
 *
 * This is a genuine parts-of-a-whole split — every scored word sits in exactly
 * one band — so unlike the library totals, a proportional bar is honest here.
 */
export function raritySpread(words: SavedWord[]): RaritySpread {
  const counts = new Map<RarityBand, number>()
  let unscored = 0

  for (const word of words) {
    if (word.rarity === undefined || !Number.isFinite(word.rarity)) {
      unscored++
      continue
    }
    const band = rarityBand(word.rarity)
    counts.set(band, (counts.get(band) ?? 0) + 1)
  }

  const scored = words.length - unscored

  return {
    bands: BANDS.map((band) => ({
      band: band.id,
      label: band.label,
      example: band.example,
      count: counts.get(band.id) ?? 0,
      share: scored === 0 ? 0 : (counts.get(band.id) ?? 0) / scored,
    })),
    unscored,
    scored,
  }
}

/* Trends over weeks --------------------------------------------------------- */

export interface WeekPoint {
  /** The day key of the week's first day — a stable identity for the bar. */
  startKey: string
  /** How many days ago this week began, for the axis label. 0 is this week. */
  weeksAgo: number
  count: number
}

/**
 * Bucket dated events into the last `weeks` rolling weeks, oldest first.
 *
 * Rolling seven-day blocks counted back from today rather than calendar weeks:
 * a calendar week resets on a Monday morning, which makes the most recent bar
 * meaningless for six of every seven days.
 *
 * Returns every bucket including the empty ones, because a gap in a trend is
 * information — omitting the quiet weeks would redraw a stop-start history as
 * a steady one.
 */
export function weeklyTrend(
  timestamps: number[],
  weeks: number,
  now = Date.now(),
): WeekPoint[] {
  const points: WeekPoint[] = []

  for (let weeksAgo = weeks - 1; weeksAgo >= 0; weeksAgo--) {
    const end = new Date(now)
    end.setDate(end.getDate() - weeksAgo * 7)
    end.setHours(23, 59, 59, 999)

    const start = new Date(end)
    start.setDate(start.getDate() - 6)
    start.setHours(0, 0, 0, 0)

    const from = start.getTime()
    const to = end.getTime()

    points.push({
      startKey: dayKey(from),
      weeksAgo,
      count: timestamps.filter((at) => at >= from && at <= to).length,
    })
  }

  return points
}

/* Sessions ------------------------------------------------------------------ */

export interface SessionRecord {
  id: string
  endedAt: number
  correct: number
  total: number
  /** Correct over answered, or `undefined` when nothing was answered. */
  accuracy: number | undefined
  /** How many words the session covered. */
  words: number
}

/**
 * Past sessions, newest first, with accuracy worked out.
 *
 * Accuracy is `undefined` rather than 0 for a session that recorded no answers,
 * for the same reason it is elsewhere: zero is a score, and a session walked
 * away from immediately has not earned one.
 */
export function sessionHistory(sessions: PracticeSession[], limit?: number): SessionRecord[] {
  const ordered = [...sessions].sort((a, b) => b.endedAt - a.endedAt)
  const chosen = limit === undefined ? ordered : ordered.slice(0, limit)

  return chosen.map((session) => ({
    id: session.id,
    endedAt: session.endedAt,
    correct: session.correct,
    total: session.total,
    accuracy: session.total === 0 ? undefined : session.correct / session.total,
    words: session.wordIds.length,
  }))
}

/**
 * Accuracy across the most recent sessions, as a share.
 *
 * Session-indexed rather than date-indexed on purpose. A session covers every
 * word in the library, so it is long and infrequent — a "last seven days"
 * accuracy figure is empty more often than not, while "the last five sessions,
 * whenever they happened" always says something.
 *
 * Sessions with nothing answered are skipped rather than counted as zero.
 */
export function recentAccuracy(sessions: PracticeSession[], count = 5): number | undefined {
  const recent = [...sessions]
    .sort((a, b) => b.endedAt - a.endedAt)
    .slice(0, count)
    .filter((session) => session.total > 0)

  if (recent.length === 0) return undefined

  const answered = recent.reduce((sum, session) => sum + session.total, 0)
  const correct = recent.reduce((sum, session) => sum + session.correct, 0)
  return answered === 0 ? undefined : correct / answered
}

/* The week ----------------------------------------------------------------- */

export interface WeekSummary {
  /**
   * How many distinct words were marked used.
   *
   * Distinct words rather than a tap count. The raw count of check-in taps
   * cannot be honestly reported as uses: six taps across two words is one word
   * marked repeatedly over several sessions, which records returning to
   * practice and not saying the word six times.
   */
  wordsUsed: number
  sessions: number
  /** Drills answered correctly over drills answered, or `undefined` if none. */
  accuracy: number | undefined
}

/** Rolling seven days including today, as an instant to read from. */
export function weekStart(now = Date.now()): number {
  const date = new Date(now)
  date.setDate(date.getDate() - 6)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/**
 * The last seven days, summarised.
 *
 * A rolling window rather than a calendar week: "this week" resetting to zero
 * every Monday morning makes the number a scoreboard, and a reader who
 * practised four days running should not open the app on Monday to be told they
 * have done nothing.
 *
 * Accuracy is `undefined` rather than 0 when nothing was answered. Zero is a
 * score, and a week with no sessions has not earned one — showing "0%" for
 * "hasn't practised" reads as failure where the truth is absence.
 */
export function summariseWeek(
  sessions: PracticeSession[],
  usages: Usage[],
  now = Date.now(),
): WeekSummary {
  const since = weekStart(now)
  const recentSessions = sessions.filter((session) => session.endedAt >= since)
  const wild = usages.filter((usage) => usage.kind === 'wild' && usage.at >= since)

  const answered = recentSessions.reduce((sum, session) => sum + session.total, 0)
  const correct = recentSessions.reduce((sum, session) => sum + session.correct, 0)

  return {
    wordsUsed: new Set(wild.map((usage) => usage.wordId)).size,
    sessions: recentSessions.length,
    accuracy: answered === 0 ? undefined : correct / answered,
  }
}

import type { SavedWord } from '../types/domain'
import { rarityBand, BANDS, type RarityBand } from './rarity'

/**
 * Ordering and filtering the library.
 *
 * The Library screen's job is **finding a word**, so a stat earns its place
 * here by ordering the list rather than by decorating it. A "marked used 4
 * times" caption on all two hundred rows is noise every time you are looking
 * for something else; "sort by longest unused" is the same data doing work.
 *
 * Every figure below follows the honesty rules in `docs/progress-stats-plan.md`.
 * In particular `usageCount` counts **check-in taps**, never observed uses, so
 * anything built on it says *marked* used — the app has no way to watch someone
 * say a word out loud, and a label implying it does is inventing evidence.
 */

export type LibrarySort =
  | 'alphabetical'
  | 'recent'
  | 'least-used'
  | 'longest-unused'
  | 'rarest'

export interface SortOption {
  id: LibrarySort
  label: string
  /** What the secondary line under each word should say in this order. */
  caption: 'none' | 'added' | 'marked-used' | 'last-used' | 'rarity'
}

/**
 * The orders on offer, and what each one makes worth showing.
 *
 * **Each sort carries its own caption.** Sorting by longest unused and then
 * showing the date a word was added leaves the reader to take the order on
 * trust — the row cannot be checked against the reason it is there. So the
 * secondary line changes with the sort and always shows the value being sorted
 * on. Under the default alphabetical order it shows nothing, because there is
 * no figure to justify: the order is the word itself.
 */
export const SORT_OPTIONS: readonly SortOption[] = [
  { id: 'alphabetical', label: 'A–Z', caption: 'none' },
  { id: 'recent', label: 'Recently added', caption: 'added' },
  { id: 'least-used', label: 'Least used', caption: 'marked-used' },
  { id: 'longest-unused', label: 'Longest unused', caption: 'last-used' },
  { id: 'rarest', label: 'Rarest', caption: 'rarity' },
]

/**
 * "Going cold": saved a while ago and never once marked used.
 *
 * Fourteen days because that is roughly the point at which a word saved in
 * passing has stopped being in mind on its own. Shorter would flag words still
 * being worked on; much longer and the filter only ever names things already
 * forgotten, which is a report rather than a prompt.
 *
 * Deliberately **not** keyed to `lastUsedAt` — a word used once six months ago
 * and never since is a different problem, and it already has its own sort.
 * This one is about words that never got started.
 */
export const COLD_AFTER_DAYS = 14

export type LibraryFilter = 'all' | 'unpracticed' | 'unused' | 'cold' | 'favorites'

export interface FilterOption {
  id: LibraryFilter
  label: string
}

export const FILTER_OPTIONS: readonly FilterOption[] = [
  { id: 'all', label: 'All' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'unpracticed', label: 'Not practiced' },
  { id: 'unused', label: 'Not used' },
  { id: 'cold', label: 'Going cold' },
]

/**
 * Whether a word has been through a drill.
 *
 * Mirrors `StatusMark`, and for the same reason it reads counters rather than
 * status: `usageCount` moves in the same transaction that logs each event, so
 * it cannot disagree with what Progress counts, while `status` is one slot that
 * practicing and using overwrite in turn.
 */
export function isPracticed(word: SavedWord): boolean {
  return word.usageCount > 0 || word.status === 'rehearsed' || isUsed(word)
}

/** Whether the reader has reported using this word. `owned` means the same thing. */
export function isUsed(word: SavedWord): boolean {
  return word.status === 'used' || word.status === 'owned'
}

/** Saved at least `COLD_AFTER_DAYS` ago and never marked used. */
export function isGoingCold(word: SavedWord, now = Date.now()): boolean {
  if (isUsed(word)) return false
  const age = now - word.addedAt
  return age >= COLD_AFTER_DAYS * 24 * 60 * 60 * 1000
}

export function matchesFilter(
  word: SavedWord,
  filter: LibraryFilter,
  now = Date.now(),
): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'favorites':
      return word.favorite
    case 'unpracticed':
      return !isPracticed(word)
    case 'unused':
      return !isUsed(word)
    case 'cold':
      return isGoingCold(word, now)
  }
}

/**
 * Text search across a word and its definitions.
 *
 * Definitions are searched as well as the word itself, because half of finding
 * a word you half-remember is remembering what it meant rather than how it was
 * spelled.
 */
export function matchesQuery(word: SavedWord, query: string): boolean {
  const term = query.trim().toLowerCase()
  if (!term) return true
  return (
    word.word.toLowerCase().includes(term) ||
    word.senses.some((sense) => sense.definition.toLowerCase().includes(term))
  )
}

/**
 * Sort a copy of the list.
 *
 * **Every order falls back to alphabetical on a tie**, so the list is fully
 * determined rather than leaving equal rows in whatever order they arrived in.
 * Without it, a library where nothing has been used yet would reshuffle under
 * "least used" on every read — the same words, a different order each time,
 * for no reason the reader can see.
 *
 * `localeCompare` rather than `<` throughout, so "élan" sorts with the Es
 * instead of after Z by code point.
 */
export function sortWords(words: SavedWord[], sort: LibrarySort): SavedWord[] {
  const byName = (a: SavedWord, b: SavedWord) =>
    a.word.localeCompare(b.word, 'en', { sensitivity: 'base' })

  const sorted = [...words]

  switch (sort) {
    case 'alphabetical':
      return sorted.sort(byName)

    case 'recent':
      return sorted.sort((a, b) => b.addedAt - a.addedAt || byName(a, b))

    case 'least-used':
      return sorted.sort((a, b) => a.usageCount - b.usageCount || byName(a, b))

    case 'longest-unused':
      /*
       * Never-used words lead, because "longest unused" is asking which words
       * have gone furthest without being said — and a word never used at all
       * has gone the whole way. Sorting them to the end as though `undefined`
       * were recent would bury exactly what the order is for. Among the never
       * used, the oldest save is the most overdue.
       */
      return sorted.sort((a, b) => {
        const aLast = a.lastUsedAt
        const bLast = b.lastUsedAt
        if (aLast === undefined && bLast === undefined) {
          return a.addedAt - b.addedAt || byName(a, b)
        }
        if (aLast === undefined) return -1
        if (bLast === undefined) return 1
        return aLast - bLast || byName(a, b)
      })

    case 'rarest':
      /*
       * Unscored words sort last rather than first. Datamuse not having a
       * frequency is not evidence of rarity, and letting an unmeasured word
       * head a list titled "rarest" is the same overstatement the Progress
       * page refuses when it keeps unscored words out of the bands.
       */
      return sorted.sort((a, b) => {
        const aRarity = scoredRarity(a)
        const bRarity = scoredRarity(b)
        if (aRarity === undefined && bRarity === undefined) return byName(a, b)
        if (aRarity === undefined) return 1
        if (bRarity === undefined) return -1
        return aRarity - bRarity || byName(a, b)
      })
  }
}

/** A word's frequency, or `undefined` when Datamuse never scored it. */
function scoredRarity(word: SavedWord): number | undefined {
  return word.rarity !== undefined && Number.isFinite(word.rarity) ? word.rarity : undefined
}

/**
 * The library's typical rarity, as one line.
 *
 * The **median** band rather than the mean of the frequencies. Frequency is
 * wildly skewed — "the" is 407 per million and "sesquipedalian" is 0.0085, so
 * one everyday word dragged into a library of rare ones moves a mean across
 * two bands and describes neither. The median names the band the middle word
 * sits in, which is what "what kind of collection is this" actually asks.
 *
 * `undefined` when nothing is scored, so the caller omits the line rather than
 * printing a band the library has not earned.
 */
export function medianRarityBand(words: SavedWord[]): RarityBand | undefined {
  const scored = words
    .map(scoredRarity)
    .filter((rarity): rarity is number => rarity !== undefined)
    .sort((a, b) => a - b)

  if (scored.length === 0) return undefined

  /*
   * The lower of the two middle values on an even count, rather than their
   * average. Averaging two frequencies either side of a band boundary can
   * produce a number in a band neither word is in, which is precisely the
   * invention the median was chosen to avoid.
   */
  const middle = scored[Math.floor((scored.length - 1) / 2)]
  return rarityBand(middle)
}

/** A band's display label. */
export function bandLabel(band: RarityBand): string {
  return BANDS.find((entry) => entry.id === band)?.label ?? ''
}

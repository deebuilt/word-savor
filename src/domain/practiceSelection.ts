import type { PracticeSelection, SavedWord } from '../types/domain'
import { isDue } from './scheduler'
import { buildDrillsForWord } from './puzzles'
import { isGoingCold, isPracticed, isUsed, sortWords } from './library'

/**
 * The ways to practice, as data.
 *
 * The Practice landing page is a menu of these, and most of them are a question
 * the Library screen already answers — "not practiced", "not used" and "going
 * cold" all come out of `domain/library.ts`, which was built in the stats
 * session specifically so this page would not have to reimplement them. A card
 * here is a label, a description, and a way of picking words out of the
 * library; nothing about how it is drawn lives in this file.
 *
 * **A card must be describable in one plain line, or it does not belong here.**
 * Two were removed on 2026-09-18 for failing exactly that — "10 most overdue"
 * and "Longest unused". Both ordered on a date the app cannot state truthfully:
 * `lastUsedAt` is when the check-in button was last tapped rather than when the
 * word was last used, and `fsrs.due` is a recall forecast the app has never
 * explained on any screen. Several attempts at wording them all failed the same
 * way, by giving words agency ("the schedule has been waiting", "words waiting
 * to come back") to paper over an order that could not be named. If a card
 * needs that, the card is the problem. See `PracticeSelection` in
 * `types/domain.ts` for why the two strings survive.
 *
 * **No card restricts what may be practiced.** `hand-picked` reaches the whole
 * library, every word of it, whatever any ordering thinks. An app that refuses
 * to practice a word its owner asked for has mistaken its bookkeeping for the
 * goal. See rule 7 in `docs/progress-stats-plan.md`.
 *
 * **Why a card can be empty and still be shown.** A selection that matches
 * nothing is not hidden; it is drawn with its count and cannot be tapped. A
 * menu whose items appear and disappear as a library changes cannot be learned
 * or described — the same argument that ungated the Library controls. "Nothing
 * is going cold" is also a genuinely good thing to be told.
 */

export interface PracticeCardDefinition {
  id: PracticeSelection
  label: string
  /** One line under the label, saying what the card selects. */
  description: string
  /**
   * Pick this card's words out of the library, in the order they should be
   * practiced. Ordering is part of the selection, not decoration on top of it.
   */
  select: (words: SavedWord[], now: number) => SavedWord[]
}

/**
 * Words that can be practiced at all.
 *
 * Archived words are out of the rotation everywhere — that is what archiving
 * is. A word with no drills is out for a different reason: the drill builders
 * return nothing when a word carries no material to ask about, so putting it in
 * a session would show a card with no question on it.
 */
export function isPracticable(word: SavedWord, pool: SavedWord[]): boolean {
  return !word.archived && buildDrillsForWord(word, pool).length > 0
}

/**
 * The cards, in the order they appear.
 *
 * Ordered by how specific the answer is, not alphabetically or by how many
 * words each holds. `due` is the general offer, for a reader with no particular
 * intent; the middle three each name a gap in the library; hand-picked is last
 * because it is the one that asks the reader to do work.
 *
 * `hand-picked` has no real selection of its own — it opens the word list
 * instead of starting a session, so what it selects is whatever is ticked. It
 * is in this list rather than special-cased at the call site so the menu is one
 * array and the page draws every row the same way.
 */
export const PRACTICE_CARDS: readonly PracticeCardDefinition[] = [
  {
    id: 'due',
    label: 'Everything due',
    description: 'Every word ready to practice.',
    select: (words, now) => byDueDate(words).filter((word) => isDue(word.fsrs, now)),
  },
  {
    id: 'unpracticed',
    label: 'Never practiced',
    description: 'Saved, and not yet drilled.',
    select: (words) => sortWords(words.filter((word) => !isPracticed(word)), 'recent'),
  },
  {
    id: 'unused',
    label: 'Never used',
    description: 'Words never marked as used.',
    select: (words) => sortWords(words.filter((word) => !isUsed(word)), 'longest-unused'),
  },
  {
    id: 'cold',
    label: 'Going cold',
    description: 'Saved a fortnight ago or more, and never marked used.',
    select: (words, now) => sortWords(words.filter((word) => isGoingCold(word, now)), 'recent'),
  },
  {
    id: 'hand-picked',
    label: 'Choose your own',
    description: 'Your selected words for practice.',
    select: (words) => sortWords(words, 'alphabetical'),
  },
]

export function practiceCard(id: PracticeSelection): PracticeCardDefinition | undefined {
  return PRACTICE_CARDS.find((card) => card.id === id)
}

/**
 * By due date, earliest first.
 *
 * Only an ordering, and only for `due`, which filters to words whose date has
 * passed — so this decides the sequence within that set and never which words
 * are in it. The card that took a fixed count off the top of this order is
 * gone; see the note at the head of this file.
 */
function byDueDate(words: SavedWord[]): SavedWord[] {
  return [...words].sort(
    (a, b) => a.fsrs.due - b.fsrs.due || a.word.localeCompare(b.word, 'en', { sensitivity: 'base' }),
  )
}

/**
 * How many questions a selection comes to.
 *
 * Arithmetic, not an estimate: `buildDrillsForWord` returns the exact list, so
 * the number shown before starting is the number that will be asked. This is
 * the single most valuable thing on the landing page — it is the answer to "how
 * long is this going to be", which is the question that kept sessions from
 * being finished.
 *
 * The usage check-in is deliberately **not** counted. It is one tap per word
 * that follows the last drill, and calling it a question would inflate every
 * estimate by a quarter with something that has no right answer.
 */
export function countQuestions(words: SavedWord[], pool: SavedWord[]): number {
  return words.reduce((total, word) => total + buildDrillsForWord(word, pool).length, 0)
}

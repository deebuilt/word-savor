import type { SavedWord } from '../types/domain'
import { favoriteSense } from './senses'
import { sortWords } from './library'

/**
 * What goes in a flashcard deck, and in what order.
 *
 * Kept out of the screen for the same reason `practiceSelection.ts` is kept out
 * of the practice menu: the Practice page shows a count for this deck before
 * anything is tapped, and the deck screen builds the deck itself. Those two
 * numbers must be the same number. One function, called twice, cannot disagree
 * with itself — two filters written a week apart can, and the failure is a card
 * promising 47 words that opens on 45.
 *
 * **Nothing here touches scheduling, scoring, or the practice log.** A deck is
 * a way of looking through words that already exist; building one changes
 * nothing about them. That is the whole distinction between this and the menu
 * above it on the Practice page — see `docs/flashcards-plan.md`.
 */

/** Which words the deck is drawn from. */
export type DeckScope = 'all' | 'favorites'

/**
 * Which face a card opens on.
 *
 * **`meaning` overlaps a drill, and that is worth stating plainly.**
 * `buildDefinitionMatch` in `domain/puzzles.ts` already asks "which word means
 * this?" — definition shown, word withheld. Meaning-first flashcards are that
 * same question without the four options and without a verdict.
 *
 * It is still a different act. The drill tests and records; this one shows you
 * the answer the moment you ask for it and writes nothing down. That is the
 * same relationship Audio practice has to saying a word out loud. But it does
 * mean this toggle is not merely a preference — one of its two positions is a
 * calm version of something the app already does sharply.
 */
export type DeckDirection = 'word' | 'meaning'

/** One card: a word, and the meaning its owner starred. */
export interface Flashcard {
  word: SavedWord
  /** The starred sense's part of speech, shown above the definition. */
  partOfSpeech: string
  /** The starred definition — never `senses[0]` unless nothing is starred. */
  definition: string
}

/**
 * Can this word be a card at all?
 *
 * Two exclusions, both for the same reason Audio practice excludes words with
 * no recording: a card that does nothing when it is turned over is worse than a
 * card that was never dealt, because the reader flips it twice and then doubts
 * the feature rather than the data.
 *
 * - **Archived words are out**, as they are everywhere else. That is what
 *   archiving means, and a deck is not the place to make an exception to it.
 * - **A word with no senses has no back.** The dictionary occasionally saves a
 *   word whose entry carried no definition text; `favoriteSense` returns
 *   `undefined` for it, and there is nothing to show.
 *
 * Note what is *not* an exclusion: a word with nothing starred is perfectly
 * eligible. `favoriteSense` falls back to the first sense, which is exactly how
 * every other surface in the app reads an unstarred word.
 */
export function isCardable(word: SavedWord): boolean {
  return !word.archived && favoriteSense(word) !== undefined
}

/**
 * Turn a word into its card.
 *
 * Returns `undefined` for a word with no sense rather than inventing an empty
 * back, so the caller's filter and this conversion can never fall out of step —
 * the only way to get a card is to have a definition to put on it.
 */
export function toFlashcard(word: SavedWord): Flashcard | undefined {
  const sense = favoriteSense(word)
  if (!sense) return undefined
  return { word, partOfSpeech: sense.partOfSpeech, definition: sense.definition }
}

/**
 * The words a scope covers, before they become cards.
 *
 * `favorites` reads `word.favorite` — the star on the word itself, the one the
 * Library's Favorites filter reads. Not `favoriteSenseRef`, which is the
 * *definition* star and answers a different question: starring a definition
 * says "this is the meaning I want", not "this is a word I want to come back
 * to". Two stars, two jobs, and conflating them here would make the deck's
 * Favorites filter disagree with the Library's.
 */
export function scopeWords(words: SavedWord[], scope: DeckScope): SavedWord[] {
  const cardable = words.filter(isCardable)
  return scope === 'favorites' ? cardable.filter((word) => word.favorite) : cardable
}

/** Fixed alphabetical, or shuffled. */
export type DeckOrder = 'sorted' | 'shuffled'

/**
 * Build the deck.
 *
 * **Both orders are offered, because the trade is real in both directions.**
 *
 * A stable alphabetical order is what lets a reader get their bearings: paging
 * the same set twice lands on the same cards in the same places, so you can
 * recognise where you are and notice which words you keep stalling on. That is
 * genuinely useful, and it is the order Audio practice uses.
 *
 * But it costs something, and an earlier version of this comment denied it. It
 * claimed a shuffle is only what a *test* does — to stop the order becoming the
 * answer — and that an unscored screen has no answer to protect. That is wrong.
 * Position becomes the answer here too: page a fixed deck a few times and you
 * begin recalling *the next card* rather than the word, which is positional
 * memory doing the work the word was supposed to do. No score has to be
 * involved for that to be the wrong thing to practise.
 *
 * So neither order is correct in general, and the reader picks.
 *
 * **The shuffle is passed in, not made here.** `buildDeck` runs inside a
 * `useMemo` that re-runs whenever the library changes, so generating a random
 * order in this function would deal a new deck every time any word was edited —
 * and the reader would be teleported to a different card mid-page. The screen
 * holds the shuffled id order in state and hands it over; this function only
 * applies it. See `shuffleIds`.
 */
export function buildDeck(
  words: SavedWord[],
  scope: DeckScope,
  order: DeckOrder = 'sorted',
  /** Word ids in shuffled order. Only read when `order` is `shuffled`. */
  shuffled?: readonly string[],
): Flashcard[] {
  const scoped = scopeWords(words, scope)

  const ordered =
    order === 'shuffled' && shuffled
      ? applyOrder(scoped, shuffled)
      : sortWords(scoped, 'alphabetical')

  return ordered.map(toFlashcard).filter((card): card is Flashcard => card !== undefined)
}

/**
 * Put `words` into the sequence `ids` gives, tolerantly.
 *
 * The id list is a snapshot taken when the shuffle was made, and the library
 * can move underneath it — a word archived, a word saved, a definition removed.
 * So this cannot assume the two agree:
 *
 * - An id naming a word that is no longer in scope is skipped rather than
 *   producing a hole in the deck.
 * - A word the id list has never heard of is appended rather than dropped,
 *   because silently hiding a word the reader just saved is worse than showing
 *   it at the end. It lands in alphabetical order among its fellow newcomers,
 *   so the tail is not itself arbitrary.
 */
function applyOrder(words: SavedWord[], ids: readonly string[]): SavedWord[] {
  const byId = new Map(words.map((word) => [word.id, word]))
  const placed: SavedWord[] = []

  for (const id of ids) {
    const word = byId.get(id)
    if (word) {
      placed.push(word)
      byId.delete(id)
    }
  }

  return [...placed, ...sortWords([...byId.values()], 'alphabetical')]
}

/**
 * A fresh shuffled order for these words, as ids.
 *
 * Fisher-Yates, not `sort(() => Math.random() - 0.5)`. The sort-comparator trick
 * is the one everybody reaches for and it does not produce a uniform shuffle —
 * a comparator that answers inconsistently violates what sort assumes, so the
 * result is biased in a way that depends on the engine's algorithm. Some cards
 * would sit near their original position far more often than chance, which on
 * this screen means the deck only *looks* shuffled.
 *
 * Ids rather than words, because this is stored in state across renders and a
 * list of whole `SavedWord` objects would pin stale copies of every word in the
 * deck.
 */
export function shuffleIds(words: SavedWord[]): string[] {
  const ids = words.map((word) => word.id)

  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
  }

  return ids
}

/**
 * How many words the deck would hold, for the Practice page's count.
 *
 * Deliberately the same path the deck itself takes, so the figure on the card
 * is the figure you get when you tap it.
 */
export function countDeck(words: SavedWord[], scope: DeckScope): number {
  return scopeWords(words, scope).length
}

import type { SavedWord, Sense, SenseRef } from '../types/domain'

/**
 * Which definition a word *means* — the starred one, or the dictionary's first.
 *
 * **Why this is one function and not a ternary at each call site.** Four places
 * answer this question: the definition drill in `puzzles.ts`, the library row,
 * the practice-pick row, and the star itself in `SenseList`. They have to agree.
 * A library row showing the first sense while practice drills the starred one is
 * the precise bug the star was added to fix, reintroduced one screen over — and
 * four copies of the same fallback is four chances to write it differently.
 *
 * The fallback is deliberate and it is the same everywhere: no star, or a star
 * that no longer matches any sense, reads as the first sense. That is exactly
 * how the app behaved before favourites existed, so a word nobody has touched
 * and a word whose definition text shifted under its pointer both land on
 * known-good behaviour rather than on nothing.
 */

/** Whole-word comparison of the pair that identifies a sense. */
export function isSenseRef(sense: Sense, ref: SenseRef): boolean {
  return sense.partOfSpeech === ref.partOfSpeech && sense.definition === ref.definition
}

/** The `SenseRef` that points at this sense. */
export function senseRef(sense: Sense): SenseRef {
  return { partOfSpeech: sense.partOfSpeech, definition: sense.definition }
}

/**
 * The sense the word means: starred if starred and still present, else the
 * dictionary's first. `undefined` only for a word with no senses at all.
 */
export function favoriteSense(word: SavedWord): Sense | undefined {
  const ref = word.favoriteSenseRef
  if (ref) {
    const starred = word.senses.find((sense) => isSenseRef(sense, ref))
    if (starred) return starred
  }
  return word.senses[0]
}

/** That sense's definition text, for the places that show one line. */
export function favoriteDefinition(word: SavedWord): string | undefined {
  return favoriteSense(word)?.definition
}

/**
 * The word with `sense` starred — or with the star cleared, if it was already
 * the starred one.
 *
 * Tapping the filled star un-stars, which is what a toggle means and what the
 * outline/filled pair promises. Starring a different sense moves the star,
 * because the field holds one value: there is no un-star step to forget.
 *
 * Returns a new word rather than mutating, so the caller writes it through
 * `saveWord` and gets the `updatedAt` stamp with it.
 */
export function withFavoriteSense(word: SavedWord, sense: Sense): SavedWord {
  const isStarred = word.favoriteSenseRef !== undefined && isSenseRef(sense, word.favoriteSenseRef)
  return { ...word, favoriteSenseRef: isStarred ? undefined : senseRef(sense) }
}

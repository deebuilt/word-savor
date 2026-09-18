import type { SavedWord } from '../../types/domain'
import { rarityLabel } from '../../domain/rarity'
import type { SortOption } from '../../domain/library'
import styles from './WordMeta.module.css'

/**
 * The one figure a library row shows, chosen by how the list is sorted.
 *
 * **A row shows the value it was ordered on, and nothing else.** Sorting by
 * longest unused and then printing the date a word was added asks the reader to
 * take the order on trust — the row cannot be checked against the reason it is
 * sitting there. Showing every figure at once is the opposite failure: a count,
 * a date and a band on all two hundred rows is noise on every read where the
 * reader is just looking for a word.
 *
 * So there is no meta line at all under the default alphabetical order. The
 * order is the word itself, and there is nothing to justify.
 *
 * Every label here says what was actually measured. `usageCount` counts
 * check-in taps, so it reads **marked used** — the app cannot observe someone
 * saying a word, and a label implying it can is inventing evidence.
 */

interface WordMetaProps {
  word: SavedWord
  caption: SortOption['caption']
}

export function WordMeta({ word, caption }: WordMetaProps) {
  const text = describe(word, caption)
  if (!text) return null
  return <span className={styles.meta}>{text}</span>
}

function describe(word: SavedWord, caption: SortOption['caption']): string | undefined {
  switch (caption) {
    case 'none':
      return undefined

    case 'added':
      return `Saved ${relativeDays(word.addedAt)}`

    case 'marked-used':
      /*
       * "Never marked used" rather than "0 times". Zero is a score, and a word
       * saved yesterday has not failed at anything — the same rule that keeps
       * Progress from printing 0% accuracy for a week with no sessions.
       */
      return word.usageCount === 0
        ? 'Never marked used'
        : `Marked used ${word.usageCount} ${word.usageCount === 1 ? 'time' : 'times'}`

    case 'last-used':
      return word.lastUsedAt === undefined
        ? 'Never marked used'
        : `Last marked ${relativeDays(word.lastUsedAt)}`

    case 'rarity': {
      const band = rarityLabel(word.rarity)
      // Unscored is stated, never guessed at. Datamuse having no frequency is
      // not evidence that a word is rare.
      return band ?? 'Not scored'
    }
  }
}

/**
 * A date as a phrase, in days.
 *
 * Relative rather than absolute because every one of these captions answers a
 * "how long" question — "saved 3 Sep" makes the reader do the arithmetic that
 * the sort already did for them. Past a month it switches to a real date, where
 * counting days has stopped being meaningful.
 */
function relativeDays(at: number, now = Date.now()): string {
  const days = Math.floor((now - at) / (24 * 60 * 60 * 1000))

  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`

  return `on ${new Date(at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`
}

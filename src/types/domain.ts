/**
 * The shapes WordSavor stores.
 *
 * Several fields here are not read by any screen yet. That is deliberate:
 * adding a field to a type costs nothing today, while adding one to a database
 * holding a year of saved words costs a migration and a backfill. The fields
 * marked STUB are the ones written now so they never have to be retrofitted —
 * `related` in particular, because backfilling an association graph across a
 * few hundred words means a few hundred API calls that could have been made one
 * at a time as each word was saved.
 */

/**
 * How far a word has travelled from "seen once" to "mine".
 *
 * The progression is the app's core idea: a vocabulary is not what you can
 * define, it is what you actually reach for. `used` and `owned` are therefore
 * the only two states that mean anything — everything before them is prologue.
 *
 * - `spotted`     saved, not yet read properly
 * - `understood`  the definition has landed
 * - `rehearsed`   practised, but only inside the app
 * - `used`        said or written it in the wild at least once
 * - `owned`       used it more than once, unprompted
 */
export type WordStatus = 'spotted' | 'understood' | 'rehearsed' | 'used' | 'owned'

export const WORD_STATUSES: readonly WordStatus[] = [
  'spotted',
  'understood',
  'rehearsed',
  'used',
  'owned',
]

/** How a word got into the library. Kept so capture paths can be compared. */
export type CaptureSource = 'manual' | 'share' | 'paste' | 'import'

/** One part-of-speech grouping, as dictionaries return it. */
export interface Sense {
  partOfSpeech: string
  definition: string
  /** Example sentences from the dictionary, not the user's own. */
  examples: string[]
}

export interface SavedWord {
  /** Lowercased, trimmed. Also the object store key, so a word is saved once. */
  id: string
  /** Display form, in the casing it was found in. */
  word: string
  addedAt: number
  updatedAt: number
  status: WordStatus

  /* Dictionary payload -------------------------------------------------- */

  /** IPA, when the source has it. */
  pronunciation?: string
  /** Spoken pronunciation, from dictionaryapi.dev's phonetics. */
  audioUrl?: string
  senses: Sense[]
  /** FreeDictionary's Wiktionary terms, extended with Datamuse `rel_syn`/`rel_ant`. */
  synonyms: string[]
  antonyms: string[]
  etymology?: string
  /**
   * Semantically associated words, from Datamuse `ml=` (means-like).
   *
   * Written at save time rather than on demand. This is what the constellations
   * view reads, and it is the one field that is expensive to backfill.
   */
  related: string[]
  /**
   * Frequency per million words, from Google Books Ngrams via Datamuse.
   *
   * Lower is rarer. Drives "sort by rarity" and lets the library show how
   * uncommon a collection actually is, rather than just how large.
   */
  rarity?: number

  /* The user's own material --------------------------------------------- */

  /** Why this one was worth keeping, in the user's words. */
  note?: string
  tags: string[]
  favorite: boolean

  /* Scheduling ----------------------------------------------------------- */

  /** FSRS state. `due` is duplicated into an index for the practice queue. */
  fsrs: FSRSState
  /** Denormalised from the `usages` store so the library can sort cheaply. */
  usageCount: number
  lastUsedAt?: number

  /* Stubs ---------------------------------------------------------------- */

  /** STUB — retire a word from practice without deleting its history. */
  archived: boolean
  /** STUB — user-made sets. See the `collections` store. */
  collectionIds: string[]

  source: CaptureSource
}

/**
 * FSRS scheduler state, stored per word.
 *
 * Mirrors what `ts-fsrs` needs to reschedule a card, kept as a plain
 * serialisable object rather than the library's class instance — IndexedDB
 * stores data, and a shape that survives a structured clone is the one that
 * survives an upgrade to the library too.
 */
export interface FSRSState {
  /** Epoch ms. Indexed, because the practice queue is the hottest query. */
  due: number
  stability: number
  difficulty: number
  elapsedDays: number
  scheduledDays: number
  reps: number
  lapses: number
  state: number
  lastReview?: number
}

/**
 * Where a word was met.
 *
 * Its own store rather than a field, because the same word can be met more than
 * once — a different book, a different year, a different person saying it. That
 * is a history worth keeping, not a duplicate to collapse.
 */
export interface Encounter {
  id: string
  wordId: string
  at: number
  /** The sentence it was found in. The strongest memory hook there is. */
  context?: string
  /** Book, article, podcast, person. Free text on purpose. */
  source?: string
}

/**
 * A time the word was actually used, in the wild or in practice.
 *
 * Separate from the FSRS card because recall and usage are different signals.
 * Keeping the log independent means practice can be graded on usage without
 * corrupting the scheduler's own history.
 */
export interface Usage {
  id: string
  wordId: string
  at: number
  /** What was actually said or written, when it is worth keeping. */
  sentence?: string
  /** `wild` is unprompted use; `practice` came from a prompt in the app. */
  kind: 'wild' | 'practice'
}

/**
 * A cached dictionary response.
 *
 * Kept permanently and keyed by `${source}:${word}`. A saved word never needs a
 * second network call, which is also what makes the library fully readable
 * offline. Stored raw so a later parser change can re-derive fields without
 * re-fetching.
 */
export interface CachedLookup {
  key: string
  source: 'freedictionary' | 'dictionaryapi' | 'datamuse'
  word: string
  fetchedAt: number
  payload: unknown
}

/** STUB — user-made word sets. */
export interface Collection {
  id: string
  name: string
  createdAt: number
  note?: string
}

/** STUB — a completed practice or puzzle run, for streaks and history. */
export interface PracticeSession {
  id: string
  startedAt: number
  endedAt: number
  /** `recall` today; puzzle modes join this union as they are built. */
  mode: 'recall' | 'usage'
  wordIds: string[]
  correct: number
  total: number
}

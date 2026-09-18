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
 * A word's furthest recorded state. **Not a progression, and not what any
 * screen counts.**
 *
 * This was written as a five-step ramp from "seen once" to "mine", and that
 * model does not survive contact with the questions the app actually asks. Two
 * problems, both structural:
 *
 * 1. **It is one slot.** A word can be saved *and* practiced *and* used — all
 *    three simultaneously true, none cancelling the others. A single value
 *    cannot hold that, so writing `rehearsed` erased the fact that the word was
 *    saved, and writing `used` erased that it was practiced. Counting words by
 *    status therefore reported a four-word library as "saved 0, practiced 2",
 *    both of which were false.
 * 2. **Two of the five were never observable.** Nothing in the app could set
 *    `understood` — there is no screen where a reader says they understand a
 *    word. And `owned` only ever meant the check-in button had been tapped a
 *    second time, which records *returning to practice*, not using a word
 *    twice.
 *
 * **So counts come from the `usages` log instead** — an append-only record of
 * events, where each question ("ever practiced?", "ever used?") is asked
 * independently and can be true at once. See `libraryTotals` in
 * `domain/progress.ts`.
 *
 * What this field is still good for: `used` is the one value a reader genuinely
 * reports, so it remains the answer to "has this word been used" for a single
 * word. The other four are legacy. They stay in the type because words already
 * in the library are sitting on them, and dropping a stored value costs a
 * migration for no gain.
 */
export type WordStatus = 'spotted' | 'understood' | 'rehearsed' | 'used' | 'owned'

/** How a word got into the library. Kept so capture paths can be compared. */
export type CaptureSource = 'manual' | 'share' | 'paste' | 'import'

/** One part-of-speech grouping, as dictionaries return it. */
export interface Sense {
  partOfSpeech: string
  definition: string
  /** Example sentences from the dictionary, not the user's own. */
  examples: string[]
}

/**
 * Synonyms and antonyms for one part of speech.
 *
 * The thesaurus groups its terms by entry (part of speech) and by sense within
 * each entry; storing them flat loses that, and a lost grouping is a drill that
 * can show a *verb* definition and accept an *adjective* synonym. Grouped at
 * the part-of-speech level rather than per sense on purpose: the dictionary and
 * the thesaurus are separate responses whose sense numbering does not line up,
 * but whose parts of speech do. Aligning on what genuinely matches beats
 * guessing at what doesn't.
 */
export interface PartOfSpeechTerms {
  /** Matched against `Sense.partOfSpeech`, so the labels must come from the same vocabulary. */
  partOfSpeech: string
  synonyms: string[]
  antonyms: string[]
}

export interface SavedWord {
  /** Lowercased, trimmed. Also the object store key, so a word is saved once. */
  id: string
  /** Display form, in the casing it was found in. */
  word: string
  addedAt: number
  updatedAt: number
  /**
   * The word's furthest recorded state. Read `WordStatus` before using this —
   * it is a single slot and cannot say a word is both practiced and used, so
   * **counts belong to the `usages` log, not to this field.**
   */
  status: WordStatus

  /* Dictionary payload -------------------------------------------------- */

  /** Pronunciation respelling, when the source has it. */
  pronunciation?: string
  /** Spoken pronunciation, from Merriam-Webster's audio. */
  audioUrl?: string
  senses: Sense[]
  /** Merriam-Webster thesaurus terms, extended with Datamuse `rel_syn`/`rel_ant`. */
  synonyms: string[]
  antonyms: string[]
  /**
   * The Merriam-Webster terms again, grouped by part of speech.
   *
   * Additive on purpose — `synonyms` above stays the flat list every screen
   * already reads, and this sits beside it for the one consumer that needs to
   * know which sense a synonym belongs to (synonym-match, which otherwise pairs
   * a verb definition with an adjective synonym).
   *
   * Optional because words saved before the grouping existed do not have it.
   * `undefined` means "never parsed" and an empty array means "parsed, nothing
   * there" — a distinction the migration depends on to know what it still owes.
   */
  synonymsByPartOfSpeech?: PartOfSpeechTerms[]
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
 * One recorded event for a word: a drill answered, or a use reported.
 *
 * **This log, not `WordStatus`, is what every count is derived from.** It is
 * append-only, so each question can be asked of it independently — "has this
 * word ever been practiced" and "has it ever been used" are both answerable at
 * once, which a single status field cannot express. See `libraryTotals` in
 * `domain/progress.ts`.
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
  /**
   * `practice` is a drill answered correctly inside the app. `wild` is the
   * reader reporting, on the check-in, that they said or wrote the word for
   * real.
   *
   * **`wild` is self-reported and the app cannot verify it.** So a count of
   * `wild` rows is a count of times the button was tapped, not of times the
   * word was spoken — which is why anything built on it must say "marked used"
   * rather than "used N times". The honest unit is *how many distinct words*
   * have been marked, not how many taps happened.
   */
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
  source: 'merriam-dictionary' | 'merriam-thesaurus' | 'datamuse'
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

/**
 * A completed practice run. One row per session, written when it ends.
 *
 * This is what streaks are counted from, so it is deliberately a record of
 * *what happened* rather than a score: `correct`/`total` are the drills the
 * reader actually answered, not the drills the queue offered. A session left
 * halfway is not written at all — an abandoned run is not a day of practice.
 */
export interface PracticeSession {
  id: string
  startedAt: number
  endedAt: number
  /**
   * `mixed` is what Practice builds today — recall drills and usage check-ins
   * in one run, so neither `recall` nor `usage` describes it honestly. The
   * narrower two are kept for the puzzle modes that will sit beside it.
   */
  mode: 'mixed' | 'recall' | 'usage'
  /** Every word the session touched, whether or not its drills were answered. */
  wordIds: string[]
  correct: number
  total: number
}

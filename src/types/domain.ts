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
 * Which sense the reader starred, as the pair that identifies it.
 *
 * **Not an index, and not a flag on the sense itself.** Both of those were the
 * obvious shapes and both are wrong here:
 *
 * - An *index* is a position, and positions are not stable. Dictionary
 *   responses are cached raw precisely so a later parser change can re-derive
 *   the senses without re-fetching (see `CachedLookup`), and a re-parse that
 *   splits or merges one sense silently re-points every index after it. The
 *   star would then sit on a different meaning than the one that was tapped,
 *   which is worse than not having starred at all — it is wrong and quiet.
 * - A *flag on `Sense`* cannot express "only one per word". Nothing in the type
 *   stops two senses carrying it, so the rule would live in every write path
 *   rather than in the shape, and the first path that forgets it produces a
 *   word with two favourites and no way to say which one practice should use.
 *   One field can only hold one value, so the pointer makes the invariant
 *   structural.
 *
 * The pair is what identifies a sense in this app already — `SenseList` keys
 * its list on exactly `partOfSpeech:definition`, because definitions are
 * deduplicated upstream and the pair is therefore unique within a word.
 *
 * If the text ever does change out from under the pointer, the lookup simply
 * misses and every reader falls back to the first sense — the same behaviour as
 * a word that was never starred. A miss that degrades to the old default is the
 * failure worth designing for; a miss that points at the wrong definition is not.
 */
export interface SenseRef {
  partOfSpeech: string
  definition: string
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
  /**
   * The one sense the reader starred, if any.
   *
   * What practice drills and what the one-line summaries show. Optional, and
   * that absence is the whole migration story: a word with nothing starred
   * behaves exactly as every word did before this field existed — first sense,
   * same as the dictionary's own order. So no word already in the library has
   * to be touched.
   *
   * Read it through `favoriteSense` in `domain/senses.ts` rather than directly.
   * The pointer can miss (see `SenseRef`), and every reader has to fall back the
   * same way or the page and the drill disagree about which definition this
   * word means.
   */
  favoriteSenseRef?: SenseRef

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
 * One kind of question a drill can ask.
 *
 * Defined here rather than in `domain/puzzles.ts`, where the drills themselves
 * are built, because `DrillResult` below stores it — and a stored shape must
 * not depend on the module that happens to construct it today. `puzzles.ts`
 * re-exports this as its own `DrillKind` so the builders keep reading naturally.
 *
 * **These strings are written to the database**, so renaming one silently
 * orphans every result already recorded under the old name. Treat them as a
 * stored vocabulary, not as internal labels.
 */
export type DrillKind =
  | 'definition-match'
  | 'fill-blank'
  | 'fragment-cloze'
  | 'synonym-match'
  | 'odd-one-out'

/**
 * One drill, answered.
 *
 * **Why the drill kind is stored and not just the word and the verdict.** A
 * word generates about four drills a session, so recording only
 * `{ wordId, correct }` produces four rows that cannot be told apart — a
 * word's record reads `true, false, true, true` with no way to know whether
 * the miss was typed recall or a multiple-choice guess. Those are different
 * facts: failing to produce a word from its definition means it is not known,
 * while picking the wrong synonym out of four means it is nearly known. A
 * per-word practice record that cannot separate them is a coin-flip log.
 *
 * Stored on the session rather than on the word, for the same reason every
 * other count is: a word holding its own tally is a running counter that drifts
 * the first time a session is restored from a backup, with no way to notice.
 * The session log is what happened, and per-word figures are derived from it.
 */
export interface DrillResult {
  wordId: string
  drill: DrillKind
  correct: boolean
}

/**
 * How a session's words were chosen.
 *
 * Stored on the session because "what was this session" is not answerable from
 * `wordIds` alone — ten overdue words and ten hand-picked words look identical
 * in the record, and they are not the same practice. The results view reads
 * this to say what the session *was* rather than only how it went.
 *
 * These strings are written to the database, so they are a stored vocabulary
 * like `DrillKind`: renaming one orphans every session recorded under the old
 * name.
 *
 * **`overdue` and `longest-unused` are retired and no longer offered.** Both
 * ordered on a date the app could not describe truthfully. `longest-unused`
 * read `lastUsedAt`, which holds the moment the check-in button was last
 * tapped — not when the word was last used, since the same occasion can be
 * reported in every session it comes up in. `overdue` read `fsrs.due`, which is
 * a *recall* forecast that the usage answers are mapped onto, so it is neither
 * a use record nor something the app ever explains. A card whose order cannot
 * be stated plainly does not belong on a menu.
 *
 * They stay in this union because sessions already recorded under them are
 * sitting on these strings, and the results view still has to name what those
 * sessions were. Retired from the menu, kept in the vocabulary.
 */
export type PracticeSelection =
  | 'overdue'
  | 'due'
  | 'unpracticed'
  | 'unused'
  | 'cold'
  | 'longest-unused'
  | 'hand-picked'

/**
 * A practice run, written from its first answer onward.
 *
 * **No longer only a finished run.** The row is created when the first drill is
 * answered and re-written after every answer, so a session walked away from
 * keeps everything that was actually done. Forty drills answered and a close at
 * forty-one used to discard all forty; now they are the record they always
 * were. `addSession` is a `put` keyed on `id`, so re-writing the same session
 * overwrites rather than accumulating rows.
 *
 * This is what streaks are counted from, and the rule follows the writes: a day
 * with any answered drill is a day practiced. Answering a drill is not free the
 * way saving a word is, so no threshold has to be explained or tuned.
 *
 * It stays a record of *what happened* rather than a score: `correct`/`total`
 * are the drills the reader actually answered, never the drills the queue
 * offered.
 */
export interface PracticeSession {
  id: string
  startedAt: number
  /**
   * When the last answer landed — **not** when the session finished.
   *
   * It meant "finished" while sessions were written once at the end, and those
   * two readings agree for a completed run. Under incremental writes they part
   * company, and "last answered" is the one that is always true: an abandoned
   * session has no finish, but it has a last answer. The streak counts the day
   * of this instant, which is what makes a partial session earn its day.
   */
  endedAt: number
  /**
   * `mixed` is what Practice builds today — recall drills and usage check-ins
   * in one run, so neither `recall` nor `usage` describes it honestly. The
   * narrower two are kept for the puzzle modes that will sit beside it.
   */
  mode: 'mixed' | 'recall' | 'usage'
  /**
   * How the words were chosen.
   *
   * Optional because sessions recorded before the landing page existed had no
   * selection to record — the queue was the whole library every time. Absent
   * means "this predates chosen sessions", which the results view reports as
   * the whole library rather than guessing at a card that did not exist.
   */
  selection?: PracticeSelection
  /** Every word the session touched, whether or not its drills were answered. */
  wordIds: string[]
  correct: number
  total: number
  /**
   * Whether the reader reached the end of the queue.
   *
   * Needed once partial sessions are stored: without it a row of six answers
   * could be a short session finished or a long session abandoned, and the
   * results view has no way to tell a reader which of those they are looking
   * at. Optional for the same reason `results` is — sessions written before
   * incremental writes were only ever filed on completion, so their absence
   * reads as finished.
   */
  completed?: boolean
  /**
   * Every drill answered in this run, in the order they were answered.
   *
   * Optional because sessions recorded before 2026-09-18 do not have it, and
   * that absence is not the same as an empty run. `undefined` means "this
   * session predates per-drill recording"; `[]` means "recorded, and nothing
   * was answered." A per-word history must not report an old session as a run
   * of zero results, so every reader has to tell the two apart.
   *
   * Not backfillable. A finished session never stored which word failed which
   * drill, and no later read can recover it — which is why this went in while
   * the history was still one day old.
   */
  results?: DrillResult[]
}

/**
 * Where an unfinished session left off, so reopening Practice can offer it back.
 *
 * **Separate from the session row, because they answer different questions.**
 * `PracticeSession` is the historical record of what was answered — it is
 * finished the moment it is written and never needs to be resumed to stay true.
 * This is the *position*: which words, in which order, and how far in. It is
 * live state, it is meaningless once the session ends, and it is deleted then.
 * Folding it into the session row would put a field on every historical record
 * that is null for all but one of them.
 *
 * Only one is ever stored — resuming two half-finished sessions is a choice
 * nobody asked for — so the store holds a single row under `CURRENT_RUN_KEY`.
 *
 * **Word ids, not the built queue.** The drills are rebuilt from the words on
 * resume rather than stored: a drill holds a whole `SavedWord` each, so storing
 * the queue means storing the same word four times over, and it goes stale the
 * moment the word is edited. Rebuilding is cheap and always current. The
 * consequence to accept is that a rebuilt queue can differ in length if a
 * word's data changed — `stepIndex` is clamped on resume rather than trusted.
 */
export interface PracticeRun {
  /** Always `CURRENT_RUN_KEY`. One run is resumable at a time. */
  key: string
  /** The session row this run is writing into, so resuming continues it rather than starting a second. */
  sessionId: string
  startedAt: number
  /** Last touched, for deciding whether a run is too stale to offer back. */
  updatedAt: number
  selection: PracticeSelection
  /** The words, in the order the session drew them — the shuffle is part of the position. */
  wordIds: string[]
  /** How far in, as a step index into the rebuilt queue. Clamped on resume. */
  stepIndex: number
}

/** The single key every in-progress run is stored under. */
export const CURRENT_RUN_KEY = 'current'

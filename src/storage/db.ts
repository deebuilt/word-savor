import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type {
  CachedLookup,
  Collection,
  Encounter,
  PracticeRun,
  PracticeSession,
  SavedWord,
  Usage,
  WordStatus,
} from '../types/domain'
import { CURRENT_RUN_KEY } from '../types/domain'

/**
 * Local persistence.
 *
 * IndexedDB rather than localStorage. localStorage caps around 5MB, only holds
 * strings, and has no way to ask a question like "which words are due today" —
 * every read would mean parsing the entire library. IndexedDB stores real
 * objects and answers that question from an index, which is the difference
 * between a library that stays fast at a thousand words and one that does not.
 *
 * Everything is local. There is no account and no server, so the database IS
 * the app's state — which is why `backup.ts` exists beside it.
 *
 * All six stores are created at version 1, including the ones nothing read yet.
 * An empty store costs nothing; adding one later means a version bump against a
 * database that already holds a year of someone's words. `sessions` is the
 * argument paying off — it was created empty at version 1 and Progress now
 * reads it, with no migration and no backfill.
 */

const DB_NAME = 'wordsavor'
/**
 * Version 2 adds `runs` — where an unfinished practice session parks its
 * position so reopening Practice can offer to continue it.
 *
 * The argument in the note above ("all six stores are created at version 1,
 * including the ones nothing read yet") is about stores that could be foreseen.
 * This one could not: it exists because sessions became resumable, which is a
 * behaviour rather than a shape. The upgrade is additive and touches nothing
 * already stored, which is the cheap kind of migration and the reason to make
 * it rather than to bend an existing store into the job.
 */
const DB_VERSION = 2

interface WordSavorDB extends DBSchema {
  words: {
    key: string
    value: SavedWord
    indexes: {
      /** The practice queue. The hottest query in the app. */
      'by-due': number
      'by-added': number
      'by-status': WordStatus
      /** Frequency per million, so the library can sort by how rare a word is. */
      'by-rarity': number
    }
  }
  encounters: {
    key: string
    value: Encounter
    indexes: { 'by-word': string }
  }
  usages: {
    key: string
    value: Usage
    indexes: { 'by-word': string; 'by-date': number }
  }
  lookups: {
    key: string
    value: CachedLookup
  }
  /** STUB — user-made word sets. */
  collections: {
    key: string
    value: Collection
  }
  /** Practice history. Progress counts streaks from this. */
  sessions: {
    key: string
    value: PracticeSession
    indexes: { 'by-date': number }
  }
  /**
   * The one in-progress session's position. At most one row, under
   * `CURRENT_RUN_KEY` — see `PracticeRun`.
   */
  runs: {
    key: string
    value: PracticeRun
  }
}

let dbPromise: Promise<IDBPDatabase<WordSavorDB>> | undefined

export function getDB(): Promise<IDBPDatabase<WordSavorDB>> {
  dbPromise ??= openDB<WordSavorDB>(DB_NAME, DB_VERSION, {
    /*
     * Each version's changes sit behind their own guard rather than running
     * unconditionally. `upgrade` fires once with the version the database is
     * coming *from*, so a fresh install arrives at `oldVersion === 0` and runs
     * every block in order, while an existing v1 database runs only the second.
     * Written as one flat list it would try to re-create the v1 stores on an
     * upgrading database and throw.
     */
    upgrade(db, oldVersion) {
      if (oldVersion < 1) createV1Stores(db)
      if (oldVersion < 2) db.createObjectStore('runs', { keyPath: 'key' })
    },
  })
  return dbPromise
}

function createV1Stores(db: IDBPDatabase<WordSavorDB>): void {
  const words = db.createObjectStore('words', { keyPath: 'id' })
  // `fsrs.due` rather than a top-level copy: idb indexes a nested path
  // fine, and one source of truth beats two that can drift.
  words.createIndex('by-due', 'fsrs.due')
  words.createIndex('by-added', 'addedAt')
  words.createIndex('by-status', 'status')
  words.createIndex('by-rarity', 'rarity')

  const encounters = db.createObjectStore('encounters', { keyPath: 'id' })
  encounters.createIndex('by-word', 'wordId')

  const usages = db.createObjectStore('usages', { keyPath: 'id' })
  usages.createIndex('by-word', 'wordId')
  usages.createIndex('by-date', 'at')

  db.createObjectStore('lookups', { keyPath: 'key' })
  db.createObjectStore('collections', { keyPath: 'id' })

  const sessions = db.createObjectStore('sessions', { keyPath: 'id' })
  sessions.createIndex('by-date', 'startedAt')
}

/* Words -------------------------------------------------------------------- */

/** Every saved word, newest first. */
export async function listWords(): Promise<SavedWord[]> {
  const db = await getDB()
  const words = await db.getAllFromIndex('words', 'by-added')
  return words.reverse()
}

export async function getWord(id: string): Promise<SavedWord | undefined> {
  const db = await getDB()
  return db.get('words', id)
}

/**
 * Write a word, stamping `updatedAt`.
 *
 * Every edit should go through here. `putWordVerbatim` is the one exception,
 * for restores.
 */
export async function saveWord(word: SavedWord): Promise<void> {
  const db = await getDB()
  await db.put('words', { ...word, updatedAt: Date.now() })
}

/**
 * Write a word exactly as given, timestamps included.
 *
 * `saveWord` stamps `updatedAt` with the current time, which is right for every
 * edit and wrong for a restore: it would re-date an entire library to the moment
 * the backup was read, destroying the only record of when each word was last
 * touched. The backup file holds the true value and nothing else does.
 *
 * Only the restore path should use this.
 */
export async function putWordVerbatim(word: SavedWord): Promise<void> {
  const db = await getDB()
  await db.put('words', word)
}

/**
 * Delete a word and everything hanging off it.
 *
 * One transaction across all three stores, so a failure cannot leave encounters
 * and usages pointing at a word that no longer exists.
 */
export async function deleteWord(id: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['words', 'encounters', 'usages'], 'readwrite')
  await tx.objectStore('words').delete(id)

  const encounterKeys = await tx.objectStore('encounters').index('by-word').getAllKeys(id)
  await Promise.all(encounterKeys.map((key) => tx.objectStore('encounters').delete(key)))

  const usageKeys = await tx.objectStore('usages').index('by-word').getAllKeys(id)
  await Promise.all(usageKeys.map((key) => tx.objectStore('usages').delete(key)))

  await tx.done
}

/**
 * Words due for practice at `now`, soonest first.
 *
 * Read from the `by-due` index with an upper bound rather than by filtering
 * everything, so the cost tracks the number of due words and not the size of
 * the library. Archived words are dropped here — they keep their history but
 * leave the rotation.
 */
export async function listDueWords(now = Date.now()): Promise<SavedWord[]> {
  const db = await getDB()
  const due = await db.getAllFromIndex('words', 'by-due', IDBKeyRange.upperBound(now))
  return due.filter((word) => !word.archived)
}

/* Encounters --------------------------------------------------------------- */

export async function addEncounter(encounter: Encounter): Promise<void> {
  const db = await getDB()
  await db.put('encounters', encounter)
}

/** Every time this word has been met, oldest first — it reads as a history. */
export async function listEncounters(wordId: string): Promise<Encounter[]> {
  const db = await getDB()
  const found = await db.getAllFromIndex('encounters', 'by-word', wordId)
  return found.sort((a, b) => a.at - b.at)
}

/* Usages ------------------------------------------------------------------- */

/**
 * Record a use, and keep the word's denormalised counters in step.
 *
 * `usageCount` and `lastUsedAt` are copies of what this store already knows.
 * They exist so the library can sort by use without reading every usage row,
 * and they are only correct if every write goes through here.
 */
export async function addUsage(usage: Usage): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['usages', 'words'], 'readwrite')
  await tx.objectStore('usages').put(usage)

  const words = tx.objectStore('words')
  const word = await words.get(usage.wordId)
  if (word) {
    await words.put({
      ...word,
      usageCount: word.usageCount + 1,
      lastUsedAt: usage.at,
      updatedAt: Date.now(),
    })
  }

  await tx.done
}

/**
 * Record a usage check-in: the word's new state and its use, atomically.
 *
 * This exists because doing it as `saveWord` then `addUsage` is a **lost
 * update**. Those are two transactions, and `addUsage` re-reads the word to bump
 * its counters — so it can read the version from *before* the status was
 * written and put it back, silently reverting `used` to whatever it was. The
 * symptom is a word with a logged use whose status never moved, which is
 * exactly the disagreement between "used 1" and "words marked used 2".
 *
 * One transaction over both stores, with the word written once from a single
 * read, so there is no window for a second reader to lose the change.
 */
export async function recordUsageCheckIn(
  word: SavedWord,
  changes: Pick<SavedWord, 'status' | 'fsrs'>,
  usage?: Usage,
): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['usages', 'words'], 'readwrite')

  if (usage) await tx.objectStore('usages').put(usage)

  await tx.objectStore('words').put({
    ...word,
    status: changes.status,
    fsrs: changes.fsrs,
    // Counters move only when a use was actually logged.
    usageCount: usage ? word.usageCount + 1 : word.usageCount,
    lastUsedAt: usage ? usage.at : word.lastUsedAt,
    updatedAt: Date.now(),
  })

  await tx.done
}

export async function listUsages(wordId: string): Promise<Usage[]> {
  const db = await getDB()
  const found = await db.getAllFromIndex('usages', 'by-word', wordId)
  return found.sort((a, b) => b.at - a.at)
}

/**
 * Every use across the whole library, newest first.
 *
 * Read from `by-date` rather than by walking each word's usages, because the
 * question Progress asks is "what happened lately", which is a date range and
 * not a word. `since` bounds the read at the index so a year of practice does
 * not have to be loaded to count this week's.
 */
export async function listUsagesSince(since: number): Promise<Usage[]> {
  const db = await getDB()
  const found = await db.getAllFromIndex('usages', 'by-date', IDBKeyRange.lowerBound(since))
  return found.sort((a, b) => b.at - a.at)
}

/**
 * Every use ever recorded, newest first.
 *
 * Unbounded, because the questions it answers are lifetime ones: whether a word
 * has *ever* been practiced or used. A bounded read would make a word practiced
 * last month look untouched, which is the opposite of what "has this been
 * practiced" means.
 *
 * One row per drill answered, so this grows faster than any other store. It is
 * still small in absolute terms — a year of daily practice is a few thousand
 * rows of four fields — and it is read once per Progress mount, not per render.
 */
export async function listAllUsages(): Promise<Usage[]> {
  const db = await getDB()
  const found = await db.getAllFromIndex('usages', 'by-date')
  return found.reverse()
}

/* Sessions ----------------------------------------------------------------- */

/**
 * Write a practice session.
 *
 * **Called after every answer now, not once at the end.** The session takes its
 * id when the first drill is answered and this re-writes the same row as the
 * run goes on, so a session abandoned partway keeps everything that was
 * actually answered. A `put` keyed on `id` overwrites, which is what makes
 * re-writing free rather than a pile of near-duplicate rows.
 *
 * It was `addSession` because it only ever ran once. `putSession` says what it
 * does under repeated calls, which is the property everything now depends on.
 */
export async function putSession(session: PracticeSession): Promise<void> {
  const db = await getDB()
  await db.put('sessions', session)
}

export async function getSession(id: string): Promise<PracticeSession | undefined> {
  const db = await getDB()
  return db.get('sessions', id)
}

/**
 * Every session, newest first.
 *
 * Unbounded on purpose: a streak's *longest* run can be anywhere in the
 * history, so a window would make the headline number wrong the moment the best
 * streak fell out of it. One row per session is small — a year of daily
 * practice is a few hundred records.
 */
export async function listSessions(): Promise<PracticeSession[]> {
  const db = await getDB()
  const found = await db.getAllFromIndex('sessions', 'by-date')
  return found.reverse()
}

/* The in-progress run ------------------------------------------------------ */

/**
 * Park where an unfinished session has got to.
 *
 * Written on the same beat as the session row, so the pair never disagrees
 * about which session is live. Not one transaction with it, deliberately: if
 * the position write failed and the answers survived, the loss is an offer to
 * resume, which the reader can live without. The reverse — a resume pointing at
 * a session whose answers were never stored — would be a run that appears to
 * continue and has lost its record.
 */
export async function putCurrentRun(run: PracticeRun): Promise<void> {
  const db = await getDB()
  await db.put('runs', run)
}

/** The parked run, if a session was left unfinished. */
export async function getCurrentRun(): Promise<PracticeRun | undefined> {
  const db = await getDB()
  return db.get('runs', CURRENT_RUN_KEY)
}

/**
 * Forget the parked run.
 *
 * Called when a session ends — finished, quit, or replaced by a new one. The
 * *session* row is untouched: what happened stays, only the offer to continue
 * goes away.
 */
export async function clearCurrentRun(): Promise<void> {
  const db = await getDB()
  await db.delete('runs', CURRENT_RUN_KEY)
}

/* Lookup cache ------------------------------------------------------------- */

export async function getCachedLookup(key: string): Promise<CachedLookup | undefined> {
  const db = await getDB()
  return db.get('lookups', key)
}

export async function putCachedLookup(lookup: CachedLookup): Promise<void> {
  const db = await getDB()
  await db.put('lookups', lookup)
}

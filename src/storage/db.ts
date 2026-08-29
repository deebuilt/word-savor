import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type {
  CachedLookup,
  Collection,
  Encounter,
  PracticeSession,
  SavedWord,
  Usage,
  WordStatus,
} from '../types/domain'

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
 * All six stores are created at version 1, including the three nothing reads
 * yet. An empty store costs nothing; adding one later means a version bump
 * against a database that already holds a year of someone's words.
 */

const DB_NAME = 'wordsavor'
const DB_VERSION = 1

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
  /** STUB — practice and puzzle history, for streaks. */
  sessions: {
    key: string
    value: PracticeSession
    indexes: { 'by-date': number }
  }
}

let dbPromise: Promise<IDBPDatabase<WordSavorDB>> | undefined

export function getDB(): Promise<IDBPDatabase<WordSavorDB>> {
  dbPromise ??= openDB<WordSavorDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
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
    },
  })
  return dbPromise
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

export async function listUsages(wordId: string): Promise<Usage[]> {
  const db = await getDB()
  const found = await db.getAllFromIndex('usages', 'by-word', wordId)
  return found.sort((a, b) => b.at - a.at)
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

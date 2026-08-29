import type { CachedLookup, SavedWord, Sense } from '../types/domain'
import { getCachedLookup, putCachedLookup } from '../storage/db'
import { lookupAudio } from './audio'
import { lookupDatamuse } from './datamuse'
import { lookupDictionary, parseDictionary, type WireResponse } from './freedictionary'
import { normaliseWord } from './http'

/**
 * One word, one lookup, three sources merged.
 *
 * The layering the build plan describes: definitions from FreeDictionaryAPI,
 * associations and rarity from Datamuse, audio from dictionaryapi.dev. What is
 * not in the plan, and matters more than the merge itself, is that the three
 * are **not equal partners**:
 *
 * - FreeDictionaryAPI is **required**. No definition, no word.
 * - Datamuse is **preferred**. Its absence costs the constellation and the
 *   rarity sort, both of which a later re-fetch can fill in.
 * - dictionaryapi.dev is **optional and non-blocking**. It gets four seconds
 *   and is allowed to lose.
 *
 * All three are issued at once, so the wait is the slowest source rather than
 * the sum of them — and since the slow one cannot block the result, the wait a
 * reader actually feels is the dictionary call.
 */

/** A merged, not-yet-saved word. The Look Up screen renders this. */
export interface LookupResult {
  /** Canonical, lowercased. Becomes `SavedWord.id`. */
  id: string
  /** Display form, as the dictionary returned it. */
  word: string
  senses: Sense[]
  synonyms: string[]
  antonyms: string[]
  related: string[]
  pronunciation?: string
  audioUrl?: string
  etymology?: string
  rarity?: number
  /** True when this came from the cache rather than the network. */
  cached: boolean
}

/*
 * The field is declared and assigned rather than written as a constructor
 * parameter property. `erasableSyntaxOnly` is on in `tsconfig.app.json`, which
 * bans any TypeScript that emits runtime code — and `constructor(readonly word:
 * string)` does exactly that, since the assignment has to be generated.
 */
export class WordNotFoundError extends Error {
  readonly word: string

  constructor(word: string) {
    super(`No dictionary entry for "${word}".`)
    this.name = 'WordNotFoundError'
    this.word = word
  }
}

export class LookupOfflineError extends Error {
  readonly word: string

  constructor(word: string) {
    super('Could not reach the dictionary.')
    this.name = 'LookupOfflineError'
    this.word = word
  }
}

/**
 * Look a word up, cache first.
 *
 * Throws `WordNotFoundError` when the dictionary answered and had nothing, and
 * `LookupOfflineError` when it could not be reached at all. The distinction is
 * the difference between "that is not a word" and "try again in a minute", and
 * a reader deserves to be told which.
 */
export async function lookupWord(rawWord: string): Promise<LookupResult> {
  const id = normaliseWord(rawWord)
  if (!id) throw new WordNotFoundError(rawWord)

  const cached = await readFromCache(id)
  if (cached) return cached

  const [dictionary, datamuse, audioUrl] = await Promise.all([
    lookupDictionary(id),
    lookupDatamuse(id),
    lookupAudio(id),
  ])

  /*
   * A null dictionary result means one of two things and they need different
   * messages. `parseDictionary` returns null for an empty `entries` array —
   * the API's way of saying the word is unknown — and `fetchJson` returns null
   * for a network failure. Distinguished here by whether the other sources got
   * through: if Datamuse answered, the network is fine and the word is simply
   * not in the dictionary.
   */
  if (!dictionary) {
    if (datamuse || audioUrl) throw new WordNotFoundError(id)
    throw new LookupOfflineError(id)
  }

  await writeToCache(id, dictionary.raw, datamuse?.raw, audioUrl)

  return {
    id,
    word: dictionary.word,
    senses: dictionary.senses,
    synonyms: dictionary.synonyms,
    antonyms: dictionary.antonyms,
    related: datamuse?.related ?? [],
    pronunciation: dictionary.pronunciation,
    audioUrl,
    etymology: dictionary.etymology,
    rarity: datamuse?.rarity,
    cached: false,
  }
}

/* Cache -------------------------------------------------------------------- */

/**
 * Cache keys.
 *
 * `${source}:${word}` as the domain type specifies. Sources are cached
 * separately so a word that saved without Datamuse can have its associations
 * filled in later without discarding a good dictionary payload.
 */
function cacheKey(source: CachedLookup['source'], word: string): string {
  return `${source}:${word}`
}

/** The shape of the auxiliary payloads, as stored. */
interface DatamuseCachePayload {
  associations: unknown
  frequency: number | undefined
}

interface AudioCachePayload {
  audioUrl: string | undefined
}

/**
 * Rebuild a result from cached payloads.
 *
 * Re-parses the stored raw response rather than caching the parsed shape.
 * That is the whole reason `CachedLookup.payload` holds the untouched body: a
 * parser fix — a better example fallback, a new field — re-derives every saved
 * word from cache with no network at all.
 */
async function readFromCache(word: string): Promise<LookupResult | null> {
  const dictionaryEntry = await getCachedLookup(cacheKey('freedictionary', word))
  if (!dictionaryEntry) return null

  const dictionary = parseDictionary(dictionaryEntry.payload as WireResponse, word)
  if (!dictionary) return null

  const [datamuseEntry, audioEntry] = await Promise.all([
    getCachedLookup(cacheKey('datamuse', word)),
    getCachedLookup(cacheKey('dictionaryapi', word)),
  ])

  const datamuse = datamuseEntry?.payload as DatamuseCachePayload | undefined
  const audio = audioEntry?.payload as AudioCachePayload | undefined

  return {
    id: word,
    word: dictionary.word,
    senses: dictionary.senses,
    synonyms: dictionary.synonyms,
    antonyms: dictionary.antonyms,
    related: readCachedRelated(datamuse),
    pronunciation: dictionary.pronunciation,
    audioUrl: audio?.audioUrl,
    etymology: dictionary.etymology,
    rarity: datamuse?.frequency,
    cached: true,
  }
}

/**
 * Associations out of the cached Datamuse payload.
 *
 * The raw response is stored, so the word list is re-derived here the same way
 * `datamuse.ts` derives it — one shape on the wire, one place it is read.
 */
function readCachedRelated(payload: DatamuseCachePayload | undefined): string[] {
  if (!payload || !Array.isArray(payload.associations)) return []

  return (payload.associations as { word?: string }[])
    .map((entry) => entry.word?.trim() ?? '')
    .filter((value) => value.length > 0)
}

/**
 * Write what each source returned.
 *
 * Only sources that actually answered are written. Caching a failure would
 * make an outage permanent — the next lookup would read back "nothing" from
 * disk and never retry.
 */
async function writeToCache(
  word: string,
  dictionaryRaw: unknown,
  datamuseRaw: unknown,
  audioUrl: string | undefined,
): Promise<void> {
  const fetchedAt = Date.now()
  const writes: Promise<void>[] = [
    putCachedLookup({
      key: cacheKey('freedictionary', word),
      source: 'freedictionary',
      word,
      fetchedAt,
      payload: dictionaryRaw,
    }),
  ]

  if (datamuseRaw) {
    writes.push(
      putCachedLookup({
        key: cacheKey('datamuse', word),
        source: 'datamuse',
        word,
        fetchedAt,
        payload: datamuseRaw,
      }),
    )
  }

  if (audioUrl) {
    writes.push(
      putCachedLookup({
        key: cacheKey('dictionaryapi', word),
        source: 'dictionaryapi',
        word,
        fetchedAt,
        payload: { audioUrl } satisfies AudioCachePayload,
      }),
    )
  }

  await Promise.all(writes)
}

/* Saving ------------------------------------------------------------------- */

/**
 * Turn a lookup into a word ready for the database.
 *
 * The FSRS card is left for the scheduler to initialise in Phase 2; what it
 * needs now is a `due` that puts the word in the practice queue immediately,
 * since a word just met is exactly the one worth being asked about first.
 */
export function toSavedWord(
  result: LookupResult,
  options: { note?: string; source: SavedWord['source'] },
): SavedWord {
  const now = Date.now()

  return {
    id: result.id,
    word: result.word,
    addedAt: now,
    updatedAt: now,
    status: 'spotted',
    pronunciation: result.pronunciation,
    audioUrl: result.audioUrl,
    senses: result.senses,
    synonyms: result.synonyms,
    antonyms: result.antonyms,
    etymology: result.etymology,
    related: result.related,
    rarity: result.rarity,
    note: options.note,
    tags: [],
    favorite: false,
    fsrs: {
      due: now,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 0,
      lapses: 0,
      state: 0,
    },
    usageCount: 0,
    archived: false,
    collectionIds: [],
    source: options.source,
  }
}

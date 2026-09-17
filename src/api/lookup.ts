import type { CachedLookup, PartOfSpeechTerms, SavedWord, Sense } from '../types/domain'
import { getCachedLookup, putCachedLookup } from '../storage/db'
import { lookupDatamuse } from './datamuse'
import {
  lookupMerriamDictionary,
  lookupMerriamThesaurus,
  parseMerriamDictionary,
  parseMerriamThesaurus,
  type MerriamThesaurusResult,
} from './merriam'
import { normaliseWord } from './http'

/**
 * One word, one lookup, three sources merged.
 *
 * The sources are **not equal partners**:
 *
 * - Merriam-Webster's Collegiate Dictionary is **required**. It supplies the
 *   definitions, part of speech, pronunciation, spoken audio, and etymology.
 *   No definition, no word.
 * - Merriam-Webster's Collegiate Thesaurus is **preferred**. It supplies
 *   synonyms and antonyms; its absence just leaves those lists to Datamuse.
 * - Datamuse is **preferred**. It supplies the association constellation and the
 *   rarity sort, both of which a later re-fetch can fill in.
 *
 * All three are issued at once, so the wait is the slowest source rather than
 * the sum of them.
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
  /**
   * The thesaurus terms kept grouped by part of speech.
   *
   * Merriam-Webster only. Datamuse's terms fill the flat lists above but never
   * these: Datamuse returns no part of speech, so filing its terms under one
   * would be inventing the very link this field exists to be trustworthy about.
   * Empty when the thesaurus had nothing.
   */
  synonymsByPartOfSpeech: PartOfSpeechTerms[]
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

  const [dictionary, thesaurus, datamuse] = await Promise.all([
    lookupMerriamDictionary(id),
    lookupMerriamThesaurus(id),
    lookupDatamuse(id),
  ])

  /*
   * A null dictionary result means one of two things and they need different
   * messages. `parseMerriamDictionary` returns null for MW's miss shapes — an
   * empty array or a suggestion list — and `fetchJson` returns null for a
   * network failure. Distinguished here by whether the other sources got
   * through: if either answered, the network is fine and the word is simply not
   * in the dictionary.
   */
  if (!dictionary) {
    if (thesaurus || datamuse) throw new WordNotFoundError(id)
    throw new LookupOfflineError(id)
  }

  await writeToCache(id, dictionary.raw, thesaurus?.raw, datamuse?.raw)

  return {
    id,
    word: dictionary.word,
    senses: dictionary.senses,
    synonyms: mergeTerms(thesaurus?.synonyms ?? [], datamuse?.synonyms),
    antonyms: mergeTerms(thesaurus?.antonyms ?? [], datamuse?.antonyms),
    synonymsByPartOfSpeech: thesaurus?.byPartOfSpeech ?? [],
    related: datamuse?.related ?? [],
    pronunciation: dictionary.pronunciation,
    audioUrl: dictionary.audioUrl,
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
 * separately so a word that saved without the thesaurus or Datamuse can have
 * those filled in later without discarding a good dictionary payload.
 */
function cacheKey(source: CachedLookup['source'], word: string): string {
  return `${source}:${word}`
}

/** The shape of the auxiliary Datamuse payload, as stored. */
interface DatamuseCachePayload {
  associations: unknown
  frequency: number | undefined
  synonyms?: unknown
  antonyms?: unknown
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
  const dictionaryEntry = await getCachedLookup(cacheKey('merriam-dictionary', word))
  if (!dictionaryEntry) return null

  const dictionary = parseMerriamDictionary(dictionaryEntry.payload as Parameters<
    typeof parseMerriamDictionary
  >[0], word)
  if (!dictionary) return null

  const [thesaurusEntry, datamuseEntry] = await Promise.all([
    getCachedLookup(cacheKey('merriam-thesaurus', word)),
    getCachedLookup(cacheKey('datamuse', word)),
  ])

  const thesaurus: MerriamThesaurusResult | null = thesaurusEntry
    ? parseMerriamThesaurus(
        thesaurusEntry.payload as Parameters<typeof parseMerriamThesaurus>[0],
        word,
      )
    : null
  const datamuse = datamuseEntry?.payload as DatamuseCachePayload | undefined

  return {
    id: word,
    word: dictionary.word,
    senses: dictionary.senses,
    synonyms: mergeTerms(thesaurus?.synonyms ?? [], readCachedTerms(datamuse?.synonyms)),
    antonyms: mergeTerms(thesaurus?.antonyms ?? [], readCachedTerms(datamuse?.antonyms)),
    synonymsByPartOfSpeech: thesaurus?.byPartOfSpeech ?? [],
    related: readCachedRelated(datamuse),
    pronunciation: dictionary.pronunciation,
    audioUrl: dictionary.audioUrl,
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

/** Same wire shape as `readCachedRelated`, for the `rel_syn`/`rel_ant` payloads. */
function readCachedTerms(payload: unknown): string[] {
  if (!Array.isArray(payload)) return []

  return (payload as { word?: string }[])
    .map((entry) => entry.word?.trim() ?? '')
    .filter((value) => value.length > 0)
}

/**
 * Combine Merriam-Webster's terms with Datamuse's, deduplicated.
 *
 * MW leads — it is the curated source — and Datamuse's WordNet terms fill in
 * behind it, capped at the same total either source alone would carry. A term
 * both sources agree on is not repeated.
 */
function mergeTerms(primary: string[], secondary: string[] | undefined): string[] {
  if (!secondary || secondary.length === 0) return primary

  const seen = new Set(primary.map((term) => term.toLowerCase()))
  const merged = [...primary]

  for (const term of secondary) {
    const key = term.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(term)
  }

  return merged.slice(0, 12)
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
  thesaurusRaw: unknown,
  datamuseRaw: unknown,
): Promise<void> {
  const fetchedAt = Date.now()
  const writes: Promise<void>[] = [
    putCachedLookup({
      key: cacheKey('merriam-dictionary', word),
      source: 'merriam-dictionary',
      word,
      fetchedAt,
      payload: dictionaryRaw,
    }),
  ]

  if (thesaurusRaw) {
    writes.push(
      putCachedLookup({
        key: cacheKey('merriam-thesaurus', word),
        source: 'merriam-thesaurus',
        word,
        fetchedAt,
        payload: thesaurusRaw,
      }),
    )
  }

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
    synonymsByPartOfSpeech: result.synonymsByPartOfSpeech,
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

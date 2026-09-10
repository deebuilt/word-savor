import { fetchJson, normaliseWord, TIMEOUT } from './http'

/**
 * Datamuse — associations and rarity.
 *
 * Two calls per word, because Datamuse answers two different questions and
 * neither answer contains the other:
 *
 * 1. **Associations** (`ml=`) — words that mean something like this one. This
 *    is what `related[]` holds and what the constellations view will read.
 * 2. **Rarity** (`sp=` on the word itself) — its frequency per million. The
 *    `md=f` flag returns frequency *for the words in the result set*, and
 *    Datamuse does not include the queried word in its own `ml=` results, so
 *    asking for associations never yields the rarity of the word asked about.
 *    Verified against the live API: without this second call, `rarity` would
 *    land `undefined` on every saved word.
 *
 * **On `rel_trg`:** the build plan named it as the source for `related[]`, and
 * it is the wrong choice. `rel_trg=perspicacious` returns an empty array live —
 * Datamuse's trigger data is sparse and misses most literary vocabulary, which
 * is precisely the kind of word this app exists for. `ml=` returned eight
 * strong associations for the same word. Since `related[]` is written once at
 * save time and is the one field expensive to backfill, an empty array here
 * would be a quiet, permanent loss.
 *
 * Both calls are optional. A word saves fine without either — it simply has no
 * constellation and no rarity until a later re-fetch fills them in.
 */

interface WireResult {
  word?: string
  score?: number
  /** Includes parts of speech and, with `md=f`, a `f:<number>` entry. */
  tags?: string[]
}

export interface DatamuseResult {
  related: string[]
  /**
   * WordNet-backed synonyms and antonyms, `rel_syn=`/`rel_ant=`.
   *
   * A second signal alongside FreeDictionary's Wiktionary-sourced synonyms, not
   * a replacement — the two sources miss different words. Verified live rather
   * than trusted from docs, the same standard `rel_trg` failed: unlike that
   * endpoint, `rel_syn` returns real results for literary vocabulary
   * ("perspicacious" → sagacious, discerning, sapient, wise), so it earns a
   * place `rel_trg` did not.
   */
  synonyms: string[]
  antonyms: string[]
  /** Frequency per million words. Lower is rarer. */
  rarity?: number
  raw: unknown
}

/**
 * How many associations to keep.
 *
 * Enough for a constellation to look like a constellation, few enough that the
 * detail screen is not a word list. Datamuse orders by score, so the cut takes
 * the weakest associations.
 */
const MAX_RELATED = 12

/** Matches FreeDictionary's own cap, so neither source dominates the merge. */
const MAX_SYN_ANT = 12

/**
 * How many spelling suggestions to offer.
 *
 * Small on purpose. This is a "did you mean" under a not-found word, not a list
 * to browse — five is enough for the intended word to be among them and few
 * enough to read at a glance without the screen becoming a menu.
 */
const MAX_SUGGESTIONS = 5

export async function lookupDatamuse(rawWord: string): Promise<DatamuseResult | null> {
  const word = normaliseWord(rawWord)
  if (!word) return null

  // Issued together rather than in sequence: they are independent, and a round
  // trip per call one after the other multiplies the wait for no reason.
  const [associations, frequency, synonyms, antonyms] = await Promise.all([
    fetchAssociations(word),
    fetchRarity(word),
    fetchRelated(word, 'rel_syn'),
    fetchRelated(word, 'rel_ant'),
  ])

  if (!associations && frequency === undefined && !synonyms && !antonyms) return null

  return {
    related: associations?.words ?? [],
    synonyms: synonyms?.words ?? [],
    antonyms: antonyms?.words ?? [],
    rarity: frequency,
    raw: {
      associations: associations?.raw ?? null,
      frequency,
      synonyms: synonyms?.raw ?? null,
      antonyms: antonyms?.raw ?? null,
    },
  }
}

/**
 * Spelling suggestions for a word the dictionary did not recognise.
 *
 * Uses Datamuse's `/sug` endpoint — the one purpose-built for "did you mean". It
 * is fuzzy rather than exact, so a word just overheard and typed by ear
 * ("perspicasious") comes back with the real spelling ranked near the top. That
 * makes it a different tool from the `sp=` this module uses for rarity, which
 * matches a spelling *pattern* rather than correcting a wrong one.
 *
 * Best-effort in the same way every other Datamuse call here is: it returns an
 * empty list on any failure and never throws. A missing suggestion must not turn
 * a plain "not found" into an error — the reader still needs to read the
 * not-found message either way.
 *
 * NOTE: unlike the rest of this module, this endpoint choice could not be
 * verified against the live API when it was written — the build sandbox blocks
 * egress to api.datamuse.com. It runs from the browser at runtime, where the
 * other Datamuse calls already succeed; the ranking is worth a spot-check on a
 * real device.
 */
export async function suggestSpellings(rawWord: string): Promise<string[]> {
  const word = normaliseWord(rawWord)
  if (!word) return []

  const url = `https://api.datamuse.com/sug?s=${encodeURIComponent(word)}&max=${MAX_SUGGESTIONS}`
  const payload = await fetchJson<WireResult[]>(url, {
    timeout: TIMEOUT.datamuse,
    source: 'datamuse',
  })
  if (!Array.isArray(payload)) return []

  return payload
    .map((entry) => entry.word?.trim() ?? '')
    // Drop the word the reader already typed. `/sug` can echo it back when the
    // typo happens to be a real but rarer word, and offering someone their own
    // spelling as the correction reads as a bug.
    .filter((value) => value.length > 0 && value.toLowerCase() !== word)
    .slice(0, MAX_SUGGESTIONS)
}

/**
 * Words that mean something like this one.
 *
 * The word itself is filtered out defensively. Datamuse was observed not to
 * include it, but a word listing itself as related to itself would put a
 * self-loop in the constellation graph, and guarding costs one comparison.
 */
async function fetchAssociations(
  word: string,
): Promise<{ words: string[]; raw: unknown } | null> {
  const url = `https://api.datamuse.com/words?ml=${encodeURIComponent(word)}&max=${MAX_RELATED + 4}`
  const payload = await fetchJson<WireResult[]>(url, {
    timeout: TIMEOUT.datamuse,
    source: 'datamuse',
  })
  if (!Array.isArray(payload)) return null

  const words = payload
    .map((entry) => entry.word?.trim() ?? '')
    .filter((value) => value.length > 0 && value.toLowerCase() !== word)
    .slice(0, MAX_RELATED)

  return { words, raw: payload }
}

/**
 * Words related by a Datamuse `rel_*` constraint — used here for `rel_syn`
 * (WordNet synonyms) and `rel_ant` (WordNet antonyms).
 *
 * Shares its shape with `fetchAssociations` but is a separate function rather
 * than a parameterised one: `ml=` and `rel_*=` are different query families
 * with different score scales, and collapsing them would blur that these are
 * two different questions asked of the same API.
 */
async function fetchRelated(
  word: string,
  relation: 'rel_syn' | 'rel_ant',
): Promise<{ words: string[]; raw: unknown } | null> {
  const url = `https://api.datamuse.com/words?${relation}=${encodeURIComponent(word)}&max=${MAX_SYN_ANT}`
  const payload = await fetchJson<WireResult[]>(url, {
    timeout: TIMEOUT.datamuse,
    source: 'datamuse',
  })
  if (!Array.isArray(payload)) return null

  const words = payload
    .map((entry) => entry.word?.trim() ?? '')
    .filter((value) => value.length > 0 && value.toLowerCase() !== word)
    .slice(0, MAX_SYN_ANT)

  return { words, raw: payload }
}

/**
 * The word's own frequency, via an exact spelling match on itself.
 *
 * `sp=` with the full word and no wildcards returns at most the word itself,
 * carrying `f:<frequency>` in its tags.
 */
async function fetchRarity(word: string): Promise<number | undefined> {
  const url = `https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=f&max=1`
  const payload = await fetchJson<WireResult[]>(url, {
    timeout: TIMEOUT.datamuse,
    source: 'datamuse',
  })
  if (!Array.isArray(payload) || payload.length === 0) return undefined

  // Only trust the number if the row really is the word asked about — `sp=`
  // can fall through to a near match on an unusual spelling.
  const match = payload[0]
  if (match.word?.trim().toLowerCase() !== word) return undefined

  return readFrequency(match.tags)
}

/**
 * Pull the frequency out of Datamuse's tag list.
 *
 * Tags arrive as a flat array mixing parts of speech with metadata —
 * `["syn", "adj", "f:1.279404"]`. The frequency is the one prefixed `f:`.
 */
function readFrequency(tags: string[] | undefined): number | undefined {
  const tag = (tags ?? []).find((value) => value.startsWith('f:'))
  if (!tag) return undefined

  const parsed = Number.parseFloat(tag.slice(2))
  return Number.isFinite(parsed) ? parsed : undefined
}

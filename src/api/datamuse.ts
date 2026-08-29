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

export async function lookupDatamuse(rawWord: string): Promise<DatamuseResult | null> {
  const word = normaliseWord(rawWord)
  if (!word) return null

  // Issued together rather than in sequence: they are independent, and two
  // round trips one after the other doubles the wait for no reason.
  const [associations, frequency] = await Promise.all([
    fetchAssociations(word),
    fetchRarity(word),
  ])

  if (!associations && frequency === undefined) return null

  return {
    related: associations?.words ?? [],
    rarity: frequency,
    raw: { associations: associations?.raw ?? null, frequency },
  }
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

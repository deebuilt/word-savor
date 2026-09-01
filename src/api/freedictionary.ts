import type { Sense } from '../types/domain'
import { fetchJson, normaliseWord, TIMEOUT } from './http'

/**
 * FreeDictionaryAPI — the definition source.
 *
 * Wiktionary data, CC BY-SA 4.0, no key. This is the one source a save cannot
 * complete without: Datamuse contributes associations and rarity, and
 * dictionaryapi.dev contributes audio, but neither of them defines the word.
 *
 * Two behaviours of this API drive most of the code below, both confirmed
 * against the live endpoint rather than taken from its docs:
 *
 * 1. **A miss is HTTP 200 with an empty `entries` array**, not a 404. Checking
 *    the status code alone would treat every unknown word as a success and
 *    save an empty record.
 *
 * 2. **`entries[]` is not one entry per part of speech.** "bank" returns seven
 *    entries — four nouns and three verbs — because Wiktionary splits by
 *    etymology as well as by part of speech. Mapping entries to senses
 *    one-to-one would show the reader "noun" four times. They are flattened
 *    and grouped by part of speech here instead.
 */

/* The wire shape. Every field optional: this is third-party JSON, and parsing
   has to survive whatever actually arrives. -------------------------------- */

interface WirePronunciation {
  type?: string
  text?: string
  tags?: string[]
}

interface WireQuote {
  text?: string
  reference?: string
}

interface WireSense {
  definition?: string
  tags?: string[]
  examples?: string[]
  quotes?: WireQuote[]
  synonyms?: string[]
  antonyms?: string[]
}

interface WireEntry {
  partOfSpeech?: string
  pronunciations?: WirePronunciation[]
  senses?: WireSense[]
  synonyms?: string[]
  antonyms?: string[]
  etymology?: string
}

export interface WireResponse {
  word?: string
  entries?: WireEntry[]
}

/** What this source contributes to a merged record. */
export interface DictionaryResult {
  word: string
  senses: Sense[]
  synonyms: string[]
  antonyms: string[]
  pronunciation?: string
  etymology?: string
  /** The untouched response, for the cache. */
  raw: unknown
}

/**
 * Synonym lists here can run to hundreds of entries — "good" returns a wall of
 * them, down to regional slang. A word detail screen showing three hundred
 * synonyms is unreadable, and the long tail is the least useful part of it.
 */
const MAX_SYNONYMS = 12
const MAX_EXAMPLES_PER_SENSE = 3

/**
 * Sense caps.
 *
 * "Save every sense" is the right instinct and it needs a ceiling: "bank"
 * returns forty across two parts of speech, most of them regional, obsolete, or
 * technical. Forty is not a richer record than eight, it is an unreadable one —
 * and Wiktionary orders senses by prominence, so the cut takes the tail.
 *
 * Capped per part of speech rather than overall, so a word whose noun sense is
 * exhaustively documented cannot crowd out its verb entirely. A reader looking
 * up "bank" needs to see that it is also a verb.
 */
const MAX_SENSES_PER_PART_OF_SPEECH = 6
const MAX_SENSES_TOTAL = 12

export async function lookupDictionary(rawWord: string): Promise<DictionaryResult | null> {
  const word = normaliseWord(rawWord)
  if (!word) return null

  const url = `https://freedictionaryapi.com/api/v1/entries/en/${encodeURIComponent(word)}`
  const payload = await fetchJson<WireResponse>(url, {
    timeout: TIMEOUT.dictionary,
    source: 'freedictionary',
  })

  if (!payload) return null
  return parseDictionary(payload, word)
}

/**
 * Turn the wire shape into the shape the app stores.
 *
 * Split from the fetch on purpose. Raw payloads are cached permanently, so a
 * parser improvement later can re-derive every saved word from the cache
 * without a single network call — which only works if parsing is a pure
 * function of the payload.
 */
export function parseDictionary(
  payload: WireResponse,
  fallbackWord: string,
): DictionaryResult | null {
  const entries = payload.entries ?? []
  // The miss case. Empty entries with a 200 status is how this API says no.
  if (entries.length === 0) return null

  const senses = collectSenses(entries)
  if (senses.length === 0) return null

  const synonyms = new Set<string>()
  const antonyms = new Set<string>()
  let pronunciation: string | undefined
  let etymology: string | undefined

  for (const entry of entries) {
    pronunciation ??= pickPronunciation(entry.pronunciations)
    etymology ??= entry.etymology?.trim() || undefined

    for (const value of entry.synonyms ?? []) addTerm(synonyms, value)
    for (const value of entry.antonyms ?? []) addTerm(antonyms, value)

    for (const sense of entry.senses ?? []) {
      for (const value of sense.synonyms ?? []) addTerm(synonyms, value)
      for (const value of sense.antonyms ?? []) addTerm(antonyms, value)
    }
  }

  return {
    word: payload.word?.trim() || fallbackWord,
    senses,
    synonyms: [...synonyms].slice(0, MAX_SYNONYMS),
    antonyms: [...antonyms].slice(0, MAX_SYNONYMS),
    pronunciation,
    etymology,
    raw: payload,
  }
}

/**
 * Every sense, flattened across entries and grouped by part of speech.
 *
 * All of them are kept, not the first per part of speech. Storage is free, and
 * a sense dropped at save time can only be recovered by re-fetching — whereas
 * a sense hidden at display time costs a tap to reveal. The detail screen shows
 * the first and puts the rest behind a disclosure.
 *
 * Grouping matters for that ordering: senses of the first part of speech all
 * come before the second, so "the first sense" is a meaningful primary rather
 * than whichever etymology Wiktionary happened to list first.
 */
function collectSenses(entries: WireEntry[]): Sense[] {
  // Carries Wiktionary's own `tags` alongside each sense only long enough to
  // rank it — `Sense` itself has no `tags` field, and it does not need one
  // just to have existed transiently during a sort.
  const grouped = new Map<string, { sense: Sense; tags: string[] }[]>()
  const order: string[] = []

  for (const entry of entries) {
    const partOfSpeech = entry.partOfSpeech?.trim() || 'other'
    let bucket = grouped.get(partOfSpeech)
    if (!bucket) {
      bucket = []
      grouped.set(partOfSpeech, bucket)
      order.push(partOfSpeech)
    }

    for (const sense of entry.senses ?? []) {
      const definition = sense.definition?.trim()
      if (!definition) continue
      // Wiktionary repeats identical definitions across etymology splits often
      // enough that dropping them here beats doing it in every consumer.
      if (bucket.some((existing) => existing.sense.definition === definition)) continue
      if (bucket.length >= MAX_SENSES_PER_PART_OF_SPEECH) continue
      bucket.push({
        sense: { partOfSpeech, definition, examples: exampleSentences(sense) },
        tags: sense.tags ?? [],
      })
    }
  }

  /*
   * Within each part of speech, the plainest sense leads rather than whichever
   * one Wiktionary listed first.
   *
   * Wiktionary orders by etymology — oldest or most technical sense first,
   * which is a lexicographer's ordering, not a reader's. "ad hominem" is the
   * case that forced this: sense one is "Ellipsis of argumentum ad hominem: A
   * fallacious objection to an argument or factual claim by appealing to a
   * characteristic or belief of the person making the argument..." — one
   * sentence, several subordinate clauses, and tagged `["abbreviation","alt
   * of","ellipsis"]` — while sense two, tagged `["informal"]`, is "A personal
   * attack." Both are the noun. The second is the one an actual reader wants
   * first, and `plainnessScore` reads both the tags and the sentence itself to
   * find it, rather than trusting Wiktionary's own order.
   *
   * A stable sort, not a filter: every sense collected above is kept, in a
   * reordered sequence. Nothing here decides a sense does not belong — only
   * which one leads.
   */
  for (const bucket of grouped.values()) {
    bucket.sort((a, b) => plainnessScore(a) - plainnessScore(b))
  }

  /*
   * Spend the total budget a round at a time, then restore grouping.
   *
   * Simply concatenating would spend the whole budget on the first part of
   * speech before reaching the second — for "bank", six nouns and no verb at
   * all, hiding the fact that it is a verb. Allocating in rounds keeps every
   * part of speech represented and trims depth evenly instead.
   *
   * But the reader wants all noun senses together, not alternating noun, verb,
   * noun. So the rounds decide *which* senses survive, and this second pass
   * puts them back in source order — grouped by part of speech, first part of
   * speech first, so the primary sense is still the primary.
   */
  const kept = new Set<Sense>()
  for (let round = 0; round < MAX_SENSES_PER_PART_OF_SPEECH; round += 1) {
    for (const partOfSpeech of order) {
      if (kept.size >= MAX_SENSES_TOTAL) break
      const entry = grouped.get(partOfSpeech)?.[round]
      if (entry) kept.add(entry.sense)
    }
  }

  return order.flatMap((partOfSpeech) =>
    (grouped.get(partOfSpeech) ?? [])
      .map((entry) => entry.sense)
      .filter((sense) => kept.has(sense)),
  )
}

/**
 * Rank a sense by how plain it reads, lower is plainer.
 *
 * Three signals. Word count alone rewards *terse* over *plain*, and those are
 * not the same thing — "inscription" is the case that forced the third one:
 * every sense carries identical grammar tags, nothing in the tags
 * distinguishes them, and "The act of inscribing." (four words) beats "Text
 * carved on a wall or plaque..." (longer) on word count alone despite being
 * the worse definition — it explains the noun by pointing back at its own
 * verb, which teaches nothing to a reader who does not already know that verb.
 *
 * 1. **Wiktionary's own cross-reference tags** — `alt of`, `ellipsis`,
 *    `abbreviation`, `initialism`, `synonym of`, and friends mark a sense as
 *    "this is short for / another way of writing that", which is inherently a
 *    worse primary definition than a sense that just says what the word means.
 *    `informal`/`colloquial` are the opposite signal: Wiktionary itself is
 *    marking that sense as the everyday one.
 * 2. **Sentence shape** — word count, plus a penalty per semicolon and colon,
 *    since those are where a Wiktionary definition chains a second and third
 *    clause onto the first. "A personal attack." scores near zero on both
 *    counts; "Ellipsis of argumentum ad hominem: A fallacious objection to an
 *    argument or factual claim by appealing to..." scores high on both.
 * 3. **Circular gloss patterns** — "The act of [verb]ing", "An instance of
 *    [verb]ing", "The quality of being [adjective]", "The state of [verb]ing".
 *    Wiktionary uses these often for a noun derived from a verb or adjective,
 *    and they are short by construction regardless of how well they teach the
 *    word — a flat penalty keeps word count from mistaking that shortness for
 *    plainness.
 */
function plainnessScore(entry: { sense: Sense; tags: string[] }): number {
  const tags = entry.tags.map((tag) => tag.toLowerCase())
  const definition = entry.sense.definition

  let score = definition.split(/\s+/).filter(Boolean).length
  score += (definition.match(/[;:]/g)?.length ?? 0) * 8

  if (tags.some((tag) => CROSS_REFERENCE_TAGS.has(tag))) score += 40
  if (tags.some((tag) => PLAIN_REGISTER_TAGS.has(tag))) score -= 15
  if (CIRCULAR_GLOSS.test(definition)) score += 20

  return score
}

/**
 * "The act of X-ing", "An instance of X-ing", "The quality/state of being X".
 *
 * Anchored to the start of the definition — these patterns only count as
 * circular when they *are* the definition, not when a longer sense happens to
 * contain the phrase "act of" partway through.
 */
const CIRCULAR_GLOSS = /^(the|an?)\s+(act|instance|state|quality)\s+of\b/i

/** Marks a sense as pointing elsewhere rather than defining the word itself. */
const CROSS_REFERENCE_TAGS = new Set([
  'alt of',
  'alternative form of',
  'alternative spelling of',
  'ellipsis',
  'abbreviation',
  'initialism',
  'synonym of',
  'obsolete',
  'archaic',
])

/** Marks a sense as the everyday one, in Wiktionary's own judgment. */
const PLAIN_REGISTER_TAGS = new Set(['informal', 'colloquial'])

/**
 * Example sentences, falling back to quotations.
 *
 * The `examples` array is very often empty on this source while a real usage
 * sits in `quotes[].text` — "perspicacious" has no examples and one quotation.
 * The example sentence is what makes a definition concrete, and what the
 * fill-in-the-blank puzzles will be built from later, so a quotation is worth
 * strictly more than nothing.
 *
 * The quotation's `reference` (publication and date) is dropped: bibliographic
 * detail is noise in a vocabulary app, and the sentence is the part that
 * teaches the word.
 */
function exampleSentences(sense: WireSense): string[] {
  const direct = (sense.examples ?? [])
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && !looksLikeCitation(value))
  if (direct.length > 0) return direct.slice(0, MAX_EXAMPLES_PER_SENSE)

  return (sense.quotes ?? [])
    .map((quote) => quote.text?.trim() ?? '')
    .filter((value) => value.length > 0 && !looksLikeCitation(value))
    .slice(0, MAX_EXAMPLES_PER_SENSE)
}

/**
 * Reject a quotation whose text is really a bibliographic citation.
 *
 * Applied to `examples` and `quotes` alike, because the leak happens in both.
 * Quotations normally split cleanly — the sentence in `text`, the publication
 * in `reference` — but "ephemeral" carries
 * `"1821-1822, Vicesimus Knox, Remarks on the tendency of…"` in its `examples`
 * array: a year, then an author, then a title. Shown as an example sentence it
 * teaches nothing about the word, and it is the first thing a reader would see
 * on the detail screen.
 *
 * Detected by the one thing citations here reliably do and sentences do not:
 * open with a year, optionally a range or a month.
 */
function looksLikeCitation(text: string): boolean {
  return /^\d{4}\s*(?:[-–]\s*\d{2,4})?\s*(?:[A-Z][a-z]+\s+\d{1,2})?\s*,/.test(text)
}

/**
 * One IPA string from what can be a dozen regional variants.
 *
 * "bank" returns six, alternating phonemic (`/…/`) and phonetic (`[…]`) across
 * three accents. Phonemic is the form dictionaries print, so it wins; beyond
 * that the first one is taken rather than guessing the reader's accent from
 * the browser.
 */
function pickPronunciation(pronunciations: WirePronunciation[] | undefined): string | undefined {
  const ipa = (pronunciations ?? []).filter(
    (entry) => entry.type === 'ipa' && typeof entry.text === 'string' && entry.text.trim(),
  )
  if (ipa.length === 0) return undefined

  const phonemic = ipa.find((entry) => entry.text?.startsWith('/'))
  return (phonemic ?? ipa[0]).text?.trim()
}

/** Add a cleaned term to a set, skipping blanks. */
function addTerm(target: Set<string>, value: string): void {
  const trimmed = value.trim()
  if (trimmed) target.add(trimmed)
}

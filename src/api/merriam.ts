import type { Sense } from '../types/domain'
import { fetchJson, normaliseWord, TIMEOUT } from './http'

/**
 * Merriam-Webster — the definition, pronunciation, audio, and thesaurus source.
 *
 * Two references, two API keys, both reached through the app's own proxy at
 * `/api/mw` rather than called directly. The proxy exists for one reason: MW
 * requires a key, and a key shipped to the browser is a key anyone can read out
 * of the bundle. So the browser calls `/api/mw`, the proxy adds the key
 * server-side, and the response comes back untouched. See `api/mw.ts`.
 *
 * - **Collegiate Dictionary** — definitions, part of speech, pronunciation,
 *   spoken audio, and etymology. This is the required source: no definition,
 *   no word.
 * - **Collegiate Thesaurus** — synonyms and antonyms. Optional; a word saves
 *   fine without it, just without MW's synonym lists.
 *
 * Both parsers are pure functions of the payload, split from the fetch on
 * purpose. Raw payloads are cached permanently, so a parser improvement later
 * re-derives every saved word from the cache without a network call — which
 * only works if parsing depends on nothing but the payload.
 *
 * A note on the shapes below: every field is optional. This is third-party
 * JSON, and parsing has to survive whatever actually arrives — including MW's
 * two miss cases, both of which come back as a 200. See `parseMerriam*`.
 */

/* Where the proxy lives -------------------------------------------------------
 *
 * Relative by default: in production the app and the proxy are served from the
 * same origin on Vercel, so `/api/mw` resolves correctly with no configuration.
 * `VITE_MW_PROXY_BASE` overrides it for local `vite` dev, where the app runs on
 * :8205 and the proxy has to be reached at its deployed origin. It is a plain
 * URL, not a secret, so it is safe in `.env`. */
const PROXY_BASE = ((import.meta.env.VITE_MW_PROXY_BASE as string | undefined) ?? '').replace(
  /\/+$/,
  '',
)

function proxyUrl(ref: 'dictionary' | 'thesaurus', word: string): string {
  return `${PROXY_BASE}/api/mw?ref=${ref}&word=${encodeURIComponent(word)}`
}

/* Caps, matching the old FreeDictionary parser so the detail screen stays the
   same length regardless of which source filled it. -------------------------- */
const MAX_SENSES_PER_PART_OF_SPEECH = 6
const MAX_SENSES_TOTAL = 12
const MAX_EXAMPLES_PER_SENSE = 3
const MAX_SYN_ANT = 12

/* Dictionary wire shape ---------------------------------------------------- */

interface WireSound {
  audio?: string
}

interface WirePronunciation {
  /** MW's own respelling, e.g. `ˌpər-spi-ˈkā-shəs`. Not IPA. */
  mw?: string
  sound?: WireSound
}

interface WireHeadword {
  /** Headword with syllable dots, e.g. `per*spi*ca*cious`. */
  hw?: string
  prs?: WirePronunciation[]
}

/** A defining-text run: `["text", "…"]`, `["vis", [{t: "…"}]]`, and others. */
type WireDefiningText = [string, unknown]

interface WireSenseBody {
  dt?: WireDefiningText[]
}

/** One element of a sense sequence: `["sense", {…}]`, `["sdsense", {…}]`, … */
type WireSseqElement = [string, WireSenseBody]

interface WireDefSection {
  sseq?: WireSseqElement[][]
}

interface WireMeta {
  id?: string
  stems?: string[]
}

interface WireDictionaryEntry {
  meta?: WireMeta
  hwi?: WireHeadword
  /** Functional label — the part of speech. */
  fl?: string
  shortdef?: string[]
  def?: WireDefSection[]
  /** Etymology, as token-bearing text runs. */
  et?: WireDefiningText[]
}

/** A dictionary payload is either real entries or one of two miss shapes. */
type WireDictionaryResponse = WireDictionaryEntry[] | string[]

export interface MerriamDictionaryResult {
  word: string
  senses: Sense[]
  pronunciation?: string
  audioUrl?: string
  etymology?: string
  /** The untouched response, for the cache. */
  raw: unknown
}

/* Thesaurus wire shape ----------------------------------------------------- */

interface WireThesaurusMeta {
  id?: string
  /** Synonyms, grouped: `[["sagacious","discerning"], ["wise"]]`. */
  syns?: string[][]
  ants?: string[][]
}

interface WireThesaurusEntry {
  meta?: WireThesaurusMeta
  fl?: string
}

type WireThesaurusResponse = WireThesaurusEntry[] | string[]

export interface MerriamThesaurusResult {
  synonyms: string[]
  antonyms: string[]
  raw: unknown
}

/* Dictionary --------------------------------------------------------------- */

export async function lookupMerriamDictionary(
  rawWord: string,
): Promise<MerriamDictionaryResult | null> {
  const word = normaliseWord(rawWord)
  if (!word) return null

  const payload = await fetchJson<WireDictionaryResponse>(proxyUrl('dictionary', word), {
    timeout: TIMEOUT.dictionary,
    source: 'merriam-dictionary',
  })
  if (!payload) return null
  return parseMerriamDictionary(payload, word)
}

/**
 * Turn a Collegiate Dictionary payload into the shape the app stores.
 *
 * MW's two miss cases both arrive as HTTP 200, so the status code says nothing —
 * the array's contents do:
 *
 * 1. **A word MW does not recognise** returns an array of *strings*, its "did
 *    you mean" spelling suggestions. `typeof entries[0] === 'string'` is the
 *    tell. (WordSavor gets its own suggestions from Datamuse, so these are
 *    dropped here rather than surfaced.)
 * 2. **A word MW has nothing for** returns an empty array.
 *
 * Either way the answer is null, and the caller reads that as "not found".
 */
export function parseMerriamDictionary(
  payload: WireDictionaryResponse,
  word: string,
): MerriamDictionaryResult | null {
  if (!Array.isArray(payload) || payload.length === 0) return null
  // The suggestion-array miss case.
  if (typeof payload[0] === 'string') return null

  const entries = (payload as WireDictionaryEntry[]).filter((entry) => matchesWord(entry, word))
  if (entries.length === 0) return null

  const senses = collectSenses(entries)
  if (senses.length === 0) return null

  let pronunciation: string | undefined
  let audioUrl: string | undefined
  let etymology: string | undefined

  for (const entry of entries) {
    for (const pron of entry.hwi?.prs ?? []) {
      pronunciation ??= pron.mw?.trim() || undefined
      const audio = pron.sound?.audio?.trim()
      if (audio) audioUrl ??= buildAudioUrl(audio)
    }
    etymology ??= cleanTokens(firstText(entry.et)) || undefined
  }

  return {
    word,
    senses,
    pronunciation,
    audioUrl,
    etymology,
    raw: payload,
  }
}

/**
 * Keep only entries that are the word asked about.
 *
 * A lookup for "run" returns the noun and the verb, which we want — but MW also
 * returns run-on and derived entries ("run-down", "runner") whose headwords are
 * different words. Matched on the headword rather than the stem list, since
 * stems include every inflected form and would let "running" pull in unrelated
 * entries.
 */
function matchesWord(entry: WireDictionaryEntry, word: string): boolean {
  const headword = entry.hwi?.hw?.replace(/\*/g, '').trim().toLowerCase()
  if (headword === word) return true
  // `meta.id` carries a homograph suffix on repeats, e.g. `bank:1`.
  const id = entry.meta?.id?.split(':')[0]?.trim().toLowerCase()
  return id === word
}

/**
 * Every sense, grouped by part of speech, definitions from `shortdef`.
 *
 * `shortdef` is MW's own brief form of each sense — already trimmed to the
 * essentials and free of the defining-text tokens that clutter the full `def`
 * tree. It is exactly what a vocabulary app wants to show, so the definition
 * wording comes from there.
 *
 * Example sentences do not live in `shortdef`, though — they are buried in the
 * `def` sense sequence as verbal illustrations. Those are walked separately and
 * matched to the `shortdef` senses by position, which is their natural order.
 * The matching is best-effort by design: if the two do not line up for some
 * entry, the affected sense simply shows no example rather than the wrong one.
 * (Worth a spot-check on a real device, since the `def` tree is the one part
 * of this parser that could not be verified against a live response.)
 *
 * Capped per part of speech and overall, the same way the old parser was, so a
 * word with a deeply documented noun sense cannot crowd out its verb.
 */
function collectSenses(entries: WireDictionaryEntry[]): Sense[] {
  const grouped = new Map<string, Sense[]>()
  const order: string[] = []

  for (const entry of entries) {
    const partOfSpeech = entry.fl?.trim() || 'other'
    let bucket = grouped.get(partOfSpeech)
    if (!bucket) {
      bucket = []
      grouped.set(partOfSpeech, bucket)
      order.push(partOfSpeech)
    }

    const definitions = (entry.shortdef ?? [])
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
    const examples = collectExamples(entry.def)

    definitions.forEach((definition, index) => {
      // De-duplicate: MW repeats a definition across homograph entries often
      // enough that dropping it here beats doing it in every consumer.
      if (bucket.some((existing) => existing.definition === definition)) return
      if (bucket.length >= MAX_SENSES_PER_PART_OF_SPEECH) return
      bucket.push({
        partOfSpeech,
        definition,
        examples: (examples[index] ?? []).slice(0, MAX_EXAMPLES_PER_SENSE),
      })
    })
  }

  /*
   * Spend the total budget a round at a time across parts of speech, then
   * restore grouping — so trimming to the cap takes depth evenly rather than
   * spending the whole budget on the first part of speech, and the reader still
   * sees all noun senses together before the verb.
   */
  const kept = new Set<Sense>()
  for (let round = 0; round < MAX_SENSES_PER_PART_OF_SPEECH; round += 1) {
    for (const partOfSpeech of order) {
      if (kept.size >= MAX_SENSES_TOTAL) break
      const sense = grouped.get(partOfSpeech)?.[round]
      if (sense) kept.add(sense)
    }
  }

  return order.flatMap((partOfSpeech) =>
    (grouped.get(partOfSpeech) ?? []).filter((sense) => kept.has(sense)),
  )
}

/**
 * Example sentences per sense, in sense order.
 *
 * Walks the `def` sense sequence and, for each sense element it finds, pulls the
 * verbal illustrations (`vis`) out of that sense's defining text. Returns one
 * array per sense so `collectSenses` can line them up with `shortdef` by index.
 *
 * Written to never throw: every level is guarded, and an unexpected shape
 * yields an empty list rather than an exception. Losing an example is a
 * cosmetic downgrade; a parse error would fail the whole lookup.
 */
function collectExamples(def: WireDefSection[] | undefined): string[][] {
  const perSense: string[][] = []

  for (const section of def ?? []) {
    for (const sequence of section.sseq ?? []) {
      for (const element of sequence ?? []) {
        if (!Array.isArray(element)) continue
        const [type, body] = element
        if (type !== 'sense' && type !== 'sdsense') continue
        perSense.push(extractIllustrations(body?.dt))
      }
    }
  }

  return perSense
}

/** The illustration sentences out of one sense's defining text. */
function extractIllustrations(dt: WireDefiningText[] | undefined): string[] {
  const out: string[] = []

  for (const run of dt ?? []) {
    if (!Array.isArray(run) || run[0] !== 'vis') continue
    for (const illustration of (run[1] as { t?: string }[] | undefined) ?? []) {
      const sentence = cleanTokens(illustration?.t)
      if (sentence) out.push(sentence)
    }
  }

  return out
}

/**
 * Build the playable audio URL from MW's audio filename.
 *
 * MW returns a bare filename; the CDN path is assembled from it by a documented
 * subdirectory rule. The subfolder is the filename's first letter — except a
 * name starting with `bix` or `gg` uses that as the folder, and a name starting
 * with a number or punctuation uses `number`.
 */
function buildAudioUrl(audio: string): string {
  let subdir: string
  if (audio.startsWith('bix')) subdir = 'bix'
  else if (audio.startsWith('gg')) subdir = 'gg'
  else if (/^[a-z]/i.test(audio)) subdir = audio[0].toLowerCase()
  else subdir = 'number'

  return `https://media.merriam-webster.com/audio/prons/en/us/mp3/${subdir}/${audio}.mp3`
}

/* Thesaurus ---------------------------------------------------------------- */

export async function lookupMerriamThesaurus(
  rawWord: string,
): Promise<MerriamThesaurusResult | null> {
  const word = normaliseWord(rawWord)
  if (!word) return null

  const payload = await fetchJson<WireThesaurusResponse>(proxyUrl('thesaurus', word), {
    timeout: TIMEOUT.thesaurus,
    source: 'merriam-thesaurus',
  })
  if (!payload) return null
  return parseMerriamThesaurus(payload, word)
}

/**
 * Synonyms and antonyms out of a Collegiate Thesaurus payload.
 *
 * MW pre-aggregates these on each entry as `meta.syns` / `meta.ants` — grouped
 * by sense, which is flattened here into two ordered, de-duplicated lists.
 * Same miss handling as the dictionary: a string array or an empty array is a
 * miss, and a miss is null.
 */
export function parseMerriamThesaurus(
  payload: WireThesaurusResponse,
  word: string,
): MerriamThesaurusResult | null {
  if (!Array.isArray(payload) || payload.length === 0) return null
  if (typeof payload[0] === 'string') return null

  const entries = (payload as WireThesaurusEntry[]).filter((entry) => {
    const id = entry.meta?.id?.split(':')[0]?.trim().toLowerCase()
    return id === word
  })

  const synonyms = new Set<string>()
  const antonyms = new Set<string>()
  for (const entry of entries) {
    for (const group of entry.meta?.syns ?? []) for (const term of group) addTerm(synonyms, term)
    for (const group of entry.meta?.ants ?? []) for (const term of group) addTerm(antonyms, term)
  }

  if (synonyms.size === 0 && antonyms.size === 0) return null

  return {
    synonyms: [...synonyms].slice(0, MAX_SYN_ANT),
    antonyms: [...antonyms].slice(0, MAX_SYN_ANT),
    raw: payload,
  }
}

/* Shared helpers ----------------------------------------------------------- */

/**
 * Strip Merriam-Webster's formatting tokens from a string.
 *
 * MW marks up its text with brace tokens — `{bc}` for the bold colon that opens
 * a definition, `{it}…{/it}` for italics, `{sx|word||}` for cross-references,
 * `{ldquo}`/`{rdquo}` for curly quotes. The quotes are worth keeping as real
 * characters; the rest are display directives that mean nothing as plain text,
 * so they are removed. Whitespace is collapsed afterwards, since removing a
 * token mid-sentence can leave a double space.
 */
function cleanTokens(text: string | undefined): string {
  if (!text) return ''
  return text
    .replace(/\{ldquo\}/g, '“')
    .replace(/\{rdquo\}/g, '”')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The text of the first defining-text run, e.g. the etymology's `["text",…]`. */
function firstText(runs: WireDefiningText[] | undefined): string | undefined {
  for (const run of runs ?? []) {
    if (Array.isArray(run) && run[0] === 'text' && typeof run[1] === 'string') return run[1]
  }
  return undefined
}

/** Add a cleaned term to a set, skipping blanks. */
function addTerm(target: Set<string>, value: string): void {
  const trimmed = value.trim()
  if (trimmed) target.add(trimmed)
}

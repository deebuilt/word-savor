import type { SavedWord } from '../types/domain'

/**
 * Practice modes that drill one saved word using data it already carries —
 * its own definitions, example sentences, synonyms, and related terms. No new
 * API calls: everything here was written to the word at save time.
 *
 * A word gets every mode it has material for, not one picked at random. A
 * session works through a word's full set of drills before moving to the
 * next — that is what makes it read as *practicing a word*, rather than a
 * shuffled deck of unrelated questions that happens to mention it once.
 *
 * `buildDrillsForWord` is the single entry point; the individual `build*`
 * functions exist for testing and are otherwise called only from there. Each
 * returns `undefined` when the word does not carry enough of its own data —
 * a fill-blank needs an example sentence that actually contains the word as
 * a full sentence, a synonym match needs a synonym, an odd-one-out needs
 * three related terms. Skipping a mode a word has no material for beats
 * inventing a distractor or a giveaway blank.
 */

export type DrillKind =
  | 'definition-match'
  | 'fill-blank'
  | 'fragment-cloze'
  | 'synonym-match'
  | 'odd-one-out'

export interface DefinitionMatchDrill {
  kind: 'definition-match'
  word: SavedWord
  definition: string
}

export interface FillBlankDrill {
  kind: 'fill-blank'
  word: SavedWord
  /** The example sentence with the target word masked. */
  before: string
  after: string
}

export interface FragmentClozeDrill {
  kind: 'fragment-cloze'
  word: SavedWord
  /** A usage fragment with the target word masked. */
  before: string
  after: string
  /** The word itself, shuffled in among distractors. */
  options: string[]
  answer: string
}

export interface SynonymMatchDrill {
  kind: 'synonym-match'
  word: SavedWord
  definition: string
  /** One correct synonym among the options, shuffled in. */
  options: string[]
  answer: string
}

export interface OddOneOutDrill {
  kind: 'odd-one-out'
  word: SavedWord
  /** Three terms related to `word`, plus one impostor drawn from another word's related list. */
  options: string[]
  impostor: string
}

export type Drill =
  | DefinitionMatchDrill
  | FillBlankDrill
  | FragmentClozeDrill
  | SynonymMatchDrill
  | OddOneOutDrill

/**
 * Every full-sentence example across all of a word's senses, in the order
 * the dictionary returned them.
 *
 * "Full sentence" rather than "contains the word" alone: dictionaries mix
 * genuine sentences ("Before leaving the scene, the murderer set a fire in
 * order to obfuscate any evidence of his identity.") with bare collocations
 * ("obfuscate facts") in the same `examples[]` array, and a fill-blank built
 * from a two-word collocation gives away the answer through sentence shape
 * alone. A capitalised start and terminal punctuation is a cheap filter that
 * catches most of the difference without needing real NLP.
 */
function fullSentenceExamples(word: SavedWord): string[] {
  return examplesWithWord(word).filter(isFullSentence)
}

/**
 * Word-containing examples that are *not* full sentences — the bare
 * collocations ("obfuscate facts", "a bespoke suit") that `fullSentenceExamples`
 * throws out. They give the answer away in a *typed* blank, but as a
 * multiple-choice cloze they are fair game and let fragment-only words carry a
 * blank drill instead of wasting their example data. Two words minimum, so
 * masking the target still leaves some context to read.
 */
function fragmentExamples(word: SavedWord): string[] {
  return examplesWithWord(word).filter(
    (text) => !isFullSentence(text) && text.split(/\s+/).length >= 2,
  )
}

/** Deduped, trimmed examples across all senses that contain the word as a whole word. */
function examplesWithWord(word: SavedWord): string[] {
  const wordPattern = new RegExp(`\\b${escapeRegExp(word.word)}\\b`, 'i')
  const seen = new Set<string>()
  const out: string[] = []

  for (const sense of word.senses) {
    for (const example of sense.examples) {
      const trimmed = example.trim()
      if (!wordPattern.test(trimmed)) continue
      const key = trimmed.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(trimmed)
    }
  }

  return out
}

/**
 * A capitalised, terminally punctuated clause of four or more words — a real
 * sentence rather than a bare collocation. A cheap filter that catches most of
 * the difference ("Before leaving the scene, the murderer set a fire in order
 * to obfuscate any evidence." vs "obfuscate facts") without needing real NLP.
 */
function isFullSentence(text: string): boolean {
  return /^[A-Z]/.test(text) && /[.?!]$/.test(text) && text.split(/\s+/).length >= 4
}

export function buildDefinitionMatch(word: SavedWord): DefinitionMatchDrill | undefined {
  const definition = word.senses[0]?.definition
  if (!definition) return undefined
  return { kind: 'definition-match', word, definition }
}

/**
 * One fill-blank per available full sentence, not just the first.
 *
 * A word with three usable examples gets three different drills across
 * sessions rather than the same one on repeat — `buildDrillsForWord` calls
 * this once per session and picks a random example each time, so the variety
 * shows up over multiple practice sessions rather than within one.
 */
export function buildFillBlank(word: SavedWord): FillBlankDrill | undefined {
  const examples = fullSentenceExamples(word)
  if (examples.length === 0) return undefined

  const example = examples[Math.floor(Math.random() * examples.length)]
  const match = new RegExp(`\\b${escapeRegExp(word.word)}\\b`, 'i').exec(example)
  if (!match) return undefined

  return {
    kind: 'fill-blank',
    word,
    before: example.slice(0, match.index),
    after: example.slice(match.index + match[0].length),
  }
}

export function buildSynonymMatch(word: SavedWord, pool: SavedWord[]): SynonymMatchDrill | undefined {
  const definition = word.senses[0]?.definition
  if (!definition) return undefined

  // Skip any synonym that already appears in the definition — "custom" as the
  // answer to "custom made" gives itself away in the prompt. Whole-word,
  // case-insensitive; if no synonym survives, skip the drill for this word.
  const answer = word.synonyms.find((synonym) => !definitionContains(definition, synonym))
  if (!answer) return undefined

  // Distractors fall back through antonyms → other saved words → a common-word
  // list, so this drill works from the very first saved word instead of being
  // skipped until the library holds four. Antonyms are included: telling a
  // synonym from an antonym given the meaning is a fair test.
  const distractors = pickDistractors(word, pool, 3, { includeAntonyms: true })
  if (distractors.length < 3) return undefined

  return {
    kind: 'synonym-match',
    word,
    definition,
    options: shuffle([answer, ...distractors]),
    answer,
  }
}

/**
 * A usage fragment with the word masked, answered by picking from four.
 *
 * The counterpart to the typed fill-blank: that one needs a real sentence,
 * because a short collocation gives the answer away by shape. As a *pick*, the
 * same fragment is fair — the reader chooses rather than reconstructs — so
 * words that only have collocations still get a blank-style drill.
 *
 * Antonyms are *not* used as distractors here: an antonym can genuinely fit a
 * collocation ("a plain suit" beside "a bespoke suit"), so it would not be a
 * clean wrong answer the way it is against a definition.
 */
export function buildFragmentCloze(word: SavedWord, pool: SavedWord[]): FragmentClozeDrill | undefined {
  const fragments = fragmentExamples(word)
  if (fragments.length === 0) return undefined

  const fragment = fragments[Math.floor(Math.random() * fragments.length)]
  const match = new RegExp(`\\b${escapeRegExp(word.word)}\\b`, 'i').exec(fragment)
  if (!match) return undefined

  const distractors = pickDistractors(word, pool, 3, { includeAntonyms: false })
  if (distractors.length < 3) return undefined

  return {
    kind: 'fragment-cloze',
    word,
    before: fragment.slice(0, match.index),
    after: fragment.slice(match.index + match[0].length),
    options: shuffle([word.word, ...distractors]),
    answer: word.word,
  }
}

export function buildOddOneOut(word: SavedWord, pool: SavedWord[]): OddOneOutDrill | undefined {
  const related = pickRandom(word.related, 3)
  if (related.length < 3) return undefined

  // The impostor comes from another saved word's related terms, so it reads
  // as a real word rather than an obviously synthetic one — and is checked
  // against this word's own related list so it cannot accidentally be a
  // legitimate answer too.
  const otherPool = pool.filter((candidate) => candidate.id !== word.id)
  const impostorCandidates = shuffle(otherPool.flatMap((candidate) => candidate.related)).filter(
    (term) =>
      !word.related.some((rel) => rel.toLowerCase() === term.toLowerCase()) &&
      term.toLowerCase() !== word.word.toLowerCase(),
  )
  const impostor = impostorCandidates[0]
  if (!impostor) return undefined

  return {
    kind: 'odd-one-out',
    word,
    options: shuffle([...related, impostor]),
    impostor,
  }
}

/**
 * Every drill a word has material for, in a fixed teaching order.
 *
 * Recall before recognition: definition match (type the word from its
 * meaning) and fill-blank (type it from a real sentence) come first, because
 * typing the word is the harder, more useful skill. The pick-from-four drills —
 * fragment cloze (the word in a masked phrase), synonym match, and odd-one-out —
 * come after, as a lighter follow-up rather than the main event.
 */
export function buildDrillsForWord(word: SavedWord, pool: SavedWord[]): Drill[] {
  const drills: Array<Drill | undefined> = [
    buildDefinitionMatch(word),
    buildFillBlank(word),
    buildFragmentCloze(word, pool),
    buildSynonymMatch(word, pool),
    buildOddOneOut(word, pool),
  ]
  return drills.filter((drill): drill is Drill => drill !== undefined)
}

/**
 * One card per drill, grouped by word — every drill for a word appears
 * consecutively, and the last card for each word carries its usage check-in.
 *
 * Words are shuffled so the session order varies; drills within a word are
 * not, since the teaching order in `buildDrillsForWord` is deliberate.
 */
export interface PracticeCard {
  word: SavedWord
  drill: Drill
  /** True on the last card for this word — the usage check-in appears after it. */
  isLastForWord: boolean
}

export function buildPracticeQueue(words: SavedWord[]): PracticeCard[] {
  const active = shuffle(words.filter((word) => !word.archived))
  const cards: PracticeCard[] = []

  for (const word of active) {
    const drills = buildDrillsForWord(word, words)
    drills.forEach((drill, index) => {
      cards.push({ word, drill, isLastForWord: index === drills.length - 1 })
    })
  }

  return cards
}

/* -------------------------------------------------------------------------- */

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Common, concrete words used as multiple-choice distractors when the library
 * is too small to supply them. Deliberately plain nouns unlikely to be a
 * synonym of saved vocabulary, so one can never become an accidental second
 * right answer. As the library grows, real saved words are preferred over these.
 */
const COMMON_WORDS: readonly string[] = [
  'table', 'river', 'window', 'garden', 'letter', 'morning', 'engine', 'market', 'picture', 'bottle',
  'pencil', 'jacket', 'mountain', 'kitchen', 'bicycle', 'camera', 'blanket', 'ladder', 'harbor', 'orchard',
  'candle', 'saddle', 'wagon', 'kettle', 'meadow', 'lantern', 'cabinet', 'anchor', 'pebble', 'ribbon',
  'drawer', 'cottage', 'pillow', 'basket', 'compass', 'feather', 'teapot', 'satchel', 'gravel', 'thicket',
  'saucer', 'doorway', 'chimney', 'curtain', 'pavement', 'notebook', 'railing', 'pantry', 'trolley', 'hillside',
]

/**
 * Wrong-answer terms for a multiple-choice drill, drawn in preference order and
 * deduped case-insensitively: (antonyms →) other saved words → the common-word
 * list. Never a synonym or related term of the word — either could be a second
 * correct answer. The common-word tail guarantees three distractors are
 * reachable even with a single saved word.
 */
function pickDistractors(
  word: SavedWord,
  pool: SavedWord[],
  count: number,
  options: { includeAntonyms: boolean },
): string[] {
  // Seeded with everything a distractor must not be; grows as picks are taken,
  // so it also dedupes across tiers.
  const blocked = new Set<string>([
    word.word.toLowerCase(),
    ...word.synonyms.map((term) => term.toLowerCase()),
    ...word.related.map((term) => term.toLowerCase()),
  ])

  const savedTerms = pool
    .filter((candidate) => candidate.id !== word.id)
    .map((candidate) => candidate.word)

  const tiers: string[][] = [
    ...(options.includeAntonyms ? [shuffle(word.antonyms)] : []),
    shuffle(savedTerms),
    shuffle([...COMMON_WORDS]),
  ]

  const distractors: string[] = []
  for (const tier of tiers) {
    for (const term of tier) {
      const trimmed = term.trim()
      if (!trimmed) continue
      const lower = trimmed.toLowerCase()
      if (blocked.has(lower)) continue
      blocked.add(lower)
      distractors.push(trimmed)
      if (distractors.length === count) return distractors
    }
  }

  return distractors
}

/** Whole-word, case-insensitive test for a term inside a definition. */
function definitionContains(definition: string, term: string): boolean {
  return new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i').test(definition)
}

function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function pickRandom<T>(items: readonly T[], count: number): T[] {
  return shuffle(items).slice(0, count)
}

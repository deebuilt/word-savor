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

export type DrillKind = 'definition-match' | 'fill-blank' | 'synonym-match' | 'odd-one-out'

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

export type Drill = DefinitionMatchDrill | FillBlankDrill | SynonymMatchDrill | OddOneOutDrill

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
  const wordPattern = new RegExp(`\\b${escapeRegExp(word.word)}\\b`, 'i')
  const seen = new Set<string>()
  const examples: string[] = []

  for (const sense of word.senses) {
    for (const example of sense.examples) {
      const trimmed = example.trim()
      if (!wordPattern.test(trimmed)) continue
      if (!/^[A-Z]/.test(trimmed) || !/[.?!]$/.test(trimmed)) continue
      if (trimmed.split(/\s+/).length < 4) continue
      const key = trimmed.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      examples.push(trimmed)
    }
  }

  return examples
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
  const answer = word.synonyms[0]
  if (!definition || !answer) return undefined

  // Distractors: other saved words' display forms, never a synonym of this
  // one — Datamuse's associations overlap enough that a second correct answer
  // is a real risk otherwise.
  const distractorPool = pool
    .filter((candidate) => candidate.id !== word.id)
    .map((candidate) => candidate.word)
    .filter((term) => !word.synonyms.some((syn) => syn.toLowerCase() === term.toLowerCase()))

  const distractors = pickRandom(distractorPool, 3)
  if (distractors.length < 3) return undefined

  return {
    kind: 'synonym-match',
    word,
    definition,
    options: shuffle([answer, ...distractors]),
    answer,
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
 * typing the word is the harder, more useful skill. Synonym match and
 * odd-one-out — pick from four — come after, as a lighter follow-up rather
 * than the main event.
 */
export function buildDrillsForWord(word: SavedWord, pool: SavedWord[]): Drill[] {
  const drills: Array<Drill | undefined> = [
    buildDefinitionMatch(word),
    buildFillBlank(word),
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

import type { DrillKind, SavedWord, Sense } from '../types/domain'
import { favoriteDefinition, favoriteSense } from './senses'

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

/**
 * Re-exported from the stored types, where it is defined.
 *
 * `DrillResult` writes this string to the database, so its home is beside the
 * other stored shapes rather than here among the builders that produce them.
 * Kept exported from this module because every drill below is discriminated on
 * it, and reading `puzzles.ts` should not mean chasing the union elsewhere.
 */
export type { DrillKind }

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
  /** The part of speech both `definition` and `answer` belong to. */
  partOfSpeech: string
  /** One correct synonym among the options, shuffled in. */
  options: string[]
  answer: string
  /**
   * Every synonym for this part of speech — what the answer strip shows.
   *
   * Not the word's whole synonym list: under a verb definition, the adjective's
   * synonyms are not a bonus, they are the same mismatch the drill was fixed to
   * stop making, printed as a reference.
   */
  senseSynonyms: string[]
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

/**
 * The starred definition, not the dictionary's first one.
 *
 * This is the drill the favourite star exists for. A dictionary leads with the
 * meaning it judges most prominent, which is often not the meaning the reader
 * met the word in: *precipitate* leads with "to throw or hurl", while the sense
 * worth drilling is "to bring about suddenly". Drilling the wrong one is not a
 * harder question, it is practice spent on a meaning the reader does not use.
 *
 * Unstarred words are unaffected — `favoriteDefinition` falls back to the first
 * sense, which is what this read before.
 */
export function buildDefinitionMatch(word: SavedWord): DefinitionMatchDrill | undefined {
  const definition = favoriteDefinition(word)
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

/** One sense's definition and the terms that belong to it, chosen together. */
interface SensePair {
  definition: string
  partOfSpeech: string
  answer: string
  senseSynonyms: string[]
  /** This part of speech's antonyms — the only ones that test anything here. */
  senseAntonyms: string[]
}

/**
 * A definition paired with a synonym that genuinely belongs to it.
 *
 * The pairing is the whole drill. Showing "to throw violently, hurl" and
 * accepting "cursory" is not a hard question, it is a wrong one — those are the
 * verb and the adjective senses of *precipitate*, and nothing about the first
 * makes the second correct. So the definition is not chosen first and the
 * answer fitted to it; both are chosen together, from one part of speech.
 *
 * Senses are walked in the dictionary's own order, so the primary sense is
 * still preferred — it just yields to a later one rather than answering with
 * another sense's synonym. A word whose grouped terms cover none of its senses
 * gets no drill at all: an honest omission, where a mismatched pairing would be
 * a small lie told confidently.
 *
 * **The starred sense goes first in that walk.** Otherwise a word with a
 * favourite is drilled on the starred meaning by definition-match and on the
 * dictionary's leading meaning by this one, in the same session — and the
 * reader, having said which meaning they care about, is still answering
 * questions about the other. It stays a preference rather than a filter: a
 * starred sense the thesaurus has no terms for yields to one that has them,
 * because a drill that can be built honestly beats no drill.
 */
function pickSensePair(word: SavedWord): SensePair | undefined {
  const groups = word.synonymsByPartOfSpeech
  if (!groups || groups.length === 0) return undefined

  for (const sense of sensesFavoriteFirst(word)) {
    if (!sense.definition) continue
    const group = groups.find(
      (candidate) => candidate.partOfSpeech.toLowerCase() === sense.partOfSpeech.toLowerCase(),
    )
    if (!group) continue

    // Skip any synonym that already appears in the definition — "custom" as the
    // answer to "custom made" gives itself away in the prompt. Whole-word and
    // case-insensitive.
    const answer = group.synonyms.find((synonym) => !definitionContains(sense.definition, synonym))
    if (answer) {
      return {
        definition: sense.definition,
        partOfSpeech: sense.partOfSpeech,
        answer,
        senseSynonyms: group.synonyms,
        senseAntonyms: group.antonyms,
      }
    }
  }

  return undefined
}

/**
 * The word's senses with the starred one moved to the front.
 *
 * A reordering rather than a filter, so every caller keeps its existing
 * fallback behaviour intact — the list is the same length and holds the same
 * senses, and a walk that used to stop at the dictionary's first now stops at
 * the reader's choice, then continues exactly as before. Unstarred words, and
 * stars that no longer match a sense, come back in the original order.
 */
function sensesFavoriteFirst(word: SavedWord): Sense[] {
  const starred = word.favoriteSenseRef ? favoriteSense(word) : undefined
  if (!starred) return word.senses
  return [starred, ...word.senses.filter((sense) => sense !== starred)]
}

/*
 * No `pool` parameter, unlike its neighbours: this drill deliberately draws
 * none of its wrong answers from the rest of the library. See
 * `pickSynonymDistractors`.
 */
export function buildSynonymMatch(word: SavedWord): SynonymMatchDrill | undefined {
  const pair = pickSensePair(word)
  if (!pair) return undefined

  const distractors = pickSynonymDistractors(
    word,
    3,
    pair.definition,
    pair.senseSynonyms,
    pair.senseAntonyms,
  )
  if (distractors.length < 3) return undefined

  return {
    kind: 'synonym-match',
    word,
    definition: pair.definition,
    partOfSpeech: pair.partOfSpeech,
    options: shuffle([pair.answer, ...distractors]),
    answer: pair.answer,
    senseSynonyms: pair.senseSynonyms,
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

  const distractors = pickClozeDistractors(word, pool, 3)
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
    buildSynonymMatch(word),
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

/**
 * The queue, from words already chosen and already in order.
 *
 * **The caller decides the order and this only expands each word into its
 * drills.** It used to shuffle the whole library itself, which was right while
 * a session *was* the whole library. Once a session became a selection the
 * shuffle became wrong twice over: a card's order is part of what it selected
 * ("10 most overdue" means those ten, most overdue first), and a resumed
 * session re-shuffled would hand back a different run at the same step index.
 *
 * `pool` stays the whole library, because distractors should be drawn from
 * every word there is rather than from the handful being practiced — a
 * four-word session whose wrong answers are the other three words is a
 * process-of-elimination test.
 */
export function buildQueueFor(words: SavedWord[], pool: SavedWord[]): PracticeCard[] {
  const cards: PracticeCard[] = []

  for (const word of words) {
    if (word.archived) continue
    const drills = buildDrillsForWord(word, pool)
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
 * Wrong answers for **synonym-match**, in descending order of how much they
 * actually test.
 *
 * Other saved words are pointedly *not* a source here. Against "to throw
 * violently, hurl", a library of obfuscate / coalesce / epigraph does not ask
 * what *precipitate* means — it asks which option looks unfamiliar. Three words
 * you have seen before and one you have not is a recognition test wearing a
 * comprehension test's clothes, and it is passable without reading the
 * definition at all.
 *
 * So the sources, best first:
 *
 * 1. **Related terms** (`word.related`) — Datamuse means-like words. Sitting in
 *    the same meaning-neighbourhood as the word without being synonyms of it,
 *    which is the precise definition of a wrong answer worth considering.
 * 2. **Other senses' synonyms** — for *precipitate*'s verb sense, the noun's
 *    "consequence" and the adjective's "hasty". These test whether the reader
 *    noticed *which sense* is on trial, which the card now labels. The hardest
 *    and most educational tier.
 * 3. **This sense's antonyms** — a fair test against a definition, and the one
 *    tier where being wrong is the whole point.
 * 4. **Common words** — the floor, so three distractors are always reachable.
 *    Plain nouns that can never be an accidental second right answer.
 *
 * Note tier 1 deliberately spends terms that `buildOddOneOut` treats as
 * *correct* answers — there, belonging to the word is the point; here, not
 * being a synonym is. Same list, two honest readings of it.
 */
function pickSynonymDistractors(
  word: SavedWord,
  count: number,
  definition: string,
  senseSynonyms: string[],
  senseAntonyms: string[],
): string[] {
  const senseSynonymSet = new Set(senseSynonyms.map((term) => term.toLowerCase()))

  /*
   * Two things disqualify a wrong answer, and both are about it being *too
   * right* rather than too easy:
   *
   * - **Any** of the word's synonyms, from any sense — not just this sense's.
   *   Datamuse's related terms overlap MW's thesaurus heavily, so without this,
   *   *coalesce* ("to grow together") offered `merge` and `conflate` as wrong
   *   answers beside `associate` as the right one. Three defensible answers and
   *   one scored correct is not a question.
   * - **Any word inside the definition itself.** *Obfuscate* is defined as "to
   *   throw into shadow : darken", and `darken` arrived from Datamuse as a
   *   distractor — printed in the prompt and marked wrong underneath it.
   *
   * This costs tier 2 most of its material, which is the right trade: the ideal
   * hard distractor and an unfair one are separated by a line too fine to draw
   * reliably, and being confusingly wrong is worse than being slightly easy.
   */
  const blocked = new Set<string>([
    word.word.toLowerCase(),
    ...senseSynonymSet,
    ...word.synonyms.map((term) => term.toLowerCase()),
  ])

  const otherSenseSynonyms = (word.synonymsByPartOfSpeech ?? [])
    .flatMap((group) => group.synonyms)
    .filter((term) => !senseSynonymSet.has(term.toLowerCase()))

  /*
   * Related terms are only safe for a word whose meanings genuinely diverge.
   *
   * Datamuse `ml=` returns *means-like* terms, and for a word with one tight
   * meaning "means-like" and "synonym" are the same set — so *obfuscate* ("to
   * throw into shadow") draws `obscure` and `confound` as wrong answers that
   * are not wrong. No filter separates those, because the difference is not in
   * the data: MW simply did not list them, and absence from a thesaurus is not
   * evidence of a different meaning.
   *
   * Where the word has several parts of speech, the related list spans them,
   * and a term belonging to another sense is a real wrong answer — *hasty* and
   * *hurry* against *precipitate*'s "to throw violently" are exactly the
   * confusion worth drilling. So the tier is spent only when the word is
   * polysemous, and single-sense words fall through to plain common words:
   * an easier question, but an answerable one.
   */
  const isPolysemous = (word.synonymsByPartOfSpeech ?? []).length > 1
  const relatedTier = isPolysemous ? word.related : []

  const tiers: string[][] = [
    shuffle(relatedTier),
    shuffle(otherSenseSynonyms),
    shuffle(senseAntonyms),
    shuffle([...COMMON_WORDS]),
  ].map((tier) => tier.filter((term) => !definitionContains(definition, term)))

  return takeFromTiers(tiers, count, blocked)
}

/**
 * Wrong answers for **fragment-cloze**, where the blank wants a real word.
 *
 * Saved words are right here and wrong in synonym-match, because the two drills
 * ask different questions. "A ___ suit" is filled by a word, and the other
 * words in the library are exactly the pool worth choosing from; there is no
 * definition to reason against, so an unfamiliar option is not a giveaway.
 *
 * Antonyms are not used: an antonym can genuinely fit a collocation ("a plain
 * suit" beside "a bespoke suit"), so it is not a clean wrong answer.
 */
function pickClozeDistractors(word: SavedWord, pool: SavedWord[], count: number): string[] {
  const blocked = new Set<string>([
    word.word.toLowerCase(),
    ...word.synonyms.map((term) => term.toLowerCase()),
    ...word.related.map((term) => term.toLowerCase()),
  ])

  const savedTerms = pool
    .filter((candidate) => candidate.id !== word.id)
    .map((candidate) => candidate.word)

  return takeFromTiers([shuffle(savedTerms), shuffle([...COMMON_WORDS])], count, blocked)
}

/**
 * Walk tiers in order, taking terms that are not blocked, until `count` is
 * reached. `blocked` grows as picks are taken, so it dedupes across tiers too.
 */
function takeFromTiers(tiers: string[][], count: number, blocked: Set<string>): string[] {
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

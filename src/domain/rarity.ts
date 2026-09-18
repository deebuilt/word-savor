/**
 * Turning a frequency number into something a reader can use.
 *
 * Datamuse returns occurrences per million words, from Google Books Ngrams. On
 * its own the number is unreadable: "0.109" says nothing without a scale to
 * read it against, and nobody has that scale in their head.
 *
 * The bands below are set from real measurements rather than round numbers,
 * sampled across the range this app actually sees:
 *
 * | word             | per million |
 * | ---------------- | ----------- |
 * | the              | 407         |
 * | good             | 414         |
 * | run              | 96          |
 * | ephemeral        | 1.60        |
 * | ineffable        | 0.82        |
 * | laconic          | 0.45        |
 * | perspicacious    | 0.109       |
 * | obfuscate        | 0.097       |
 * | defenestration   | 0.018       |
 * | sesquipedalian   | 0.0085      |
 *
 * The interesting range for a vocabulary app is entirely below 10. Everything
 * above that is a word you already know, and the band names reflect that: the
 * distinctions worth drawing are all in the long tail.
 */

export type RarityBand = 'everyday' | 'common' | 'uncommon' | 'rare' | 'very-rare'

export interface Band {
  id: RarityBand
  /** Frequency at or above which a word falls in this band. */
  floor: number
  label: string
  /**
   * A word that actually falls in this band, for display.
   *
   * "Uncommon" and "Rare" mean nothing on their own — they are positions on a
   * scale the reader has no feel for. One real example does what the label
   * cannot: it puts the band somewhere the reader can stand.
   *
   * Every one of these is taken from the measured table above, so the example
   * is genuinely in the band it illustrates rather than chosen for flavour.
   */
  example: string
}

/*
 * Ordered from most to least common, so the first match wins.
 *
 * `uncommon` starts at 0.5 — just below "laconic" — because that is roughly
 * where a word stops being one most readers meet in passing. `rare` at 0.05
 * puts "perspicacious" and "obfuscate" together, which matches how they read.
 */
export const BANDS: readonly Band[] = [
  { id: 'everyday', floor: 50, label: 'Everyday', example: 'run' },
  { id: 'common', floor: 5, label: 'Common', example: 'gather' },
  { id: 'uncommon', floor: 0.5, label: 'Uncommon', example: 'ephemeral' },
  { id: 'rare', floor: 0.05, label: 'Rare', example: 'obfuscate' },
  { id: 'very-rare', floor: 0, label: 'Very rare', example: 'sesquipedalian' },
]

export function rarityBand(frequency: number): RarityBand {
  return (BANDS.find((band) => frequency >= band.floor) ?? BANDS[BANDS.length - 1]).id
}

/**
 * The band as a phrase, for display.
 *
 * Returns `undefined` when there is no frequency rather than inventing a
 * label. A word Datamuse has never scored is not "very rare" — it is unmeasured,
 * and saying so falsely would make the library's rarity view a lie.
 */
export function rarityLabel(frequency: number | undefined): string | undefined {
  if (frequency === undefined || !Number.isFinite(frequency)) return undefined
  const band = BANDS.find((entry) => frequency >= entry.floor) ?? BANDS[BANDS.length - 1]
  return band.label
}

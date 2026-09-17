import type { SavedWord } from '../types/domain'
import { getCachedLookup, getDB } from './db'
import { lookupMerriamThesaurus, parseMerriamThesaurus } from '../api/merriam'

/**
 * One-time backfills for words already in the library.
 *
 * A schema change is easy; a schema change against a database that already
 * holds someone's vocabulary is the part that needs care. These run after the
 * database opens rather than inside IndexedDB's `upgrade` callback, and that
 * placement is deliberate: an upgrade transaction cannot await a network call
 * without deadlocking, and it holds locks on every store while it runs. A
 * backfill that may need to fetch belongs outside it.
 *
 * Every migration here is written to be safe to run twice. They are skipped
 * per-word by checking whether the work is already done, so an interrupted run
 * — a closed tab, a dropped connection — simply finishes next launch.
 */

/**
 * Give already-saved words their part-of-speech synonym grouping.
 *
 * Words saved before the grouping existed carry only the flat `synonyms` list,
 * which is what let synonym-match show a *verb* definition and accept an
 * *adjective* synonym. Without this backfill those words would simply stop
 * getting the drill — the builder skips a word it cannot group — so the fix
 * would quietly cost the existing library a drill instead of repairing it.
 *
 * Mostly free: the raw thesaurus payload is already cached per word, and the
 * parser is a pure function of it, so re-deriving the grouping is a local read
 * and a re-parse with no network at all. Only words whose thesaurus never
 * answered need a fetch, and a word that has no thesaurus entry is marked with
 * an empty array so it is not retried on every launch.
 *
 * Returns how many words were touched, which the caller logs — a silent
 * migration is one you cannot tell succeeded.
 */
export async function backfillSynonymGroups(): Promise<number> {
  const db = await getDB()
  const words = await db.getAll('words')

  // `undefined` means never parsed; `[]` means parsed and genuinely empty.
  // Only the first needs work, which is what makes a second run cheap.
  const pending = words.filter((word) => word.synonymsByPartOfSpeech === undefined)
  if (pending.length === 0) return 0

  let updated = 0
  for (const word of pending) {
    const groups = await deriveSynonymGroups(word)
    // Written even when empty: the empty array is the record that this word was
    // looked at and had nothing, which is what stops it being retried forever.
    await db.put('words', { ...word, synonymsByPartOfSpeech: groups })
    updated += 1
  }

  return updated
}

/**
 * The grouped terms for one word — cache first, network only if it must.
 *
 * Failure is answered with an empty array rather than a throw. A word that
 * cannot be grouped loses its synonym-match drill and keeps everything else;
 * letting the error escape would abort the backfill for every word behind it,
 * which is a far worse trade.
 */
async function deriveSynonymGroups(word: SavedWord): Promise<SavedWord['synonymsByPartOfSpeech']> {
  try {
    const cached = await getCachedLookup(`merriam-thesaurus:${word.id}`)
    if (cached) {
      const parsed = parseMerriamThesaurus(
        cached.payload as Parameters<typeof parseMerriamThesaurus>[0],
        word.id,
      )
      if (parsed) return parsed.byPartOfSpeech
      return []
    }

    // No cached payload — the thesaurus did not answer when this word was
    // saved. Fetch it once. At a library of a few dozen words this is seconds,
    // and it only ever happens for the gaps.
    const fetched = await lookupMerriamThesaurus(word.id)
    return fetched?.byPartOfSpeech ?? []
  } catch {
    return []
  }
}

/**
 * Run every pending migration, once per launch.
 *
 * Deliberately not awaited by the UI: the library renders from what is already
 * on disk, and a backfill that may touch the network should never be the reason
 * the first screen is blank. Words gain their grouping in the background and the
 * practice queue picks it up on its next build.
 */
export async function runMigrations(): Promise<void> {
  try {
    const grouped = await backfillSynonymGroups()
    if (grouped > 0) {
      console.info(`[wordsavor] Grouped synonyms by part of speech for ${grouped} word(s).`)
    }
  } catch (error) {
    // A failed migration must not take the app down with it. The affected words
    // keep their flat synonym list and lose only the synonym-match drill.
    console.warn('[wordsavor] Migration failed; continuing.', error)
  }
}

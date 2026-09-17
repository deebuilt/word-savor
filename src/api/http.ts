/**
 * Shared fetch plumbing for the three dictionary sources.
 *
 * Every source here is a free, unauthenticated, third-party endpoint with no
 * uptime promise, and one of them (dictionaryapi.dev) was measured returning
 * HTTP 522 for one word while answering another in the same second. So the
 * rule for this whole layer is: a source that is slow or down degrades the
 * result, it never hangs the app.
 *
 * That is what `timeout` is for. `fetch` on its own has no timeout at all — a
 * request to a dead origin stays pending until the browser gives up, which on
 * mobile can be a minute or more. Every call here carries an AbortSignal.
 */

interface FetchJsonOptions {
  /** Milliseconds before the request is aborted. */
  timeout: number
  source: string
}

/**
 * GET JSON, with a hard timeout.
 *
 * Returns `null` rather than throwing on any network-level failure — an
 * offline device, a dead origin, a timeout, unparseable JSON. Callers decide
 * what a missing source means, and for two of the three the answer is "carry
 * on without it".
 *
 * `AbortSignal.timeout` would be shorter, but it is unsupported on older
 * mobile Safari, which is squarely in this app's audience.
 */
export async function fetchJson<T>(
  url: string,
  { timeout, source }: FetchJsonOptions,
): Promise<T | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
  }, timeout)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) {
      warn(source, `HTTP ${response.status}`)
      return null
    }
    return (await response.json()) as T
  } catch (error) {
    // Aborted, offline, DNS failure, or malformed JSON. All of them mean the
    // same thing to a caller: this source has nothing for us right now.
    warn(source, error instanceof Error ? error.name : 'failed')
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Note a source failing, in development only.
 *
 * Every failure here is deliberately swallowed — two of the three sources are
 * optional and a save must not break because one is down. That silence is right
 * for the reader and wrong for whoever is debugging why a word saved with no
 * rarity, so the reason is logged where it helps and dropped in production.
 *
 * `console.info` rather than `warn`: a slow third-party dictionary is expected
 * behaviour, not a defect, and it should not colour the console red.
 */
function warn(source: string, reason: string): void {
  if (import.meta.env.DEV) {
    console.info(`[wordsavor] ${source} unavailable (${reason})`)
  }
}

/**
 * Timeouts, per source.
 *
 * The Merriam-Webster calls go through the app's own proxy, which edge-caches
 * responses — so a repeat lookup is fast and even a cold one is a single hop to
 * a reliable origin. The dictionary call is the required one and gets the
 * longest leash; the thesaurus is optional and gets less.
 */
export const TIMEOUT = {
  /** Merriam-Webster definitions, audio, etymology. A save needs this. */
  dictionary: 12_000,
  /** Merriam-Webster synonyms and antonyms. Optional. */
  thesaurus: 8_000,
  /** Datamuse associations and rarity. Fast and reliable in practice. */
  datamuse: 8_000,
} as const

/** Lowercased and trimmed: the canonical key form, matching `SavedWord.id`. */
export function normaliseWord(raw: string): string {
  return raw.trim().toLowerCase()
}

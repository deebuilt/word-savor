/**
 * The share-target entry point.
 *
 * The manifest registers WordSavor as a share destination at `/share`, so
 * highlighting a word in any app and sending it here opens the app with the
 * selection in the query string. That is the shortest capture path in the
 * product — no typing, no spelling a word you only heard.
 *
 * **Why this is not a route.** The app has no router, and `/share` is a single
 * entry point rather than a destination: the app reads the parameters once at
 * boot, opens Look Up with the word in the field, and rewrites the URL back to
 * the root. Nothing navigates, and there is nothing to navigate back to.
 *
 * **Why the URL is rewritten.** Left alone, `/share?text=…` is what the browser
 * would reload on refresh and what the PWA would restore on relaunch — the app
 * would reopen holding a word shared days ago. `replaceState` clears it without
 * adding a history entry.
 */

export interface SharedCapture {
  /** The word to look up. */
  word: string
  /** The sentence it came in, when the share carried more than one word. */
  context?: string
}

/**
 * Read a shared word out of the current URL, if this load came from a share.
 *
 * Returns `undefined` for an ordinary load. Safe to call unconditionally at
 * boot, which is the point — the caller should not have to know how the app
 * was opened.
 */
export function readSharedCapture(): SharedCapture | undefined {
  const { pathname, search } = window.location
  if (!pathname.endsWith('/share')) return undefined

  const params = new URLSearchParams(search)
  /*
   * Android sends the selection in `text`; some apps put it in `title`, and a
   * share from a browser page sends `url` with the page address. Title first,
   * because an app that sets both usually means `title` as the selection and
   * `text` as surrounding content.
   */
  const raw = params.get('title')?.trim() || params.get('text')?.trim() || ''
  if (!raw) return undefined

  return extractWord(raw)
}

/** Clear the share parameters so a refresh does not replay the capture. */
export function clearShareUrl(): void {
  window.history.replaceState({}, '', '/')
}

/**
 * Pull a single word out of whatever was shared.
 *
 * A share is rarely one clean word. Highlighting in a reader app usually
 * catches surrounding punctuation, and sharing from a podcast transcript can
 * send a whole sentence. Both are useful: the word goes to the lookup, and a
 * sentence long enough to be a sentence is kept as the encounter, which is
 * exactly the context that is otherwise lost.
 *
 * When several words arrive, the longest is taken. A shared phrase is almost
 * always being shared for its least common word, and the longest word is a
 * decent proxy for that without a second network call.
 */
function extractWord(raw: string): SharedCapture | undefined {
  // Strip anything that is not a letter, an apostrophe, or a hyphen — quotation
  // marks, trailing commas, and stray brackets all come along with a selection.
  const words = raw
    .split(/\s+/)
    .map((token) => token.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ''))
    .filter((token) => token.length > 0)

  if (words.length === 0) return undefined
  if (words.length === 1) return { word: words[0] }

  const longest = words.reduce((best, token) => (token.length > best.length ? token : best))

  return {
    word: longest,
    // Only kept when what arrived reads as a sentence rather than a stray pair
    // of words — otherwise the encounter would be noise rather than context.
    context: words.length >= 4 ? raw.trim() : undefined,
  }
}

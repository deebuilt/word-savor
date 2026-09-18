/**
 * The share-target entry point.
 *
 * The manifest registers WordSavor as a share destination at `/share`, so
 * highlighting a word in any app and sending it here opens the app with the
 * selection in the query string. That is the shortest capture path in the
 * product — no typing, no spelling a word you only heard.
 *
 * **This module parses; it does not navigate.** `/share` is a route now, and
 * `ShareRoute` owns what happens next — it reads a capture out of the address
 * and redirects to Look Up carrying it. Keeping the parsing here and the
 * navigation there is what lets the rules below be read and changed on their
 * own: which parameter wins, what counts as a word, when a share is long enough
 * to be worth keeping as context.
 *
 * **On the URL not being rewritten any more.** It used to be, with
 * `replaceState`, because `/share?text=…` was what a refresh would reload and
 * what the PWA would restore on relaunch — the app would reopen holding a word
 * shared days ago. The redirect replaces that history entry instead, which
 * solves the same problem as a consequence of navigating rather than as a
 * separate step that had to be remembered.
 */

export interface SharedCapture {
  /** The word to look up. */
  word: string
  /** The sentence it came in, when the share carried more than one word. */
  context?: string
}

/**
 * Read a shared word out of a query string.
 *
 * Returns `undefined` when there is nothing usable in it — an empty selection,
 * or a share that carried only an image.
 *
 * Takes the query string rather than reading `window.location`, so what is
 * parsed is the address the caller means. The caller is the `/share` route,
 * which has the current location already; the old version read the window and
 * checked the path itself, because at the time there was no route to be sure it
 * was on.
 */
export function readSharedCapture(search: string): SharedCapture | undefined {
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

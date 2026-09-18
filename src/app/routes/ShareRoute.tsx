import { Navigate, useLocation } from 'react-router'
import { readSharedCapture } from '../../domain/shareTarget'

/**
 * `/share` — the OS share-sheet entry point.
 *
 * Not a destination. Highlighting a word in any app and sending it here opens
 * the app at this address with the selection in the query string; this reads it
 * and hands it to Look Up. Nothing renders, and nothing navigates *to* it.
 *
 * **What the router changed.** The capture used to be read at module load, in a
 * constant beside the shell, because there was nowhere else for it to go: the
 * app had to know before its first render which tab to open, and it had to
 * rewrite the URL itself so a refresh would not replay a word shared days ago.
 *
 * Both jobs are the router's now. The address *is* the tab, so `/share`
 * redirecting to `/lookup` is the whole of "open Look Up with this word", and
 * `replace` is the whole of "do not leave this in the history" — a Back from
 * Look Up returns to whatever was open before the share rather than bouncing
 * through the capture again.
 *
 * **Why the capture is read here rather than at module load.** A module-level
 * read happens once per page load, which made a second share into an already
 * running app invisible — and an installed PWA is exactly the case where the
 * app is already running. Reading it in the route means every arrival at this
 * address is a fresh capture, which is what someone sharing a second word
 * expects.
 *
 * `search` comes from the router's location rather than `window.location`, so
 * the read is of the address the app is actually on.
 */
export function ShareRoute() {
  const { search } = useLocation()

  const shared = readSharedCapture(search)

  /*
   * A share with nothing usable in it — an empty selection, or a share of an
   * image — still opened the app, and the reader is here. Look Up with an empty
   * field is the right place to land: it is where they were going, and the
   * failure was the share sheet's rather than theirs.
   */
  return <Navigate to="/lookup" replace state={shared ? { shared } : undefined} />
}

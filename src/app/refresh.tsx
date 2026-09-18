import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { listDueWords } from '../storage/db'
import { RefreshContext } from './refreshContext'

/**
 * The cross-screen refresh signals, in one place.
 *
 * These used to be three `useState` counters in the shell, threaded down as
 * props: `refreshToken` to Library, `refreshToken` to Progress, `onSaved` and
 * `onProgress` back up. That worked while the shell rendered every screen
 * itself and could hand each one exactly what it needed.
 *
 * The router renders the screens now, and a route element takes no props from
 * the thing that decided to render it. The choice is to thread the same values
 * through every route element by hand, or to put them somewhere both ends can
 * reach. This is that somewhere.
 *
 * **Why tokens rather than the data itself.** Each screen still owns its own
 * query — Library reads the words it lists including the search filter,
 * Progress reads sessions and usages. Lifting those reads up here would make
 * every screen depend on a list only one of them uses, and it would re-read
 * everything whenever anything changed. A token says only "what you have is
 * stale", and the screen that cares decides what to do about it.
 *
 * **Why the due count is real data and not a token.** It is read here because
 * it is displayed here — the badge lives on the nav, which is shell chrome, not
 * a screen. Nothing else reads it.
 */

export function RefreshProvider({ children }: { children: ReactNode }) {
  const [libraryToken, setLibraryToken] = useState(0)
  const [progressToken, setProgressToken] = useState(0)
  const [dueCount, setDueCount] = useState(0)

  /*
   * Re-read after a change rather than adjusted locally: a save can also be a
   * word that was already in the library, and a counter that assumes every save
   * is a new word drifts from the truth with no way to notice.
   */
  const refreshCounts = useCallback(async () => {
    const due = await listDueWords()
    setDueCount(due.length)
  }, [])

  useEffect(() => {
    void refreshCounts()
  }, [refreshCounts])

  const onSaved = useCallback(() => {
    void refreshCounts()
    setLibraryToken((token) => token + 1)
    setProgressToken((token) => token + 1)
  }, [refreshCounts])

  const onProgressed = useCallback(() => {
    void refreshCounts()
    setProgressToken((token) => token + 1)
  }, [refreshCounts])

  const onDeleted = useCallback(() => {
    void refreshCounts()
    setLibraryToken((token) => token + 1)
    setProgressToken((token) => token + 1)
  }, [refreshCounts])

  const value = useMemo(
    () => ({ libraryToken, progressToken, dueCount, onSaved, onProgressed, onDeleted }),
    [libraryToken, progressToken, dueCount, onSaved, onProgressed, onDeleted],
  )

  return <RefreshContext value={value}>{children}</RefreshContext>
}


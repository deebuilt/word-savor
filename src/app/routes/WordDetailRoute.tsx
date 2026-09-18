import { useCallback } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router'
import { WordDetail } from '../../screens/WordDetail'
import { useRefresh } from '../refreshContext'

/**
 * `/library/:wordId` — one word, opened from the library or from another word.
 *
 * **This replaces the word stack, and the history is the stack now.**
 *
 * The shell used to hold an array of open word ids. A related-word popup could
 * open a second word's detail on top of the first, and a synonym's synonym
 * could do it again; Back popped one level, so the trail a reader followed
 * through a chain of synonyms was the trail they could retrace.
 *
 * Pushing a route per word gives the same trail for free, and gives it to the
 * *browser's* Back as well — the device back button, the back gesture, and the
 * button on the screen are now one behaviour rather than three. That was the
 * part local state could never have: a phone's back gesture had no idea the
 * stack existed, so on an installed PWA it closed the app from three words
 * deep.
 *
 * **Why the previous word travels in history state.** The back button is
 * labelled with the word beneath this one — "sagacious" rather than a blanket
 * "Library" — so the reader can see what Back means before tapping it. The
 * route only knows the word it is showing, and the one below it is not
 * recoverable from the URL.
 *
 * It rides along in the history entry instead. That is exactly where it
 * belongs: it is a fact about *how this screen was reached*, which is what a
 * history entry is. It survives a Back and a Forward because the browser
 * restores the entry's state with it, and a reload of a deep link simply has
 * none — which is correct, since a link opened cold has nothing beneath it and
 * Back does mean Library.
 */

/** What a word-detail entry remembers about where it came from. */
interface WordDetailState {
  /** The word this one was opened from, if it was opened from another word. */
  from?: string
}

export function WordDetailRoute() {
  const { wordId } = useParams()
  const { state } = useLocation()
  const { onSaved, onDeleted } = useRefresh()
  const navigate = useNavigate()

  const from = (state as WordDetailState | null)?.from

  const openWord = useCallback(
    (next: string) => {
      // Push, so Back returns here rather than to the library — the trail is
      // the point. `from` is this word, which becomes the next screen's label.
      void navigate(`/library/${next}`, { state: { from: wordId } satisfies WordDetailState })
    },
    [navigate, wordId],
  )

  /*
   * Back goes back, rather than to a computed address.
   *
   * `navigate(-1)` pops the entry this screen was pushed onto, which is the
   * only thing that keeps the on-screen button and the device's own back
   * gesture doing the same thing. Navigating to `/library` instead would leave
   * the detail in the history, so the gesture would return to the word the
   * button just left.
   *
   * The floor is the exception: a deep link opened cold has nothing behind it
   * in this app, and going back would leave the site entirely.
   */
  const back = useCallback(() => {
    if (from) {
      void navigate(-1)
      return
    }
    // No trail — either the library is behind us, or this was opened cold.
    void navigate('/library', { replace: true })
  }, [navigate, from])

  const handleDeleted = useCallback(() => {
    onDeleted()
    /*
     * `replace`, and all the way to the library rather than one step back.
     *
     * The deleted word may appear several times in the trail — a reader can
     * reach the same word from two different synonyms — and every one of those
     * entries now points at something that no longer exists. Going back one
     * would land on a word that renders "no longer in your library", which is a
     * confusing way to be told a delete worked.
     */
    void navigate('/library', { replace: true })
  }, [navigate, onDeleted])

  /*
   * A route with no id is not reachable through the route table, but a
   * hand-typed `/library/` is. Send it to the list rather than rendering a
   * detail screen with nothing to detail.
   */
  if (!wordId) return <Navigate to="/library" replace />

  return (
    <WordDetail
      /* Keyed on the word so opening a different one remounts rather than
         showing the previous word's content while it loads. The router reuses
         the element across a param change, so without this a push from one word
         to another would keep the old word on screen until the new one read.
         Keyed on the id *only*: the screen updates itself in place when its own
         word is saved, and adding the library's refresh token here would throw
         that away and re-read for a change it already has. */
      key={wordId}
      wordId={wordId}
      backToWordId={from}
      onBack={back}
      onDeleted={handleDeleted}
      onOpenWord={openWord}
      onSaved={onSaved}
    />
  )
}

import { useEffect } from 'react'
import { useHeader } from './headerContext'

/**
 * Publishes a screen's title and back button to the header, for as long as the
 * screen is mounted.
 *
 * Only for what the path cannot answer: a title that is data, or a back button
 * with a destination of its own. A screen whose title is a constant is already
 * covered by `titleForPath` and should call nothing.
 *
 * **Why an effect rather than a render-time call.** Setting shell state while a
 * child renders is a write to a parent mid-render, which React refuses. The
 * cost is one frame where the header shows the path's title before the screen's
 * own lands — which is why the path answers for everything it can, and why the
 * practice screens' titles live in `TITLES` rather than being registered here.
 * The only screens that flash are the two whose titles are genuinely unknown
 * until data loads, and both of those would otherwise show nothing at all.
 *
 * **There is no cleanup, deliberately.** The obvious shape is to clear the
 * header on unmount, and it is wrong: React runs the outgoing screen's cleanup
 * *after* the incoming screen's effect, so a screen leaving would wipe the
 * title of the screen that had already replaced it. The shell resets the header
 * on every navigation instead, which is the same guarantee made at the one
 * moment that can order it correctly. See `ShellChrome`.
 *
 * **The arguments are the parts, not an object.** A `{ title, back }` literal
 * is a new object on every render and the `onBack` closure inside it is a new
 * function, so an effect depending on it would fire every render — writing to
 * the shell, re-rendering the shell, re-rendering the screen. Taking the title
 * and the two halves of the back button separately means the dependency list
 * is made of primitives and one callback the caller already memoises, and the
 * effect fires when something has actually changed.
 */
export function useHeaderState({ title, backLabel, onBack }: HeaderStateInput): void {
  const { set } = useHeader()

  useEffect(() => {
    set({
      title,
      back: backLabel && onBack ? { label: backLabel, onBack } : undefined,
    })
  }, [set, title, backLabel, onBack])
}

interface HeaderStateInput {
  /** The screen's name, where the path cannot supply it. */
  title?: string
  /**
   * What the back button is called, spoken rather than drawn.
   *
   * Paired with `onBack`: a label with nothing to do, or a handler with nothing
   * to announce, is not a button, and neither renders one.
   */
  backLabel?: string
  /** Must be stable — a `useCallback`, or a handler defined outside the render. */
  onBack?: () => void
}

import { useLocation } from 'react-router'
import { LookUp } from '../../screens/LookUp'
import { useRefresh } from '../refreshContext'
import type { SharedCapture } from '../../domain/shareTarget'

/**
 * `/lookup` — capture.
 *
 * Takes a shared word from history state when it was reached from `/share`, and
 * has none on an ordinary tap. Reading it from the entry rather than from a
 * module-level constant is what makes the share path repeatable: a constant read
 * once at boot would prefill the field with the same word for the rest of the
 * session, including on every later visit to this tab.
 */
export function LookUpRoute() {
  const { state } = useLocation()
  const { onSaved } = useRefresh()

  const entry = state as { shared?: SharedCapture; focusSearch?: number } | null
  const shared = entry?.shared

  return (
    <LookUp
      /* Keyed on the shared word so arriving from a second share re-runs the
         search. The screen seeds its field from `initialWord` at mount, so
         without this a new share into an already-open Look Up would change a
         prop nothing reads again. */
      key={shared?.word ?? 'lookup'}
      onSaved={onSaved}
      initialWord={shared?.word}
      initialContext={shared?.context}
      /* Bumped by the shell when Look Up is tapped from Look Up. Undefined on
         an ordinary arrival, which the screen reads as its first focus. */
      focusRequest={entry?.focusSearch}
    />
  )
}

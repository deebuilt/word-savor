import { Navigate, createBrowserRouter } from 'react-router'
import { Shell } from './Shell'
import { LibraryRoute } from './routes/LibraryRoute'
import { LookUpRoute } from './routes/LookUpRoute'
import { MoreRoute } from './routes/MoreRoute'
import { PracticeRoute } from './routes/PracticeRoute'
import { PracticeDoneRoute } from './routes/PracticeDoneRoute'
import { PracticePickRoute } from './routes/PracticePickRoute'
import { PracticeResultsRoute } from './routes/PracticeResultsRoute'
import { PracticeSessionRoute } from './routes/PracticeSessionRoute'
import { PracticeSpeakRoute } from './routes/PracticeSpeakRoute'
import { PracticeStartRoute } from './routes/PracticeStartRoute'
import { ProgressRoute } from './routes/ProgressRoute'
import { ShareRoute } from './routes/ShareRoute'
import { WordDetailRoute } from './routes/WordDetailRoute'

/**
 * The app's routes.
 *
 * Five destinations and a word detail beneath one of them, which is exactly
 * what the bottom bar has always shown — the shape is unchanged, the addresses
 * are new.
 *
 * **Why `/library` is a real path and `/` redirects to it.** Library is where
 * the app opens, but making it the index route would give it two addresses: a
 * reader could be on `/` or on `/library` with the same screen showing, and
 * anything comparing the location to decide which tab is active would have to
 * know about both. One canonical path per screen, and the root sends you there.
 *
 * **Why word detail nests under `/library`.** It is a layer over the library
 * rather than a sixth destination — the nav still shows Library as where you
 * are, because that is where Back eventually returns you. Nesting says that in
 * the URL: `/library/abc123` is plainly a place inside the library, and the
 * active-tab rule falls out of the path rather than being a special case.
 *
 * **Why `/share` stays a route even though nothing navigates to it.** The
 * manifest registers it as the share target, so the OS opens the app there. It
 * is an entry point, not a destination: the route reads the parameters and
 * redirects to Look Up carrying the word. Handled as a route rather than at
 * module load because the redirect is now navigation, and navigation belongs to
 * the router — see `ShareRoute`.
 */

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Shell />,
    children: [
      /*
       * `replace`, so the redirect does not leave `/` in the history. Without
       * it, Back from the library would land on the root, which would redirect
       * to the library again — a back button that does nothing.
       */
      { index: true, element: <Navigate to="/library" replace /> },
      { path: 'library', element: <LibraryRoute /> },
      { path: 'library/:wordId', element: <WordDetailRoute /> },
      { path: 'lookup', element: <LookUpRoute /> },
      /*
       * Practice is a layout with four screens under it, rather than one route
       * holding four kinds of state. The layout owns the run — see
       * `PracticeRoute` — so moving between the menu, the session and the end
       * screen does not unmount what is being practiced.
       *
       * The menu is an index route here, and this is the one place the app
       * bends its own "one canonical path per screen" rule: `/practice` is what
       * the nav points at and where a session returns to, so giving the menu
       * its own deeper path would mean the tab's address and the tab's home
       * screen were two different things.
       */
      {
        path: 'practice',
        element: <PracticeRoute />,
        children: [
          { index: true, element: <PracticeStartRoute /> },
          { path: 'choose', element: <PracticePickRoute /> },
          { path: 'speak', element: <PracticeSpeakRoute /> },
          { path: 'session', element: <PracticeSessionRoute /> },
          { path: 'done', element: <PracticeDoneRoute /> },
          { path: 'results/:sessionId', element: <PracticeResultsRoute /> },
        ],
      },
      { path: 'progress', element: <ProgressRoute /> },
      { path: 'more', element: <MoreRoute /> },
      { path: 'share', element: <ShareRoute /> },
      /*
       * Anything else is the library. The app is installed as a PWA and served
       * with a catch-all rewrite, so an unknown path is almost always a stale
       * bookmark or a link to a screen that has since moved — and the library
       * is the app's home. A 404 screen would be a dead end in an app with no
       * other dead ends.
       */
      { path: '*', element: <Navigate to="/library" replace /> },
    ],
  },
])

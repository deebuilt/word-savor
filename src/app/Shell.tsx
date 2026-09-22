import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ConfigProvider } from 'antd'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { buildAntTheme } from '../design/antTheme'
import { useTheme } from '../hooks/useTheme'
import { BottomBar, type TabKey } from '../components/chrome/BottomBar'
import { TopBar } from '../components/chrome/TopBar'
import { RefreshProvider } from './refresh'
import { useRefresh } from './refreshContext'
import { HeaderContext, titleForPath, type HeaderState } from './headerContext'
import styles from './Shell.module.css'

/**
 * The app shell.
 *
 * A fixed viewport with one scrolling region and a nav pinned beneath it —
 * `100dvh` rather than `100vh` so the layout tracks the mobile URL bar
 * collapsing instead of hiding the last 60px of content behind it.
 *
 * The chrome lives here and the routed screen renders into the `Outlet`, so the
 * bar and the nav are not remounted by navigation. What changes on a tab tap is
 * the outlet's contents and nothing else.
 */

/** Which nav item a path lights up. Longest prefix first, so `/library/abc` is Library. */
function tabForPath(pathname: string): TabKey | undefined {
  if (pathname.startsWith('/library')) return 'library'
  if (pathname.startsWith('/lookup')) return 'lookup'
  if (pathname.startsWith('/practice')) return 'practice'
  if (pathname.startsWith('/progress')) return 'progress'
  if (pathname.startsWith('/more')) return 'more'
  return undefined
}

export function Shell() {
  return (
    <RefreshProvider>
      <ShellChrome />
    </RefreshProvider>
  )
}

function ShellChrome() {
  const { preference, resolved, cycle } = useTheme()
  const { dueCount } = useRefresh()
  const navigate = useNavigate()
  const location = useLocation()

  const active = tabForPath(location.pathname)

  /*
   * What the current screen has added to the header, and its reset.
   *
   * Empty for most screens: a title that can be read from the path is read from
   * the path, and only a title that is *data* — the open word, a past session's
   * date — or a back button with a destination of its own is registered here.
   * See `headerContext`.
   *
   * The reset happens during render, not in an effect.
   *
   * A screen that registers nothing has no way to say so, so the header has to
   * be cleared *for* it: without that, leaving a word detail for the practice
   * menu would strand the word's back chevron in the bar, because the menu
   * never sets anything that would overwrite it.
   *
   * The clear cannot be an effect. React flushes effects bottom-up — the
   * arriving screen's `useHeaderState` runs before any effect in this
   * component — so a reset here would land *after* the new title and wipe it,
   * on every single navigation. Deriving it during render instead puts the
   * clear before the child has even mounted, which is the only ordering that
   * works.
   *
   * This is the "adjusting state when a prop changes" pattern: compare, and
   * assign straight to the state variable. React re-runs this component
   * immediately, before touching the DOM or any child, so nothing renders with
   * the stale value.
   *
   * Keyed on `location.key` rather than `pathname`, so Look Up tapped from
   * Look Up — same path, new entry — resets too.
   */
  const [header, setHeaderRaw] = useState<HeaderState & { key: string }>({
    key: location.key,
  })
  if (header.key !== location.key) {
    setHeaderRaw({ key: location.key })
  }

  /*
   * Stamps whatever a screen registers with the entry it was registered under.
   *
   * The stamp is what makes a late write harmless: a screen's effect always
   * runs against the entry it mounted in, so its state carries that key and a
   * navigation that follows replaces it wholesale.
   */
  const setHeaderState = useCallback(
    (next: HeaderState) => {
      setHeaderRaw({ ...next, key: location.key })
    },
    [location.key],
  )

  const headerValue = useMemo(
    () => ({ title: header.title, back: header.back, set: setHeaderState }),
    [header.title, header.back, setHeaderState],
  )

  /*
   * The title: the screen's own, or the one its address implies.
   *
   * Path first as the fallback rather than the override, because a screen that
   * registers a title knows something the path does not — `/library/abc123`
   * resolves to "Library" and the word itself is better.
   */
  const title = header.title ?? titleForPath(location.pathname)

  /*
   * Scroll the reading region back to the top when the address changes.
   *
   * The scroller is this element rather than the document, so the browser's own
   * scroll restoration never sees it: opening a word from halfway down the
   * library would otherwise render the word's detail already scrolled into its
   * middle. Keyed on the full path so opening a second word from a related-word
   * popup resets too.
   */
  const main = useRef<HTMLElement>(null)
  useEffect(() => {
    main.current?.scrollTo({ top: 0 })
  }, [location.pathname])

  /*
   * A counter the Look Up screen watches to know it was asked for again.
   *
   * Tapping Look Up while already on Look Up used to do nothing at all: the
   * navigation resolved to the address already open, so no screen re-rendered
   * and no field took focus. What a second tap obviously means is "I want to
   * type" — the same gesture Spotify gives search — and the only thing standing
   * between the reader and a keyboard was that nothing told the screen it had
   * been asked.
   *
   * A counter rather than a boolean, because the interesting event is *another*
   * tap: the value only ever has to differ from the last one the screen saw.
   * It rides in history state so it survives the render, and lives here so the
   * screen needs no knowledge of the nav that summoned it.
   */
  const focusRequests = useRef(0)

  /*
   * Tapping the tab you are already on returns to that tab's root.
   *
   * The case that matters is Library: with a word open, the nav still reads
   * Library, so tapping Library has to mean "back to the list" rather than
   * nothing at all. `replace`, because this is a correction to where you are,
   * not a place to come back to.
   *
   * The comparison is against the tab rather than the path, so it fires from
   * `/library/abc123` — where the path differs but the destination does not.
   */
  const selectTab = useCallback(
    (next: TabKey) => {
      const repeat = next === active

      /*
       * Look Up tapped from Look Up asks for the keyboard as well as the
       * address. Everywhere else a repeat tap is just a return to the root.
       */
      if (next === 'lookup' && repeat) {
        focusRequests.current += 1
        void navigate('/lookup', {
          replace: true,
          state: { focusSearch: focusRequests.current },
        })
        return
      }

      void navigate(`/${next}`, { replace: repeat })
    },
    [navigate, active],
  )

  return (
    <ConfigProvider theme={buildAntTheme(resolved)}>
      <HeaderContext value={headerValue}>
        <div className={styles.shell}>
          <TopBar
            title={title}
            back={header.back}
            preference={preference}
            resolved={resolved}
            onCycleTheme={cycle}
          />
          <main className={styles.main} ref={main}>
            <Outlet />
          </main>
          <BottomBar active={active} onSelect={selectTab} dueCount={dueCount} />
        </div>
      </HeaderContext>
    </ConfigProvider>
  )
}

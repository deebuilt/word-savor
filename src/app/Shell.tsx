import { useCallback, useEffect, useRef } from 'react'
import { ConfigProvider } from 'antd'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { buildAntTheme } from '../design/antTheme'
import { useTheme } from '../hooks/useTheme'
import { BottomBar, type TabKey } from '../components/chrome/BottomBar'
import { TopBar } from '../components/chrome/TopBar'
import { RefreshProvider } from './refresh'
import { useRefresh } from './refreshContext'
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
      void navigate(`/${next}`, { replace: next === active })
    },
    [navigate, active],
  )

  return (
    <ConfigProvider theme={buildAntTheme(resolved)}>
      <div className={styles.shell}>
        <TopBar preference={preference} resolved={resolved} onCycleTheme={cycle} />
        <main className={styles.main} ref={main}>
          <Outlet />
        </main>
        <BottomBar active={active} onSelect={selectTab} dueCount={dueCount} />
      </div>
    </ConfigProvider>
  )
}

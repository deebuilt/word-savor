import { DesktopOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons'
import type { ThemePreference } from '../../hooks/useTheme'
import styles from './TopBar.module.css'

/**
 * The app header, shared by every screen.
 *
 * Deliberately constant: the wordmark and the theme control, and nothing that
 * changes between tabs. A header that retitles itself per screen duplicates
 * what the bottom bar already says — the nav shows where you are, and the page
 * heading below states it in full. Keeping this bar fixed in content means it
 * reads as the app's frame rather than as part of the page.
 *
 * **Why theme lives here and typeface does not.** They look like the same kind
 * of setting and they are not. Theme is a glance-and-flip control, reached for
 * when a room gets dark, and wanting it means wanting it *now* — two taps into
 * a settings screen is two taps too many. The reading face is a considered
 * choice made once and rarely revisited, and it belongs where there is room to
 * preview each option properly. Putting theme in both places would be the worse
 * option: one of the two copies is always the one you did not use, and they can
 * disagree on screen.
 */

interface TopBarProps {
  preference: ThemePreference
  resolved: 'light' | 'dark'
  /** Cycles system → light → dark → system. */
  onCycleTheme: () => void
}

/** What the button says it will do, per state. */
const THEME_LABEL: Record<ThemePreference, string> = {
  system: 'Theme: following your device. Switch to light.',
  light: 'Theme: light. Switch to dark.',
  dark: 'Theme: dark. Follow your device.',
}

export function TopBar({ preference, resolved, onCycleTheme }: TopBarProps) {
  return (
    <header className={styles.bar}>
      {/*
        Not an h1. The page below owns the document's heading, and a wordmark
        that claims h1 on every screen would leave every actual screen title
        nested under the app's name.
      */}
      <p className={styles.wordmark}>
        <span className={styles.markWord}>Word</span>
        <span className={styles.markSavor}>Savor</span>
      </p>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.action}
          onClick={onCycleTheme}
          /*
           * The label names the current state and what the tap will do. An icon
           * alone is ambiguous here in a way a sun and moon usually are not:
           * with three states, the monitor glyph has to mean "following your
           * device", which no icon conveys on its own.
           */
          aria-label={THEME_LABEL[preference]}
          title={THEME_LABEL[preference]}
        >
          <ThemeIcon preference={preference} resolved={resolved} />
        </button>
      </div>
    </header>
  )
}

/**
 * The glyph for the current preference.
 *
 * `system` shows a monitor rather than the sun or moon it currently resolves
 * to. Showing the resolved theme would make the button look identical to an
 * explicit choice, and then tapping it would appear to do nothing on the press
 * that moves system → light while the room is already bright.
 */
function ThemeIcon({
  preference,
  resolved,
}: {
  preference: ThemePreference
  resolved: 'light' | 'dark'
}) {
  if (preference === 'system') return <DesktopOutlined />
  return resolved === 'dark' ? <MoonOutlined /> : <SunOutlined />
}

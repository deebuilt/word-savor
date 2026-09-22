import { ArrowLeftOutlined, DesktopOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons'
import type { ThemePreference } from '../../hooks/useTheme'
import styles from './TopBar.module.css'

/**
 * The app header: identity, where you are, and how to leave.
 *
 * **It used to be constant and it is not any more.** The old bar showed the
 * wordmark and the theme control on every screen, and every screen carried its
 * own `<h1>` beneath it. On a desktop that reads as a frame around a titled
 * page. On a phone it reads as two headers: the app's name in a bar, then the
 * screen's name in 38px type directly under it, and only then the content —
 * roughly 110px of a 667px screen spent saying where you are, twice.
 *
 * So the bar took the job over. The screens have no titles now; this is the one
 * place the current screen is named, and the space that bought goes to the
 * words, which are what the app is for.
 *
 * **The wordmark shrank to its initials to make room.** "WordSavor" set at 21px
 * plus a title plus two controls does not fit at 375px. The initials are the
 * same two-weight lockup as the full mark and the same glyphs as the app icon,
 * so the thing in the corner still reads as the app rather than as decoration.
 *
 * **Back replaces the mark rather than sitting beside it.** A screen you can
 * leave needs an obvious way out more than it needs the app's logo — the logo
 * is not going to be forgotten between two taps. Swapping keeps the bar to
 * three slots at every width, so the title's centre never moves.
 *
 * **Why theme lives here and typeface does not.** They look like the same kind
 * of setting and they are not. Theme is a glance-and-flip control, reached for
 * when a room gets dark, and wanting it means wanting it *now* — two taps into
 * a settings screen is two taps too many. The reading face is a considered
 * choice made once and rarely revisited, and it belongs where there is room to
 * preview each option properly.
 */

interface TopBarProps {
  /** The screen's name, or `undefined` on an address with no title. */
  title?: string
  /**
   * The way out of this screen, where there is one.
   *
   * The label is the accessible name, not drawn text — see `HeaderState`.
   */
  back?: { label: string; onBack: () => void }
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

export function TopBar({ title, back, preference, resolved, onCycleTheme }: TopBarProps) {
  return (
    <header className={styles.bar}>
      {/*
        The leading slot: back where the screen has one, the initials where it
        does not. Both occupy the same width, so the title stays optically
        centred whichever is showing and does not shift as you navigate.
      */}
      <div className={styles.lead}>
        {back ? (
          <button
            type="button"
            className={styles.action}
            onClick={back.onBack}
            aria-label={back.label}
            title={back.label}
          >
            <ArrowLeftOutlined />
          </button>
        ) : (
          /*
            Not an h1, and not a heading at all. The title beside it is the
            screen's heading; a wordmark claiming h1 on every screen would nest
            every real title under the app's own name in the document outline.
          */
          <p className={styles.mark} aria-label="WordSavor">
            <span className={styles.markW} aria-hidden="true">
              W
            </span>
            <span className={styles.markS} aria-hidden="true">
              S
            </span>
          </p>
        )}
      </div>

      {/*
        The screen's name, and the document's h1.

        A heading rather than a styled paragraph because it is genuinely the
        heading of what is below it — moving a title into the chrome does not
        make it stop being a title, and a screen whose only h1 sits in a bar is
        still a screen with an h1. Screen readers navigating by heading land
        here, which is where they should land.

        `title` is absent only on `/share`, which redirects before it is read.
      */}
      {title && <h1 className={styles.title}>{title}</h1>}

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

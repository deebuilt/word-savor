import type { CSSProperties, ElementType } from 'react'
import styles from './Word.module.css'

/**
 * A saved word, set in the word face.
 *
 * The single place in the app that reads `--ws-font-word`. Every screen that
 * shows a word — the library row, the lookup result, the detail header, the
 * practice card — renders this rather than styling type itself, which is what
 * keeps the reading-face setting honest: a face added to the registry lands
 * everywhere without touching a screen.
 *
 * The `as` prop exists because the same word is a heading on the detail screen
 * and a plain span inside a library row. Size and semantics are independent
 * decisions, and collapsing them would force a choice between correct
 * typography and a correct document outline.
 *
 * **The word's own length is part of its styling.** Every size below is a
 * ceiling that a long word is allowed to fall away from, and CSS cannot count
 * characters — so the count is handed to it as `--ws-word-length` and the
 * stylesheet divides the space it has by the characters it must fit. This is
 * what stops "circumscribe" breaking across two lines where "bank" has room to
 * spare: they are no longer set at the same size.
 */

export type WordSize = 'display' | 'title' | 'row' | 'inline'

interface WordProps {
  children: string
  size?: WordSize
  /** The element to render. Defaults to a span — a word is not a heading. */
  as?: ElementType
  className?: string
  /**
   * Set when the display casing differs from what a screen reader should say.
   * Rare, but a word saved in the casing it was found in can arrive shouting.
   */
  'aria-label'?: string
}

export function Word({
  children,
  size = 'row',
  as: Element = 'span',
  className,
  'aria-label': ariaLabel,
}: WordProps) {
  return (
    <Element
      className={[styles.word, styles[size], className].filter(Boolean).join(' ')}
      aria-label={ariaLabel}
      /*
       * The character count the stylesheet sizes against. Counted from the
       * trimmed string because a stray space would buy the word a size step it
       * does not need, and measured in code points rather than UTF-16 units so
       * a word carrying an accent is not counted as longer than it looks.
       */
      style={{ '--ws-word-length': [...children.trim()].length } as CSSProperties}
      /*
       * `lang` marks this as English for the speech synthesiser and the
       * hyphenator. Without it a browser set to another language reads saved
       * words with that language's phonetics, which is exactly wrong for an app
       * whose whole subject is how a word sounds and is used.
       */
      lang="en"
    >
      {children}
    </Element>
  )
}

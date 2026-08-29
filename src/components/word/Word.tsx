import type { ElementType } from 'react'
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

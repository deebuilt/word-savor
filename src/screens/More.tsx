import { TypefacePicker } from '../components/chrome/TypefacePicker'
import { useTypefaces } from '../hooks/useTypefaces'
import styles from '../app/Shell.module.css'

/**
 * More — appearance now, backup and about later.
 *
 * Lived inside the shell until the router arrived, on the reasoning that it was
 * two pickers and a sentence and a file for it would hold nothing but the
 * markup below. That held while the shell rendered the screens itself. It does
 * not now: the shell renders chrome and an outlet, and a screen defined inside
 * it would be the only one the router could not point at from the route table.
 *
 * It reads its own typeface preferences rather than taking them as props. The
 * hook is backed by one stored preference, so reading it here and reading it in
 * the shell are the same values, and threading them down would only be
 * arranging for the shell to know about a setting no other screen uses.
 */
export function More() {
  const faces = useTypefaces()

  return (
    <div className={styles.screen}>
      {/* No heading — the app bar says More. What follows is the standfirst
          that used to sit under it. */}
      <p className={styles.body}>
        Appearance now; backup and about once there is something to back up.
      </p>

      {/*
        Theme is not here — it lives in the header, where it is one tap from
        anywhere. The reading face stays: it is a considered choice that wants
        room to preview each option, not a control to flip in passing.
      */}
      <section className={styles.section}>
        <TypefacePicker
          name="word-face"
          label="Word face"
          hint="How saved words are set, wherever they appear."
          /* A word worth previewing in: long enough to show the letterforms,
             and one someone might genuinely have saved. */
          sample="perspicacious"
          large
          value={faces.preference.word}
          onChange={faces.setWordFace}
        />
      </section>

      <section className={styles.section}>
        <TypefacePicker
          name="body-face"
          label="Reading face"
          hint="Definitions, notes, and everything that is not the word."
          sample="Having a ready insight into and understanding of things."
          value={faces.preference.body}
          onChange={faces.setBodyFace}
        />
      </section>
    </div>
  )
}

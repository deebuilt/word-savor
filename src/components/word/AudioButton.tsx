import { useCallback } from 'react'
import { SoundOutlined } from '@ant-design/icons'
import styles from './AudioButton.module.css'

/**
 * Play a word's pronunciation.
 *
 * **One component, three callers.** This was defined twice — identically, once
 * in Look Up and once in the word detail — each reading its own screen's
 * stylesheet for the same rule. The pronunciation mode would have made it three
 * copies, which is the point at which a thing that is pasted into files stops
 * being a detail and starts being a bug waiting to be fixed in only two of
 * them.
 *
 * **The Audio element is created per press rather than held.** These are
 * one-second clips from a third-party host that is measurably unreliable, and a
 * retained element that failed to load once stays failed — a fresh one retries
 * for free. Since the service worker now caches the files (see the
 * `runtimeCaching` rule in `vite.config.ts`), the second press of any word is
 * served locally, so there is no round trip to save by holding on to it either.
 *
 * `size` exists because the pronunciation list sets the word much larger than a
 * header does, and a 14px speaker beside a 28px word reads as an afterthought.
 * It is a named step rather than a pixel value, so there is still one place
 * that decides what those steps are.
 */

interface AudioButtonProps {
  src: string
  /** The word itself, for the label — "Hear obfuscate pronounced". */
  word: string
  size?: 'default' | 'large'
}

export function AudioButton({ src, word, size = 'default' }: AudioButtonProps) {
  const play = useCallback(() => {
    // Playback can reject — an unreachable host, or a browser that has not seen
    // a user gesture it accepts. Neither is worth an error message for
    // something entirely supplementary.
    void new Audio(src).play().catch(() => {})
  }, [src])

  return (
    <button
      type="button"
      className={size === 'large' ? styles.buttonLarge : styles.button}
      onClick={play}
      aria-label={`Hear ${word} pronounced`}
    >
      <SoundOutlined />
    </button>
  )
}

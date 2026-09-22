import { useCallback, useState } from 'react'
import { Modal, message } from 'antd'
import type { SavedWord, Sense } from '../../types/domain'
import { withFavoriteSense } from '../../domain/senses'
import { saveWord } from '../../storage/db'
import { SenseList } from '../word/SenseList'
import { Word } from '../word/Word'
import styles from './SenseSheet.module.css'

/**
 * A word's meanings, over the deck, so the star can be moved without leaving.
 *
 * **Why this exists at all.** The card shows the starred sense, and the only
 * way to change which one that is used to be the word's own screen — which
 * meant leaving `/practice/cards`, where the deck's position, scope, shuffle
 * and direction all live in component state that the router unmounts on the
 * way out. A reader who spotted the wrong meaning on card 20 of 47 had to go
 * to the library, find the word, re-star it, come back, and start again at
 * card 1. The cost of fixing a one-tap mistake was the whole session.
 *
 * **Why a modal rather than a route.** Nothing here navigates, so nothing
 * unmounts: the deck is still mounted underneath and comes back untouched when
 * this closes. That is the entire point, and it is a property of *not moving*
 * rather than something restored afterwards — no state to lift, persist or
 * rebuild, and no way for the restore to be subtly wrong.
 *
 * **Why not the whole word detail.** `WordDetail` is built as a screen and
 * assumes it: it pushes routes for related words, owns a back button, and can
 * delete the word out from under whatever rendered it. Putting all of that
 * inside a modal over a deck would either strand the reader or quietly break
 * the deck behind them. This shows the one thing the reader came for.
 *
 * **The write is the same write the detail screen makes** — `withFavoriteSense`
 * through `saveWord` — so a star moved here and a star moved there are the same
 * act, not two implementations that can drift. `onSaved` is what carries it
 * back to the deck.
 */

interface SenseSheetProps {
  /** The word whose senses these are. `undefined` keeps the sheet closed. */
  word: SavedWord | undefined
  onClose: () => void
  /** The word, saved. The deck refreshes its pool from this. */
  onSaved: (word: SavedWord) => void
}

export function SenseSheet({ word, onClose, onSaved }: SenseSheetProps) {
  const [toast, toastHolder] = message.useMessage()

  /*
   * The word as this sheet has it, so a tapped star fills immediately.
   *
   * The copy is seeded from the prop and replaced on every save. Waiting for
   * the write to land and travel back through the deck's pool would leave the
   * star visibly lagging the tap by a disk round-trip, on the one control this
   * sheet exists for.
   */
  const [local, setLocal] = useState<SavedWord | undefined>(word)

  /*
   * Follow the prop when a different word is opened.
   *
   * Derived during render rather than in an effect: an effect would paint one
   * frame of the previous word's senses under the new word's title. Comparing
   * ids rather than the objects, because the deck hands down a fresh array on
   * every pool refresh and the object identity changes without the word doing.
   */
  const [seenId, setSeenId] = useState(word?.id)
  if (word?.id !== seenId) {
    setSeenId(word?.id)
    setLocal(word)
  }

  const shown = local

  const toggleFavorite = useCallback(
    async (sense: Sense) => {
      if (!shown) return
      const next = withFavoriteSense(shown, sense)

      // Shown first, written second — see the note on `local` above.
      setLocal(next)
      try {
        await saveWord(next)
        onSaved(next)
      } catch {
        setLocal(shown)
        toast.error('Could not save that. Try again.')
      }
    },
    [shown, onSaved, toast],
  )

  return (
    <Modal
      /* Keyed on the word so opening a second one remounts rather than
         animating the previous word's list into the new word's title. */
      key={shown?.id}
      open={word !== undefined}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      title={
        shown && (
          <Word size="title" as="h2" className={styles.title}>
            {shown.word}
          </Word>
        )
      }
    >
      {toastHolder}

      {shown && (
        <div className={styles.body}>
          <p className={styles.lead}>
            Star the meaning you want this word to practice. It is the one the card
            shows.
          </p>

          {/*
            Expanded, unlike the detail screen and the related-word popup.
            Both of those are reading surfaces where a wall of twelve senses is
            a page nobody finishes — but someone who opened *this* came to
            compare the meanings and pick one, and a choice folded behind a
            disclosure is a choice they have to go looking for.
          */}
          <SenseList
            senses={shown.senses}
            expanded
            favoriteRef={shown.favoriteSenseRef}
            onToggleFavorite={(sense) => void toggleFavorite(sense)}
          />
        </div>
      )}
    </Modal>
  )
}

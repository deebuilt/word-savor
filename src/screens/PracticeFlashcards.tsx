import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SavedWord } from '../types/domain'
import {
  buildDeck,
  countDeck,
  scopeWords,
  shuffleIds,
  type DeckDirection,
  type DeckOrder,
  type DeckScope,
} from '../domain/flashcards'
import { Flashcard } from '../components/flashcards/Flashcard'
import { SenseSheet } from '../components/flashcards/SenseSheet'
import { DeckControls } from '../components/flashcards/DeckControls'
import { DeckOptions } from '../components/flashcards/DeckOptions'
import { ScopeSwitch } from '../components/flashcards/ScopeSwitch'
import { useHeaderState } from '../app/useHeaderState'
import styles from './PracticeFlashcards.module.css'

/**
 * Looking through the words, one at a time.
 *
 * **Nothing is scored, nothing is written, nothing is scheduled.** No practice
 * session row, no FSRS update, no usage log entry — turning a card over is not
 * an event the app records, because there is no answer in it to record. That is
 * what makes this a sibling of Audio practice rather than an eighth drill, and
 * it is why `docs/BUILD_PLAN.md`'s "not a flashcard app with a different skin"
 * still holds: that principle is about the grading model, and this surface does
 * not grade. See `docs/flashcards-plan.md` for the argument in full.
 *
 * Because nothing is recorded there is no session to abandon and no position to
 * resume. Leaving is just leaving — a back link, no quit confirm, exactly like
 * `PracticeSpeak`.
 *
 * **Direction and order are session state, not settings.** Which face opens and
 * whether the deck is shuffled are things a reader changes on a whim, mid-deck,
 * and storing them would mean a settings screen and a stored shape to migrate
 * for two values that cost nothing to re-pick. Coming back to a fresh deck in
 * alphabetical, word-first order is a defensible place to always start from.
 *
 * **The definition on the back is the starred one**, resolved through
 * `domain/senses.ts` like every other surface that shows one line of meaning.
 * That resolver is the reason the favourite-definition work was built first: a
 * flashcard drilling the dictionary's first sense while the library row shows
 * the starred one is the app disagreeing with itself about what a word means.
 *
 * **The starred sense can be changed from here, without leaving.** Noticing the
 * wrong meaning on a card is exactly the moment you want to fix it, and the
 * only way used to be the word's own screen — which unmounts all of the state
 * above and deals a fresh deck from card 1 on the way back. `SenseSheet` opens
 * over the deck instead, so nothing here is disturbed: see its own note. The
 * edited word is merged into `edits` below rather than re-read, because the
 * pool this screen is handed is a snapshot taken once when Practice mounted.
 */

interface PracticeFlashcardsProps {
  words: SavedWord[]
  onBack: () => void
}

export function PracticeFlashcards({ words, onBack }: PracticeFlashcardsProps) {
  /*
   * The way out lives in the app bar now, beside the title.
   *
   * It used to be a labelled link above the heading, which meant every screen
   * under Practice opened with two rows of chrome — a back link, then a 38px
   * title — before anything you came for. Both facts are now in the bar, where
   * they cost no vertical space at all and where the phone's own back gesture
   * already points.
   */
  useHeaderState({ backLabel: 'Back to Practice', onBack })

  const [scope, setScope] = useState<DeckScope>('all')
  const [direction, setDirection] = useState<DeckDirection>('word')
  const [order, setOrder] = useState<DeckOrder>('sorted')
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)

  /** The word whose senses are open over the deck, if any. */
  const [openWordId, setOpenWordId] = useState<string | undefined>(undefined)

  /*
   * Words edited from the sheet, by id, layered over the pool.
   *
   * **The pool is a snapshot, not a subscription.** `usePracticeRun` reads the
   * library once when Practice mounts and holds it; the refresh token that
   * Library and Progress listen to does not reach it. So a star moved in the
   * sheet is on disk and in the library, and the deck would still be dealing
   * the word as it was when this tab was opened — the card would show the old
   * meaning until the whole tab remounted, which is exactly the confusion the
   * sheet exists to remove.
   *
   * Held here rather than pushed up into the run, because this is the one
   * screen that can make such an edit and the run's pool is shared with the
   * scored drills, where swapping a word mid-session would change the question
   * underneath the reader.
   */
  const [edits, setEdits] = useState<ReadonlyMap<string, SavedWord>>(() => new Map())

  /*
   * The shuffled sequence, as ids, held across renders.
   *
   * **This is the whole reason the shuffle is not made inside `buildDeck`.**
   * The deck is memoised on `words`, which changes whenever anything in the
   * library is edited — so a shuffle generated during the build would deal a
   * brand new order on every such change and move the reader to a different
   * card mid-page. Held here, the sequence outlives those rebuilds and only
   * changes when something actually asks it to: switching scope, or tapping
   * Again.
   *
   * `undefined` until the reader first shuffles, so an alphabetical session
   * never pays for an order it does not use.
   */
  const [shuffled, setShuffled] = useState<readonly string[] | undefined>(undefined)

  /*
   * The library this screen deals from: the pool with any local edits applied.
   *
   * Everything below derives from `library` rather than `words`, so a star
   * moved in the sheet reaches the deck, both scope counts and the excluded
   * tally in one place. Identity is preserved when nothing has been edited, so
   * the memo below still only rebuilds when the pool itself changes.
   */
  const library = useMemo(() => {
    if (edits.size === 0) return words
    return words.map((word) => edits.get(word.id) ?? word)
  }, [words, edits])

  const deck = useMemo(
    () => buildDeck(library, scope, order, shuffled),
    [library, scope, order, shuffled],
  )

  /*
   * Both scopes' sizes, so the switch can state each one and disable an empty
   * Favorites rather than hiding it. Counted through the same function the deck
   * is built with, so the number on the tab is the number of cards behind it.
   */
  const counts = useMemo(
    () => ({ all: countDeck(library, 'all'), favorites: countDeck(library, 'favorites') }),
    [library],
  )

  /*
   * How many words could not be dealt. Stated rather than hidden, the way Audio
   * practice states the words with no recording — an unexplained gap between
   * "47 words" in the library and 45 cards here is the kind of thing that reads
   * as a bug.
   *
   * Counted against the unarchived library, because archived words are out of
   * the rotation everywhere and their absence is not a surprise that needs
   * explaining on this screen.
   */
  const excluded = useMemo(() => {
    if (scope !== 'all') return 0
    return library.filter((word) => !word.archived).length - counts.all
  }, [library, scope, counts.all])

  /*
   * Moving lands on the front of the next card.
   *
   * Carrying the flip forward would mean arriving on a definition with the word
   * already given away — which is the one thing a card is supposed to withhold
   * until you ask. Resetting here rather than in an effect keyed on `index`
   * keeps it a consequence of the move itself, so it cannot fire on a render
   * that happens to share an index.
   */
  const go = useCallback(
    (next: number) => {
      setIndex(next)
      setFlipped(false)
    },
    [],
  )

  const changeScope = useCallback(
    (next: DeckScope) => {
      setScope(next)
      /*
       * A new scope is a new set of words, so any shuffled order held for the
       * old one is stale. Cleared rather than reused: `applyOrder` would append
       * the unlisted words to the end, which on a scope change is most of them
       * — a deck that is shuffled at the front and alphabetical after it.
       * Cleared, the deck deals alphabetically until the reader shuffles again,
       * which is honest about what it is.
       */
      setShuffled(undefined)
      setOrder('sorted')
      /*
       * Back to the first card. Position 12 in one set is not position 12 in
       * the other, so holding the index would land the reader somewhere that
       * means nothing — and on a shorter deck, past the end.
       */
      go(0)
    },
    [go],
  )

  /*
   * Deal a new shuffled order and start from its first card.
   *
   * Shuffled from the scoped words rather than from `deck`, because the ids are
   * what is stored and `scopeWords` is the same filter the deck is built
   * through — going via the built cards would mean unwrapping them right back
   * to their words.
   */
  const reshuffle = useCallback(() => {
    setShuffled(shuffleIds(scopeWords(library, scope)))
    go(0)
  }, [library, scope, go])

  const changeOrder = useCallback(
    (next: DeckOrder) => {
      setOrder(next)
      /*
       * Turning shuffle on deals an order if there is not one already. Keeping
       * an existing one means a reader who flips to alphabetical and back finds
       * the deck they were in rather than a new one — going back should return
       * you to where you were, and Again is there for when it should not.
       */
      if (next === 'shuffled' && !shuffled) {
        setShuffled(shuffleIds(scopeWords(library, scope)))
      }
      go(0)
    },
    [library, scope, shuffled, go],
  )

  /*
   * Changing direction keeps your place but turns the card back over, so the
   * new face is the one you asked for. Staying flipped would show the same side
   * you were already looking at, making the toggle appear to do nothing.
   */
  const changeDirection = useCallback((next: DeckDirection) => {
    setDirection(next)
    setFlipped(false)
  }, [])

  /*
   * Record a word edited in the sheet, so the deck shows it at once.
   *
   * Merged into `edits` rather than written back to the pool — see that state's
   * note. `onSaved` has already put it on disk and told the rest of the app; it
   * is only this screen's own copy that needs catching up.
   */
  const applyEdit = useCallback((edited: SavedWord) => {
    setEdits((current) => new Map(current).set(edited.id, edited))
  }, [])

  /*
   * Keep the position inside a deck that shrank underneath it.
   *
   * The library can change while this screen is open — a word unstarred in
   * another tab, a word archived — and a stored index past the new end would
   * render nothing at all.
   *
   * **Clamped during render rather than corrected in an effect.** An effect
   * would let one frame paint at the bad index first, which on this screen is a
   * visibly empty card, and then re-render to fix it. Deriving the safe value
   * here means there is no such frame: `index` is the reader's intent, and
   * `position` is that intent made valid against the deck in front of them.
   * Nothing is stored that needs correcting, so nothing can be briefly wrong.
   */
  const position = Math.min(index, Math.max(0, deck.length - 1))
  const card = deck[position]

  /*
   * The word the sheet is showing, resolved from the edited library.
   *
   * Looked up by id every render rather than held as the word itself, so the
   * sheet is always handed the current copy — an object captured when the sheet
   * opened would go stale the moment a star was moved in it.
   *
   * Resolved against `library` rather than `deck`, because a word can leave the
   * deck while its sheet is open: un-star the last favourite in the Favorites
   * scope and the deck empties, but the sheet is still on screen and still has
   * a word to show.
   */
  const openWord = useMemo(
    () => (openWordId ? library.find((word) => word.id === openWordId) : undefined),
    [library, openWordId],
  )

  /*
   * Write the clamp back when it actually bit, so state and screen do not hold
   * two different positions.
   *
   * Without this the display is right and `index` is stale, which is harmless
   * until the deck grows back — restore an archived word and the reader is
   * suddenly on a card they never navigated to, because the old index became
   * valid again. Guarded on inequality, so this only ever runs on the render
   * where the deck actually shrank past the reader.
   */
  if (position !== index) setIndex(position)

  /*
   * Keyboard, for the desktop case. Space and Enter are left to the browser —
   * the card is a real button, so both already flip it when it has focus, and
   * intercepting them here would double-fire the flip.
   */
  useEffect(() => {
    /*
     * Not while the sheet is open. The listener is on the window, so an arrow
     * key pressed while reading the senses would page the deck underneath —
     * and since moving resets the flip and the sheet is keyed to the word it
     * opened on, the reader would close it to find a different card.
     */
    if (openWordId) return

    function onKey(event: KeyboardEvent) {
      if (event.key === 'ArrowLeft' && position > 0) go(position - 1)
      if (event.key === 'ArrowRight' && position < deck.length - 1) go(position + 1)
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [position, deck.length, go, openWordId])

  return (
    <div className={styles.screen}>
      <ScopeSwitch scope={scope} counts={counts} onChange={changeScope} />

      {card ? (
        <>
          <DeckOptions
            direction={direction}
            order={order}
            onDirection={changeDirection}
            onOrder={changeOrder}
            onReshuffle={reshuffle}
          />

          <Flashcard
            card={card}
            direction={direction}
            flipped={flipped}
            onFlip={() => setFlipped((on) => !on)}
          />

          {/*
            The way to the word's other meanings.

            Its own line under the card rather than a control on it: the card is
            a single button whose entire surface flips, so a nested button would
            be invalid markup and a tap on it would flip the card as well. Under
            the card and above the arrows puts it where the definition was a
            moment ago, which is where the reader is looking when they decide
            this is the wrong meaning.

            Labelled with the count, so it says whether there is anything to
            switch *to* before it is opened — a word with one sense offers a
            sheet that can only confirm what the card already showed.
          */}
          <button
            type="button"
            className={styles.senses}
            onClick={() => setOpenWordId(card.word.id)}
          >
            {card.word.senses.length > 1
              ? `See all ${card.word.senses.length} meanings`
              : 'See the meaning'}
          </button>

          <DeckControls
            index={position}
            total={deck.length}
            onPrevious={() => go(position - 1)}
            onNext={() => go(position + 1)}
          />

          {excluded > 0 && (
            <p className={styles.excluded}>
              {excluded} {excluded === 1 ? 'word has' : 'words have'} no definition saved,
              so {excluded === 1 ? 'it is' : 'they are'} not in the deck.
            </p>
          )}
        </>
      ) : (
        <p className={styles.state}>
          {scope === 'favorites'
            ? 'No favorite words yet. Star a word on its page and it will show up here.'
            : 'Nothing to page through yet. Save a few words in Look Up and they will show up here.'}
        </p>
      )}

      {/*
        Outside the `card` branch, so the sheet is not unmounted by the deck
        changing underneath it — un-starring the last favourite while in the
        Favorites scope empties the deck, and a sheet that vanished mid-tap
        would take its own "could not save" toast with it.
      */}
      <SenseSheet
        word={openWord}
        onClose={() => setOpenWordId(undefined)}
        onSaved={applyEdit}
      />
    </div>
  )
}

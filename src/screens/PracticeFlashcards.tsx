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

  const deck = useMemo(
    () => buildDeck(words, scope, order, shuffled),
    [words, scope, order, shuffled],
  )

  /*
   * Both scopes' sizes, so the switch can state each one and disable an empty
   * Favorites rather than hiding it. Counted through the same function the deck
   * is built with, so the number on the tab is the number of cards behind it.
   */
  const counts = useMemo(
    () => ({ all: countDeck(words, 'all'), favorites: countDeck(words, 'favorites') }),
    [words],
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
    return words.filter((word) => !word.archived).length - counts.all
  }, [words, scope, counts.all])

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
    setShuffled(shuffleIds(scopeWords(words, scope)))
    go(0)
  }, [words, scope, go])

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
        setShuffled(shuffleIds(scopeWords(words, scope)))
      }
      go(0)
    },
    [words, scope, shuffled, go],
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
    function onKey(event: KeyboardEvent) {
      if (event.key === 'ArrowLeft' && position > 0) go(position - 1)
      if (event.key === 'ArrowRight' && position < deck.length - 1) go(position + 1)
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [position, deck.length, go])

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
    </div>
  )
}

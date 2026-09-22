import { Word } from '../word/Word'
import type { DeckDirection, Flashcard as FlashcardData } from '../../domain/flashcards'
import styles from './Flashcard.module.css'

/**
 * One card, with the word on the front and its starred definition on the back.
 *
 * **The whole card is the button.** Flipping is the only thing this surface
 * does, so giving it a separate control would be asking the reader to aim at a
 * target when the entire screen already means the same thing. It also makes the
 * gesture work at any size without a tap target to keep clear of a thumb.
 *
 * **The flip is a state change, not an animated rotation.** A 3D card flip is
 * the single most recognisable "flashcard app" flourish there is, and this
 * screen is deliberately not that — see `docs/flashcards-plan.md`. A cross-fade
 * says the same thing (*the card turned over*) without the pastiche, and it
 * costs nothing on a phone that is already rendering a serif at display size.
 *
 * **Which side is showing is owned above**, not here. The deck resets the flip
 * on every move, and a card that remembered its own side would keep it across
 * `key` changes or lose it at the wrong moment depending on how React happened
 * to reconcile the list. State belongs where the decision is made.
 *
 * **`direction` decides which face is face-up, not what the card holds.** A
 * card is a word and a meaning either way; the direction says which one you are
 * asked to supply. So `flipped` means "turned over from wherever this deck
 * starts" rather than "showing the definition", and the two faces are picked
 * from the pair rather than hardcoded to front and back.
 *
 * **The flip stays symmetric in both directions.** Turning a meaning-first card
 * reveals the word, and turning it again goes back. A one-way reveal would make
 * it a question you answer rather than a card you look at, which is the line
 * this screen is on the other side of.
 *
 * **The word is the shared `Word` at display size**, not type set here. It used
 * to be the latter, which meant two files defined what a word looks like at its
 * largest and a change to one silently missed the other — the reason a long
 * word broke across two lines on this card. The card still owns the *space* the
 * word is fitted into, since only it knows how wide its own padding leaves it.
 */

interface FlashcardProps {
  card: FlashcardData
  /** Which face this deck opens on. */
  direction: DeckDirection
  /** Turned over from the opening face — not "showing the definition". */
  flipped: boolean
  onFlip: () => void
}

export function Flashcard({ card, direction, flipped, onFlip }: FlashcardProps) {
  /*
   * Meaning-first inverts what a flip shows. Resolved once here so the face,
   * the hint and the accessible name cannot disagree about which side is up —
   * three separate `direction === 'word' ? ... : ...` ternaries is three
   * chances to get one of them backwards.
   */
  const showingWord = direction === 'word' ? !flipped : flipped

  const wordLabel = `${card.word.word}.`
  const meaningLabel = `${card.partOfSpeech}: ${card.definition}.`

  return (
    <button
      type="button"
      className={styles.card}
      onClick={onFlip}
      /*
       * The card announces what it is showing and what a tap will do. Without
       * this a screen reader gets a button whose label changes from a word to a
       * definition with no indication that anything turned over.
       */
      aria-label={
        showingWord
          ? `${wordLabel} Tap to see the meaning.`
          : `${meaningLabel} Tap to see the word.`
      }
    >
      {showingWord ? (
        <span className={styles.front}>
          <Word size="display" className={styles.word}>
            {card.word.word}
          </Word>
          {card.word.pronunciation && (
            <span className={styles.pronunciation}>{card.word.pronunciation}</span>
          )}
        </span>
      ) : (
        <span className={styles.back}>
          <span className={styles.partOfSpeech}>{card.partOfSpeech}</span>
          <span className={styles.definition}>{card.definition}</span>
        </span>
      )}

      {/*
       * A permanent, quiet hint at the foot of the card. The flip is the one
       * thing you must know to use this screen and there is nothing else on the
       * card to suggest it — an unlabelled surface that happens to be tappable
       * is a feature you have to be told about somewhere else.
       */}
      <span className={styles.hint} aria-hidden="true">
        {showingWord ? 'Tap for the meaning' : 'Tap for the word'}
      </span>
    </button>
  )
}

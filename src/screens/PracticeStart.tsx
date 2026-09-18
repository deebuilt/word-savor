import { useMemo, useState } from 'react'
import { RightOutlined } from '@ant-design/icons'
import type { PracticeSelection, SavedWord } from '../types/domain'
import {
  PRACTICE_CARDS,
  countQuestions,
  isPracticable,
  type PracticeCardDefinition,
} from '../domain/practiceSelection'
import type { ResumeOffer } from '../practice/usePracticeRun'
import styles from './PracticeStart.module.css'

/**
 * Practice opens here: the ways to practice, as a menu.
 *
 * **Nothing is selected when you arrive.** This is not a configuration screen
 * in front of a queue with a default already chosen and a Start button to
 * confirm it — tapping a card *is* the choice, and it starts the session. There
 * is no pre-selection to override and no Start to hunt for.
 *
 * **Every card carries its length before it is tapped.** "12 words · 48
 * questions" is honest arithmetic and not a guess: `buildDrillsForWord` returns
 * the exact drill list per word, so the number shown is the number that will be
 * asked. This is the most valuable thing on the screen — the old Practice put
 * every word in the library through every drill and opened on question one, so
 * a session was an unknown number of steps that could not be seen from outside.
 * Knowing it is 48 questions is what makes starting a decision rather than a
 * gamble.
 *
 * **An empty card stays, greyed and untappable.** A menu whose items appear and
 * vanish as a library changes cannot be learned or described to anyone — the
 * same argument that ungated the Library's controls. "Nothing is going cold" is
 * also worth being told.
 *
 * **The resume offer sits above the menu**, because continuing is a different
 * kind of act from choosing: it is finishing something already begun, and
 * burying it among seven equal cards would make it look like an eighth way to
 * start.
 */

interface PracticeStartProps {
  words: SavedWord[]
  offer: ResumeOffer
  onStart: (selection: PracticeSelection, words: SavedWord[]) => void
  onResume: () => void
  onHandPick: () => void
  onSpeak: () => void
}

export function PracticeStart({
  words,
  offer,
  onStart,
  onResume,
  onHandPick,
  onSpeak,
}: PracticeStartProps) {
  /*
   * Only words that can actually carry a session.
   *
   * Archived words are out of the rotation everywhere, and a word with no
   * material to ask about produces no drills — so counting it would promise a
   * question the session cannot deliver, and a card reading "3 words · 0
   * questions" is a card that starts an empty session.
   */
  const practicable = useMemo(
    () => words.filter((word) => isPracticable(word, words)),
    [words],
  )

  /*
   * The instant every card is judged against, taken once when the screen opens.
   *
   * Frozen rather than read per card so the time-based selections (due, going
   * cold) all answer the same moment — two cards computed a millisecond apart
   * is not a real disagreement, but it is the kind that surfaces as a count
   * that moves for no reason a reader can see.
   *
   * In state rather than read during render, because reading the clock while
   * rendering makes the render impure: two renders of the same screen would
   * produce different counts, and React is free to render whenever it likes.
   * A lazy initialiser runs once per mount, which is exactly the lifetime this
   * value should have — the menu is a snapshot of the library as you opened it.
   */
  const [now] = useState(() => Date.now())

  /*
   * How many words have a recording. Counted from the whole library rather than
   * from `practicable`, because hearing a word said needs audio and nothing
   * else — a word with no drill material still has a pronunciation worth
   * knowing, and excluding it would hide it for a reason that does not apply.
   */
  const audible = useMemo(
    () => words.filter((word) => Boolean(word.audioUrl)).length,
    [words],
  )

  /** Every card's selection, resolved once. */
  const previews = useMemo(
    () =>
      PRACTICE_CARDS.map((card) => ({
        card,
        words: card.select(practicable, now),
      })),
    [practicable, now],
  )

  if (words.length === 0) {
    return (
      <div className={styles.screen}>
        <h1 className={styles.title}>Practice</h1>
        <p className={styles.state}>
          Nothing to practice yet. Save a few words in Look Up and they will show up here.
        </p>
      </div>
    )
  }

  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>Practice</h1>

      {offer.status === 'found' && (
        <button type="button" className={styles.resume} onClick={onResume}>
          <span className={styles.resumeLabel}>Pick up where you left off</span>
          <span className={styles.resumeDetail}>
            {offer.label} · {offer.wordCount} {offer.wordCount === 1 ? 'word' : 'words'}
          </span>
          <RightOutlined className={styles.resumeChevron} />
        </button>
      )}

      <ul className={styles.menu}>
        {previews.map(({ card, words: selected }) => (
          <li key={card.id}>
            <PracticeMenuCard
              card={card}
              words={selected}
              pool={practicable}
              onChoose={() =>
                card.id === 'hand-picked' ? onHandPick() : onStart(card.id, selected)
              }
            />
          </li>
        ))}
      </ul>

      {/*
       * Saying the words is below the menu and under its own heading, because
       * it is a different kind of thing: nothing is scored, nothing is written,
       * and there is no session to finish. Put in the list above it would be an
       * eighth way to be tested, which is the one thing it is not — and the
       * counts beside every other row would be promising a length it does not
       * have.
       */}
      {audible > 0 && (
        <div className={styles.aside}>
          <p className={styles.asideLabel}>Not a test</p>
          <button type="button" className={styles.card} onClick={onSpeak}>
            <span className={styles.cardText}>
              <span className={styles.cardLabel}>Audio practice</span>
              <span className={styles.cardDescription}>
                Listen and repeat. Nothing is scored.
              </span>
            </span>
            <span className={styles.cardCount}>
              <span className={styles.cardFigure}>{audible}</span>
              <span className={styles.cardUnit}>
                {audible === 1 ? 'word' : 'words'}
              </span>
            </span>
          </button>
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function PracticeMenuCard({
  card,
  words,
  pool,
  onChoose,
}: {
  card: PracticeCardDefinition
  words: SavedWord[]
  pool: SavedWord[]
  onChoose: () => void
}) {
  /*
   * Hand-picked reports the library it opens onto rather than a question count.
   * It does not start a session, so a length would be describing a session
   * nobody has chosen yet — and the count that matters there is how much there
   * is to pick from.
   */
  const picksOwn = card.id === 'hand-picked'
  const questions = useMemo(
    () => (picksOwn ? 0 : countQuestions(words, pool)),
    [picksOwn, words, pool],
  )

  const empty = words.length === 0

  return (
    <button type="button" className={styles.card} onClick={onChoose} disabled={empty}>
      <span className={styles.cardText}>
        <span className={styles.cardLabel}>{card.label}</span>
        <span className={styles.cardDescription}>{card.description}</span>
      </span>
      <span className={styles.cardCount}>
        {empty ? (
          <span className={styles.cardEmpty}>Nothing here</span>
        ) : (
          <>
            <span className={styles.cardFigure}>{words.length}</span>
            <span className={styles.cardUnit}>
              {words.length === 1 ? 'word' : 'words'}
              {!picksOwn && ` · ${questions} ${questions === 1 ? 'question' : 'questions'}`}
            </span>
          </>
        )}
      </span>
    </button>
  )
}

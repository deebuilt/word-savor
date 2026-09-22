import { useMemo, useState } from 'react'
import { Input } from 'antd'
import type { SavedWord } from '../types/domain'
import { matchesQuery, sortWords } from '../domain/library'
import { countQuestions, isPracticable } from '../domain/practiceSelection'
import { favoriteDefinition } from '../domain/senses'
import { useHeaderState } from '../app/useHeaderState'
import styles from './PracticePick.module.css'

/**
 * Choosing the words yourself.
 *
 * **The whole library is reachable here, every word of it.** The schedule
 * orders lists and fills the other cards; it never removes a word from what may
 * be chosen. A word answered "not yet" a minute ago is still drillable a minute
 * later, and an app that refuses to practice a word its owner asked for has
 * mistaken its bookkeeping for the goal.
 *
 * **Start carries the same figures the menu cards carry**, recomputed as words
 * are ticked. The point of the landing page is knowing the length before
 * starting, and a hand-picked session is the one where the reader is *building*
 * that length — so the number has to move while they build it, not appear
 * afterwards.
 *
 * Alphabetical, because this screen is used to find words you have in mind. The
 * orderings that answer "what should I practice" are the other six cards; this
 * one exists for when the reader already knows.
 */

interface PracticePickProps {
  words: SavedWord[]
  onStart: (words: SavedWord[]) => void
  onBack: () => void
}

export function PracticePick({ words, onStart, onBack }: PracticePickProps) {
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

  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())

  const practicable = useMemo(
    () => sortWords(words.filter((word) => isPracticable(word, words)), 'alphabetical'),
    [words],
  )

  const shown = useMemo(
    () => practicable.filter((word) => matchesQuery(word, query)),
    [practicable, query],
  )

  /*
   * The chosen words in library order, not in the order they were ticked.
   *
   * Ticking order is an artefact of how someone scrolled, and a session that
   * plays back in it would be different every time the same ten words were
   * chosen. Deriving from `practicable` also keeps the session's order stable
   * across a search that hides and re-shows a row.
   */
  const selected = useMemo(
    () => practicable.filter((word) => picked.has(word.id)),
    [practicable, picked],
  )

  const questions = useMemo(
    () => countQuestions(selected, practicable),
    [selected, practicable],
  )

  const toggle = (id: string) => {
    setPicked((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  return (
    <div className={styles.screen}>
      <Input
        className={styles.search}
        placeholder="Find a word"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        allowClear
      />

      {shown.length === 0 ? (
        <p className={styles.state}>No words match that.</p>
      ) : (
        <ul className={styles.list}>
          {shown.map((word) => {
            const isPicked = picked.has(word.id)
            /* The starred definition — this list is chosen *from* to build a
               session, so it has to show the meaning that session will drill. */
            const definition = favoriteDefinition(word)
            return (
              <li key={word.id}>
                <button
                  type="button"
                  className={styles.row}
                  onClick={() => toggle(word.id)}
                  aria-pressed={isPicked}
                >
                  {/*
                   * A real checkbox is drawn rather than rendered, because the
                   * whole row is the control — a nested input would give the row
                   * two focusable things doing one job, and a 16px tick is a
                   * much worse tap target than a 56px row.
                   */}
                  <span className={isPicked ? styles.tickOn : styles.tick} aria-hidden="true" />
                  <span className={styles.rowText}>
                    <span className={styles.word}>{word.word}</span>
                    {definition && <span className={styles.definition}>{definition}</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {/*
       * The start bar is present from the first tick and absent before it,
       * rather than always present and disabled. A disabled button asks the
       * reader to work out what is missing; a bar that appears the moment there
       * is something to start says it by arriving.
       */}
      {selected.length > 0 && (
        <div className={styles.startBar}>
          <span className={styles.startCount}>
            {selected.length} {selected.length === 1 ? 'word' : 'words'} ·{' '}
            {questions} {questions === 1 ? 'question' : 'questions'}
          </span>
          <button type="button" className={styles.start} onClick={() => onStart(selected)}>
            Start
          </button>
        </div>
      )}
    </div>
  )
}

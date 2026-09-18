import { useEffect, useMemo, useState } from 'react'
import { Input, Segmented, Select } from 'antd'
import type { SavedWord } from '../types/domain'
import { listWords } from '../storage/db'
import {
  FILTER_OPTIONS,
  SORT_OPTIONS,
  bandLabel,
  matchesFilter,
  matchesQuery,
  medianRarityBand,
  sortWords,
  type LibraryFilter,
  type LibrarySort,
  type SortOption,
} from '../domain/library'
import { Word } from '../components/word/Word'
import { StatusMark } from '../components/word/StatusMark'
import { WordMeta } from '../components/word/WordMeta'
import styles from './Library.module.css'

/**
 * The library — every saved word, ordered by whatever question is being asked.
 *
 * Alphabetical by default, because this is the screen you come to looking for a
 * word you already know you have. The other orders are the stats doing work:
 * the Library's job is **finding a word**, so a figure earns its place here by
 * ordering the list rather than by decorating every row. "Marked used 4 times"
 * printed on two hundred rows is noise; "sort by longest unused" is a tool.
 *
 * **The letter strip is a filter, not a jump.** It began as a scroll-to
 * control, which does nothing whenever the list already fits on one screen —
 * on a small library it appears broken because there is nowhere to scroll to.
 * As a filter it always does something visible, and it doubles as the browse
 * control the page would otherwise need bulky chrome for. Tapping the active
 * letter again clears it.
 *
 * **Letters come from the library, never from the alphabet.** A row of
 * twenty-six with most greyed out is a display of what you do not have.
 *
 * **Two lines of definition per row.** One line cuts most definitions
 * mid-clause and ends up less recognisable than no definition at all.
 */

interface LibraryProps {
  /** Bumped by the shell after a save, to re-read the library. */
  refreshToken?: number
  onOpenWord?: (id: string) => void
}

interface LetterGroup {
  letter: string
  words: SavedWord[]
}

export function Library({ refreshToken = 0, onOpenWord }: LibraryProps) {
  const [words, setWords] = useState<SavedWord[] | undefined>(undefined)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<LibrarySort>('alphabetical')
  const [filter, setFilter] = useState<LibraryFilter>('all')
  /** The letter being browsed, or `undefined` for the whole library. */
  const [letter, setLetter] = useState<string | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const all = await listWords()
      if (cancelled) return
      setWords(all)
    })()
    return () => {
      cancelled = true
    }
  }, [refreshToken])

  const all = useMemo(() => words ?? [], [words])
  const total = all.length

  /*
   * The letters available to browse, from the words that survive the search
   * and filter but *before* the letter itself is applied.
   *
   * Excluding the letter from its own input is what keeps the strip stable
   * while browsing: computed after it, choosing B would leave B as the only
   * letter on screen and strand the reader with no way back to the rest of the
   * library except a control that had just vanished.
   */
  const searched = useMemo(
    () => all.filter((word) => matchesQuery(word, query) && matchesFilter(word, filter)),
    [all, query, filter],
  )

  const letters = useMemo(() => {
    const found = new Set(searched.map((word) => firstLetter(word.word)))
    return [...found].sort((a, b) => a.localeCompare(b, 'en'))
  }, [searched])

  /*
   * A letter that no longer has words stops filtering.
   *
   * Derived during render rather than reset from an effect: searching while
   * browsing B can leave no B words at all, and an effect would paint the empty
   * list for one frame before correcting itself. The stored letter is left
   * alone so that clearing the search restores the browse — the reader never
   * asked to leave B, the search just temporarily emptied it.
   */
  const activeLetter = letter !== undefined && letters.includes(letter) ? letter : undefined

  const shown = useMemo(() => {
    const picked =
      activeLetter === undefined
        ? searched
        : searched.filter((word) => firstLetter(word.word) === activeLetter)
    return sortWords(picked, sort)
  }, [searched, activeLetter, sort])

  const sortOption =
    SORT_OPTIONS.find((option) => option.id === sort) ?? SORT_OPTIONS[0]

  /*
   * Letter headings belong to alphabetical order only. Under "longest unused"
   * they would cut the list into groups that fight the ordering — a heading
   * every row or two, naming something the order is not about.
   */
  const groups = useMemo(
    () => (sort === 'alphabetical' ? groupByLetter(shown) : undefined),
    [shown, sort],
  )

  const median = useMemo(() => medianRarityBand(all), [all])
  const isNarrowed = query.trim() !== '' || filter !== 'all' || activeLetter !== undefined

  return (
    <div className={styles.screen}>
      <div className={styles.head}>
        <h1 className={styles.title}>Library</h1>
        {total > 0 && (
          <span className={styles.count}>
            {/* The count follows what is on screen once anything narrows it,
                because a total that ignores the filter describes a list the
                reader is not looking at. */}
            {isNarrowed ? `${shown.length} of ${total}` : `${total} ${total === 1 ? 'word' : 'words'}`}
            {median && <span className={styles.median}> · mostly {bandLabel(median).toLowerCase()}</span>}
          </span>
        )}
      </div>

      {/* The search field earns its place only once scanning gets hard. */}
      {total > 8 && (
        <div className={styles.search}>
          <Input.Search
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a word"
            allowClear
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
      )}

      {/*
        Sort and filter appear once there is enough to order.
        Below that threshold the whole library is on one screen and every
        control is a way to hide part of what you can already see.
      */}
      {total > 5 && (
        <div className={styles.controls}>
          <Segmented
            className={styles.filters}
            value={filter}
            onChange={(value) => setFilter(value as LibraryFilter)}
            options={FILTER_OPTIONS.map((option) => ({
              label: option.label,
              value: option.id,
            }))}
            size="small"
          />
          <Select
            className={styles.sort}
            value={sort}
            onChange={(value: LibrarySort) => setSort(value)}
            size="small"
            variant="borderless"
            popupMatchSelectWidth={false}
            aria-label="Sort words"
            options={SORT_OPTIONS.map((option) => ({
              label: option.label,
              value: option.id,
            }))}
          />
        </div>
      )}

      {/*
        The letter strip filters rather than scrolls. It shows only when there
        is more than one letter to choose between — with everything under A it
        would be a single button that changes nothing.
      */}
      {letters.length > 1 && (
        <nav className={styles.index} aria-label="Filter by letter">
          <button
            type="button"
            className={`${styles.indexLetter} ${activeLetter === undefined ? styles.indexActive : ''}`}
            onClick={() => setLetter(undefined)}
            aria-pressed={activeLetter === undefined}
          >
            All
          </button>
          {letters.map((entry) => (
            <button
              key={entry}
              type="button"
              className={`${styles.indexLetter} ${activeLetter === entry ? styles.indexActive : ''}`}
              /* Tapping the active letter clears it, so the strip is its own
                 way out and the reader never has to find "All" to undo a tap. */
              onClick={() => setLetter((current) => (current === entry ? undefined : entry))}
              aria-pressed={activeLetter === entry}
            >
              {entry}
            </button>
          ))}
        </nav>
      )}

      {words === undefined && <p className={styles.empty}>Opening your library…</p>}

      {words !== undefined && total === 0 && (
        <p className={styles.empty}>
          No words saved yet. Use Look Up to add the first one.
        </p>
      )}

      {total > 0 && shown.length === 0 && <p className={styles.empty}>{emptyMessage(query, filter)}</p>}

      {groups
        ? groups.map((group) => (
            <section key={group.letter} className={styles.group}>
              <h2 className={styles.groupLetter}>{group.letter}</h2>
              <ul className={styles.list}>
                {group.words.map((word) => (
                  <li key={word.id}>
                    <Row word={word} caption={sortOption.caption} onOpen={onOpenWord} />
                  </li>
                ))}
              </ul>
            </section>
          ))
        : shown.length > 0 && (
            <ul className={`${styles.list} ${styles.flatList}`}>
              {shown.map((word) => (
                <li key={word.id}>
                  <Row word={word} caption={sortOption.caption} onOpen={onOpenWord} />
                </li>
              ))}
            </ul>
          )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function Row({
  word,
  caption,
  onOpen,
}: {
  word: SavedWord
  caption: SortOption['caption']
  onOpen?: (id: string) => void
}) {
  const definition = word.senses[0]?.definition

  return (
    <button type="button" className={styles.row} onClick={() => onOpen?.(word.id)}>
      <span className={styles.rowTop}>
        <Word size="row" className={styles.rowWord}>
          {word.word}
        </Word>
        <StatusMark word={word} />
      </span>
      {definition && <span className={styles.rowDefinition}>{definition}</span>}
      <WordMeta word={word} caption={caption} />
    </button>
  )
}

/* -------------------------------------------------------------------------- */

/**
 * What to say when nothing matched.
 *
 * Names the control that emptied the list, because "no words" alone leaves the
 * reader to work out which of three narrowing controls is responsible.
 */
function emptyMessage(query: string, filter: LibraryFilter): string {
  const term = query.trim()
  if (term) return `No word in your library matches “${term}”.`

  switch (filter) {
    case 'favorites':
      return 'No favorites yet. Star a word to keep it here.'
    case 'unpracticed':
      return 'Every word has been practiced at least once.'
    case 'unused':
      return 'Every word has been marked used.'
    case 'cold':
      return 'Nothing has gone cold. Every older word has been marked used.'
    case 'all':
      return 'No words here.'
  }
}

/** Group an already-sorted alphabetical list under its letters. */
function groupByLetter(words: SavedWord[]): LetterGroup[] {
  const groups: LetterGroup[] = []
  for (const word of words) {
    const letter = firstLetter(word.word)
    const current = groups[groups.length - 1]
    if (current?.letter === letter) current.words.push(word)
    else groups.push({ letter, words: [word] })
  }
  return groups
}

/**
 * The letter a word files under.
 *
 * Normalised so "élan" files under E rather than under its own accented
 * character, which would create a one-word group sitting apart from the Es.
 * Anything that is not a letter — a saved phrase starting with a digit or a
 * quote — files under `#`, the convention every contact list uses.
 */
function firstLetter(word: string): string {
  const first = word
    .trim()
    .normalize('NFD')
    // Strip combining marks, so é becomes e.
    .replace(/[̀-ͯ]/g, '')
    .charAt(0)
    .toUpperCase()

  return /[A-Z]/.test(first) ? first : '#'
}

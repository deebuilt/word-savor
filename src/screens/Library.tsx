import { useEffect, useMemo, useState } from 'react'
import { Input, Select } from 'antd'
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
import { rarityLabel } from '../domain/rarity'
import { favoriteDefinition } from '../domain/senses'
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
 *
 * **Nothing here is gated on how many words the library holds.** Search, sort
 * and filter used to appear only above a word count, on the reasoning that a
 * library fitting on one screen has nothing to narrow. True, and beside the
 * point: a screen that changes shape as a collection grows cannot be learned,
 * cannot become a habit, and cannot be described to anyone — two people with
 * different libraries are looking at different apps, which is exactly how a
 * 14-word phone and a 4-word desktop ended up disagreeing about what this
 * screen contains. A quiet control that does little is cheaper than a control
 * that comes and goes. The only gate left is zero, where there is genuinely
 * nothing to narrow, and the letter strip, which is conditional on *content*:
 * a strip holding one letter cannot do anything at all.
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
      {/*
        No heading here — the header names the screen. What is left is the
        count, which was never a title's companion so much as a caption on the
        list, and now sits directly above the list it counts.
      */}
      <div className={styles.head}>
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

      {/*
        Controls are hidden only for a genuinely empty library — at zero, where
        there is nothing to search or narrow and the one useful thing on screen
        is how to add a word. Not below a word count: a screen that changes
        shape as a collection grows cannot be learned or built into a habit, and
        two people with different libraries end up looking at different apps.
      */}
      {total > 0 && (
        <>
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

          {/*
            Two dropdowns, side by side. They do different jobs and compose:
            the filter picks which words are in the list, the sort arranges
            whatever survives. So "Favorites" and "Least used" together means
            favorites, least-used first.

            Favorite is a filter rather than a sort because it is a yes/no per
            word — there is no order to arrange 14 words "by favoriteness" in,
            while every sort here reads a value that varies across words. As a
            sort it could only mean "favorites first, then the rest", which
            would lose the ability to see favorites *only*.

            One interaction model rather than two: an earlier version paired a
            segmented strip with a dropdown, which put two kinds of control
            side by side doing the same kind of job and cost a second row at
            375px. The trade is that the filters are no longer visible at rest,
            so "Going cold" has to be found by opening the menu — acceptable in
            a tool its owner uses daily and learns once.
          */}
          <div className={styles.controls}>
            <Select
              className={styles.control}
              value={sort}
              onChange={(value: LibrarySort) => setSort(value)}
              popupMatchSelectWidth={false}
              aria-label="Sort words"
              options={SORT_OPTIONS.map((option) => ({
                label: option.label,
                value: option.id,
              }))}
            />
            <Select
              className={styles.control}
              value={filter}
              onChange={(value: LibraryFilter) => setFilter(value)}
              popupMatchSelectWidth={false}
              aria-label="Filter words"
              options={FILTER_OPTIONS.map((option) => ({
                label: option.label,
                value: option.id,
              }))}
            />
          </div>
        </>
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
  /* The starred definition, so the row says what practice will ask about. A row
     showing the dictionary's first sense while the drill uses the starred one is
     the mismatch the star was added to remove, moved one screen over. */
  const definition = favoriteDefinition(word)
  const rarity = rarityLabel(word.rarity)

  return (
    <button type="button" className={styles.row} onClick={() => onOpen?.(word.id)}>
      <span className={styles.rowTop}>
        <Word size="row" className={styles.rowWord}>
          {word.word}
        </Word>
        {/*
         * The rarity band, between the word and the status dots.
         *
         * Progress reports how the library is spread across the bands, and
         * until now nothing said which band any individual word was in — so the
         * spread could be read but never checked against a word, and "12% very
         * rare" named no words at all. This is the other half of that figure.
         *
         * Absent when Datamuse never scored the word, rather than filled with
         * a guess or a dash. An unscored word is unmeasured, not very rare, and
         * a label saying otherwise would make the spread above it a lie. The
         * same rule `rarityLabel` already follows by returning `undefined`.
         */}
        {rarity && <span className={styles.rowRarity}>{rarity}</span>}
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

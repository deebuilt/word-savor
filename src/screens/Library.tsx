import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Input } from 'antd'
import type { SavedWord } from '../types/domain'
import { listWords } from '../storage/db'
import { Word } from '../components/word/Word'
import { StatusMark } from '../components/word/StatusMark'
import styles from './Library.module.css'

/**
 * The library — every saved word, alphabetically.
 *
 * Alphabetical rather than newest-first, because this is the screen you come to
 * looking for a word you already know you have. Recency helps when you are
 * reviewing what you just added; it is useless when you are trying to find
 * "epigraph" among two hundred.
 *
 * **Letter headings come from the library, never from the alphabet.** A row of
 * twenty-six letters with most of them greyed out is a display of what you do
 * not have — a forty-word library would show two-thirds dead letters. The index
 * is derived from the words that exist, so every letter in it goes somewhere.
 *
 * **Two lines of definition per row.** One line cuts most definitions
 * mid-clause and ends up less recognisable than no definition at all; two carry
 * enough sense to tell apart two meanings of a half-remembered word.
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

  /*
   * Headings are registered by the groups themselves as they render, so
   * scrolling to a letter never depends on an id string built in two places.
   */
  const headings = useRef(new Map<string, HTMLHeadingElement>())

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

  const groups = useMemo(() => groupByLetter(words ?? [], query), [words, query])
  const total = words?.length ?? 0

  const jumpTo = useCallback((letter: string) => {
    headings.current.get(letter)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [])

  const registerHeading = useCallback((letter: string, node: HTMLHeadingElement | null) => {
    if (node) headings.current.set(letter, node)
    else headings.current.delete(letter)
  }, [])

  return (
    <div className={styles.screen}>
      <div className={styles.head}>
        <h1 className={styles.title}>Library</h1>
        {total > 0 && (
          <span className={styles.count}>
            {total} {total === 1 ? 'word' : 'words'}
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
        The index appears only when there is more than one letter to jump
        between — with every word under A, it would be a single button that
        scrolls to the top of a list you are already looking at.
      */}
      {groups.length > 1 && (
        <nav className={styles.index} aria-label="Jump to letter">
          {groups.map((group) => (
            <button
              key={group.letter}
              type="button"
              className={styles.indexLetter}
              onClick={() => jumpTo(group.letter)}
              aria-label={`Jump to ${group.letter}, ${group.words.length} ${
                group.words.length === 1 ? 'word' : 'words'
              }`}
            >
              {group.letter}
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

      {total > 0 && groups.length === 0 && (
        <p className={styles.empty}>No word in your library matches “{query.trim()}”.</p>
      )}

      {groups.map((group) => (
        <section key={group.letter} className={styles.group}>
          <h2
            className={styles.groupLetter}
            ref={(node) => registerHeading(group.letter, node)}
          >
            {group.letter}
          </h2>
          <ul className={styles.list}>
            {group.words.map((word) => (
              <li key={word.id}>
                <Row word={word} onOpen={onOpenWord} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function Row({ word, onOpen }: { word: SavedWord; onOpen?: (id: string) => void }) {
  const definition = word.senses[0]?.definition

  return (
    <button type="button" className={styles.row} onClick={() => onOpen?.(word.id)}>
      <span className={styles.rowTop}>
        <Word size="row" className={styles.rowWord}>
          {word.word}
        </Word>
        <StatusMark status={word.status} />
      </span>
      {definition && <span className={styles.rowDefinition}>{definition}</span>}
    </button>
  )
}

/* -------------------------------------------------------------------------- */

/**
 * Sort, filter, and group into letters.
 *
 * `localeCompare` rather than `<`, so accented and non-ASCII words sort where a
 * reader expects rather than after Z by code point — "élan" belongs with the
 * Es. `sensitivity: 'base'` makes the comparison ignore case and accents, which
 * is the same rule the grouping below uses.
 */
function groupByLetter(words: SavedWord[], query: string): LetterGroup[] {
  const term = query.trim().toLowerCase()
  const matched = term
    ? words.filter(
        (word) =>
          word.word.toLowerCase().includes(term) ||
          word.senses.some((sense) => sense.definition.toLowerCase().includes(term)),
      )
    : words

  const sorted = [...matched].sort((a, b) =>
    a.word.localeCompare(b.word, 'en', { sensitivity: 'base' }),
  )

  const groups: LetterGroup[] = []
  for (const word of sorted) {
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

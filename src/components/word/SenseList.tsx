import { useMemo, useState } from 'react'
import { RightOutlined } from '@ant-design/icons'
import type { Sense } from '../../types/domain'
import styles from './SenseList.module.css'

/**
 * A word's definitions, primary sense first and the rest behind a disclosure.
 *
 * Every sense a word has is saved — storage is free, and a sense dropped at
 * save time can only come back by re-fetching. But showing all of them is a
 * different question: "bank" carries twelve after capping, and a wall of
 * twelve definitions is not a richer reading experience, it is one nobody
 * finishes. So the record is complete and the page is calm.
 *
 * **What counts as primary:** the first sense of the first part of speech, in
 * the order the dictionary returned. Wiktionary orders by prominence, so this
 * is the meaning the word is usually reached for — which is the one someone
 * who just met it in a sentence needs.
 *
 * The disclosure is collapsed by default everywhere, including on a word with
 * exactly two senses. A control that appears and disappears based on a count is
 * harder to learn than one that is always in the same place.
 */

interface SenseListProps {
  senses: Sense[]
  /**
   * Show every sense with no disclosure.
   *
   * For the lookup result, where someone is deciding whether this is even the
   * right word and wants to see what they are about to keep.
   */
  expanded?: boolean
}

export function SenseList({ senses, expanded = false }: SenseListProps) {
  const [showAll, setShowAll] = useState(expanded)

  /*
   * Group the hidden senses by part of speech to describe them.
   *
   * "3 more senses" is worse than "3 more, including a verb" — the second tells
   * a reader whether opening it will show them something different in kind, or
   * more of what they have already read.
   */
  const summary = useMemo(() => describeRest(senses), [senses])

  if (senses.length === 0) return null

  const visible = showAll ? senses : senses.slice(0, 1)
  const hiddenCount = senses.length - visible.length

  return (
    <div>
      <ul className={styles.list}>
        {visible.map((sense, index) => (
          <li
            /* Definitions are deduplicated upstream, so the text is unique
               within a word and is a more stable key than the index. */
            key={`${sense.partOfSpeech}:${sense.definition}`}
            className={styles.sense}
          >
            {/* The part of speech is repeated only when it changes, so a run of
                noun senses reads as one group rather than a stutter. */}
            {(index === 0 || sense.partOfSpeech !== visible[index - 1].partOfSpeech) && (
              <span className={styles.partOfSpeech}>{sense.partOfSpeech}</span>
            )}

            <p className={styles.definition}>{sense.definition}</p>

            {sense.examples.length > 0 && (
              <ul className={styles.examples}>
                {sense.examples.map((example) => (
                  <li key={example} className={styles.example}>
                    {example}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      {hiddenCount > 0 && (
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={showAll}
          onClick={() => setShowAll(true)}
        >
          <span className={styles.chevron}>
            <RightOutlined />
          </span>
          {summary}
        </button>
      )}

      {showAll && !expanded && senses.length > 1 && (
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={showAll}
          onClick={() => setShowAll(false)}
        >
          <span className={`${styles.chevron} ${styles.chevronOpen}`}>
            <RightOutlined />
          </span>
          Show less
        </button>
      )}
    </div>
  )
}

/**
 * Describe what is behind the disclosure.
 *
 * Names the other parts of speech when there are any, because that is the
 * genuinely new information — a reader who looked up "bank" the noun may not
 * know it is also a verb, and that is worth surfacing on the button itself.
 */
function describeRest(senses: Sense[]): string {
  const hidden = senses.slice(1)
  if (hidden.length === 0) return ''

  const primary = senses[0].partOfSpeech
  const otherParts = [...new Set(hidden.map((sense) => sense.partOfSpeech))].filter(
    (part) => part !== primary,
  )

  const count = `${hidden.length} more ${hidden.length === 1 ? 'sense' : 'senses'}`
  if (otherParts.length === 0) return count

  return `${count}, including ${formatList(otherParts)}`
}

/** "verb" / "verb and noun" / "verb, noun, and adjective". */
function formatList(items: string[]): string {
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

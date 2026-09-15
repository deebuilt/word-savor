import { Tag } from 'antd'
import styles from './PracticeCards.module.css'

/** A plain list of terms — synonyms, related words — for an answer strip. Not tappable: this is a glance at the word's web, not another place to navigate away from practice. */

export function TermList({ terms }: { terms: string[] }) {
  if (terms.length === 0) return null

  return (
    <div className={styles.terms}>
      {terms.map((term) => (
        <Tag key={term} className={styles.termTag}>
          {term}
        </Tag>
      ))}
    </div>
  )
}

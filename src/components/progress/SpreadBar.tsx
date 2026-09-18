import styles from './SpreadBar.module.css'

/**
 * A proportional bar over a list of rows, for one set split into parts.
 *
 * **Only for a genuine parts-of-a-whole split.** The library totals — saved,
 * practiced, used — overlap, and drawing those as segments is what once
 * rendered a four-word library as "saved 0". Rarity bands are the honest case:
 * every scored word falls in exactly one band, so the widths sum to the whole
 * and the proportion means something.
 *
 * Rows carry their own color class, chosen by the caller, so this component
 * stays about layout and never about what any particular scale means.
 */

export interface SpreadRow {
  key: string
  label: string
  /**
   * An optional example, shown beside the label.
   *
   * A band name like "Uncommon" is a position on a scale the reader has no feel
   * for. One real word puts it somewhere they can stand.
   */
  hint?: string
  count: number
  /** 0–1. Segment width comes from this; the row prints `count`. */
  share: number
  /** CSS module class for this row's color, from the caller's own stylesheet. */
  toneClass: string
}

interface SpreadBarProps {
  rows: SpreadRow[]
  /** Read to a screen reader in place of the decorative bar. */
  summary: string
}

export function SpreadBar({ rows, summary }: SpreadBarProps) {
  const filled = rows.filter((row) => row.count > 0)

  return (
    <div className={styles.block}>
      {/*
        Decorative — every figure in it is printed as text below, so a screen
        reader that announced both would read the whole set twice.
      */}
      <div className={styles.bar} role="img" aria-label={summary}>
        {filled.map((row) => (
          <span
            key={row.key}
            className={`${styles.segment} ${row.toneClass}`}
            /* Percentage rather than flex-grow: the segments must sum to the
               bar's width exactly, and a growth factor divides leftover space,
               which is not the same thing. */
            style={{ width: `${row.share * 100}%` }}
          />
        ))}
      </div>

      <ul className={styles.rows}>
        {rows.map((row) => (
          <li key={row.key} className={styles.row}>
            <span className={`${styles.swatch} ${row.toneClass}`} aria-hidden="true" />
            <span className={styles.label}>
              {row.label}
              {row.hint && <span className={styles.hint}>like {row.hint}</span>}
            </span>
            {/*
              The share in words, beside the count. The bar shows proportion but
              cannot be read to a number, and the count alone does not say what
              fraction of the collection it is — "3" means something different
              in a library of four than in one of four hundred.

              Empty bands print nothing rather than "0%", which would put a
              column of noughts beside the bands a reader has not reached yet.
            */}
            <span className={styles.share}>
              {row.count === 0 ? '' : `${Math.round(row.share * 100)}%`}
            </span>
            <span className={styles.count}>{row.count}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

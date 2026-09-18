import type { WeekPoint } from '../../domain/progress'
import styles from './TrendBars.module.css'

/**
 * A small bar chart of weekly counts, drawn inline.
 *
 * Bars rather than a line: these are counts of discrete events per week, and a
 * line implies a continuous quantity that was sampled — it would draw a slope
 * between two weeks as though something happened in between. Bars say "this
 * many, that week", which is what the data is.
 *
 * Hand-rolled with flexbox rather than a charting library. Four small charts do
 * not justify a dependency, and the markup inherits the same custom properties
 * as everything else, so it themes for light and dark with no extra work.
 *
 * **Every value is printed above its bar. No tooltips.** A tooltip needs a
 * cursor to hover, so on a phone — the design target — it hides the data
 * outright, and a chart whose numbers are unreachable on the primary device is
 * decoration. Printed figures also mean the chart does not depend on a reader
 * comparing bar heights by eye.
 *
 * **Empty weeks are drawn, not skipped**, as a faint baseline stub. A gap is
 * information, and dropping the quiet weeks would redraw a stop-start history
 * as a steady one.
 */

interface TrendBarsProps {
  points: WeekPoint[]
  /** Read to a screen reader in place of the graphic. */
  summary: string
}

export function TrendBars({ points, summary }: TrendBarsProps) {
  const peak = Math.max(...points.map((point) => point.count), 1)

  return (
    <div className={styles.chart}>
      <div className={styles.bars} role="img" aria-label={summary}>
        {points.map((point) => (
          <span key={point.startKey} className={styles.slot}>
            {/*
              A zero prints a dash rather than "0". A column of noughts across a
              quiet stretch reads as a scolding, where a dash reads as "nothing
              here" — the same fact without the tone.
            */}
            <span className={`${styles.value} ${point.count === 0 ? styles.valueEmpty : ''}`}>
              {point.count === 0 ? '–' : point.count}
            </span>
            <span
              className={`${styles.bar} ${point.count === 0 ? styles.empty : ''}`}
              /* Scaled against the tallest week rather than a fixed ceiling, so
                 a library that saves two words a week still shows a readable
                 shape instead of twelve slivers. */
              style={{ height: point.count === 0 ? '2px' : `${(point.count / peak) * 100}%` }}
            />
          </span>
        ))}
      </div>

      {/*
        The ends only. A tick under every bar is unreadable at 375px, and the
        span is what the axis actually needs to say. Dates rather than "11 weeks
        ago", which reads as a count and invites counting the bars against it.
      */}
      <div className={styles.axis}>
        <span>{monthDay(points[0].startKey)}</span>
        <span>This week</span>
      </div>
    </div>
  )
}

/** A day key as a short date, for the axis ends. */
function monthDay(key: string): string {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

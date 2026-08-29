import type { ReactNode } from 'react'
import {
  BookOutlined,
  EllipsisOutlined,
  PlusOutlined,
  RiseOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import styles from './BottomBar.module.css'

/**
 * The app's navigation, and the only chrome that is always on screen.
 *
 * Five items across, icon over label, in one evenly divided row. At 375px each
 * item gets 75px and the longest label, "Progress", measures about 48px at
 * 11px — nothing wraps and nothing truncates.
 *
 * Three decisions worth keeping:
 *
 * **Look Up is centred and accented.** It is the thing the app is for. The
 * window between meeting a word and losing it is a few seconds long, so capture
 * gets the thumb's home position and the only colour in the row.
 *
 * **Library is first, not Practice.** Opening onto a drill screen would make
 * this an app that feeds you words, which is precisely what it is not. It opens
 * onto the collection you built.
 *
 * **"Practice", not "Review".** Review is flashcard vocabulary and implies the
 * goal is recall. The goal is use.
 *
 * Not antd Buttons: a Button owns its own inner layout, and stacking a glyph
 * over a label inside one means fighting `.ant-btn` for flex direction, height,
 * and padding. A plain button element is less code and the hit target is set
 * here regardless.
 *
 * No tooltips: the bar sits at the bottom of the viewport, so a tooltip opens
 * upward over whatever the tap just opened. The label is permanently on screen,
 * which is what a tooltip was approximating.
 */

export type TabKey = 'library' | 'practice' | 'lookup' | 'progress' | 'more'

interface BarItem {
  key: TabKey
  label: string
  icon: ReactNode
}

/**
 * Left to right, working outward from the middle by how often each is reached
 * for. Look Up is the centre because it is the reason the app exists; Library
 * and Practice flank it as the two places you live; Progress and More are
 * visited, not lived in.
 */
const ITEMS: readonly BarItem[] = [
  { key: 'library', label: 'Library', icon: <BookOutlined /> },
  { key: 'practice', label: 'Practice', icon: <ThunderboltOutlined /> },
  { key: 'lookup', label: 'Look Up', icon: <PlusOutlined /> },
  { key: 'progress', label: 'Progress', icon: <RiseOutlined /> },
  { key: 'more', label: 'More', icon: <EllipsisOutlined /> },
]

interface BottomBarProps {
  active: TabKey
  onSelect: (tab: TabKey) => void
  /**
   * How many words are due. Shown on Practice so the queue is visible without
   * opening it. Zero renders nothing rather than a "0" — an empty queue is good
   * news and should not look like a notification.
   */
  dueCount?: number
}

export function BottomBar({ active, onSelect, dueCount = 0 }: BottomBarProps) {
  return (
    <nav className={styles.bar}>
      {ITEMS.map((item) => {
        const isLookUp = item.key === 'lookup'
        const isActive = item.key === active
        const showBadge = item.key === 'practice' && dueCount > 0

        return (
          <button
            key={item.key}
            type="button"
            /* `aria-current` rather than `aria-pressed`: these are
               destinations, and only one is open at a time. */
            aria-current={isActive ? 'page' : undefined}
            aria-label={
              showBadge
                ? `Practice, ${dueCount} ${dueCount === 1 ? 'word' : 'words'} due`
                : undefined
            }
            onClick={() => onSelect(item.key)}
            className={[
              styles.item,
              isLookUp ? styles.lookUpItem : '',
              isActive ? styles.active : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className={styles.icon}>
              {item.icon}
              {showBadge && (
                /* `aria-hidden` because the count is already in the button's
                   label — a screen reader should hear it once, in a sentence,
                   not twice as a bare number. */
                <span className={styles.badge} aria-hidden="true">
                  {dueCount > 99 ? '99+' : dueCount}
                </span>
              )}
            </span>
            <span className={styles.label}>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

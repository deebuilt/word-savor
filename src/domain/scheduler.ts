import { createEmptyCard, fsrs, Rating, type Card, type Grade } from 'ts-fsrs'
import type { FSRSState } from '../types/domain'

/**
 * The usage-graded scheduler.
 *
 * `ts-fsrs` schedules on *recall* by design — its four grades assume the
 * question is "did you remember this." WordSavor asks a different question
 * ("have you used this since last time"), so the four usage-prompt answers are
 * mapped onto FSRS's grades by how they should move the interval, not by any
 * similarity in wording:
 *
 * - **Used it** → Easy. The word is live; push the interval far out.
 * - **Almost had it** → Good. Reached for it, close enough to count as progress.
 * - **Still fuzzy** → Hard. Recognised but not reachable yet; interval barely grows.
 * - **Not yet** → Again. No attempt at all; come back soon.
 *
 * The FSRS half of this (interval math, retrievability curve) is exactly what
 * the library is for. Only the meaning of the four buttons is WordSavor's own.
 */

export type UsageGrade = 'used' | 'fuzzy' | 'not-yet'

const GRADE_TO_RATING: Record<UsageGrade, Grade> = {
  used: Rating.Easy,
  fuzzy: Rating.Hard,
  'not-yet': Rating.Again,
}

const scheduler = fsrs()

/** A brand-new word's starting schedule, due immediately. */
export function initialFSRSState(now = new Date()): FSRSState {
  return cardToState(createEmptyCard(now))
}

/** Apply a usage grade and return the next schedule. */
export function nextFSRSState(state: FSRSState, grade: UsageGrade, now = new Date()): FSRSState {
  const card = stateToCard(state)
  const { card: nextCard } = scheduler.next(card, now, GRADE_TO_RATING[grade])
  return cardToState(nextCard)
}

/** Whether a word's schedule has come due, independent of `listDueWords`'s query. */
export function isDue(state: FSRSState, now = Date.now()): boolean {
  return state.due <= now
}

function stateToCard(state: FSRSState): Card {
  return {
    due: new Date(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.elapsedDays,
    scheduled_days: state.scheduledDays,
    learning_steps: 0,
    reps: state.reps,
    lapses: state.lapses,
    state: state.state,
    last_review: state.lastReview ? new Date(state.lastReview) : undefined,
  }
}

function cardToState(card: Card): FSRSState {
  return {
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.last_review?.getTime(),
  }
}

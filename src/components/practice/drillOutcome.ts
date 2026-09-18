import type { Outcome } from '../../practice/session'

/**
 * The three ways a drill can end, shared by all five cards.
 *
 * Every card used to take `answered?: boolean` and report `onAnswer(correct)`,
 * which has no room for "I don't know this yet" — a skip had to be smuggled
 * through as a wrong answer, and a wrong answer is exactly what it is not. So
 * the prop carries the outcome instead.
 *
 * **A skip reveals the same things a miss reveals.** The teaching moment is the
 * point, and a skip that hid the answer would punish honesty — the reader who
 * says they do not know is the one who most needs to see it. What differs is
 * only what gets recorded: a miss is an answer and a skip is not.
 */
export type { Outcome }

/** Whether the card should show its answer. True for every settled outcome. */
export function isSettled(outcome: Outcome | undefined): outcome is Outcome {
  return outcome !== undefined
}

/**
 * Whether the answer strip should read as a success.
 *
 * A skip is not a success and is not styled as one. It gets the same strip a
 * miss gets, because the reader's position is the same: here is the word you
 * did not produce.
 */
export function readsAsCorrect(outcome: Outcome | undefined): boolean {
  return outcome === 'correct'
}

/**
 * Turn a local right/wrong verdict into an outcome.
 *
 * The cards grade themselves — an exact string match, a picked option — and
 * that verdict is binary. This is the one-line bridge from it to the three-way
 * outcome, so no card has to think about skips it did not produce.
 */
export function outcomeOf(correct: boolean): Outcome {
  return correct ? 'correct' : 'wrong'
}

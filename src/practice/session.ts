import type {
  DrillResult,
  PracticeRun,
  PracticeSelection,
  PracticeSession,
  SavedWord,
} from '../types/domain'
import { CURRENT_RUN_KEY } from '../types/domain'
import type { PracticeCard } from '../domain/puzzles'
import { buildQueueFor } from '../domain/puzzles'
import type { UsageGrade } from '../domain/scheduler'

/**
 * A practice session's shape and its arithmetic, with no React and no storage.
 *
 * Everything here is a pure function over a `RunState`, so what a session *is*
 * can be read in one file without chasing effects — and so the two awkward
 * parts (what a step is, and what counts as an answer) are stated once rather
 * than re-derived by every screen that touches them.
 *
 * `usePracticeRun` owns the state and the writes; this owns the meaning.
 */

/**
 * One position in a session: a drill, or the usage check-in that follows a
 * word's last drill.
 *
 * "Step", not "card", because the check-in is not a question and Back has to
 * move through both uniformly. The word-level indices ride on every step so the
 * progress line never has to scan the queue to answer "which word is this, of
 * how many".
 */
export type Step = (
  | {
      kind: 'drill'
      card: PracticeCard
      /** 0-based position among its word's drills. The check-in is not counted. */
      drillIndex: number
      /** How many drills this word has — the denominator for "Question N of M". */
      drillCount: number
    }
  | { kind: 'check-in'; word: SavedWord }
) & {
  /** 0-based position of this step's word in the session — the same for every step of that word. */
  wordIndex: number
}

/**
 * How a step was answered.
 *
 * `skipped` is its own outcome rather than `correct: false`, and the whole
 * design of the skip depends on keeping the two apart. "I don't know this yet"
 * is an honest report that no question was answered; recording it as a wrong
 * answer fills accuracy with answers nobody meant, which is the bug the skip
 * exists to remove. It still reaches the scheduler as a lapse — the record is
 * about what was answered, the schedule is about what is known, and a skip is
 * silent in one and loud in the other.
 */
export type Outcome = 'correct' | 'wrong' | 'skipped'

export interface AnsweredStep {
  outcome: Outcome
  /** Only on a check-in, which is graded rather than answered. */
  usageGrade?: UsageGrade
}

export interface RunState {
  /** The session row being written into. Taken at start, so every write overwrites one row. */
  sessionId: string
  selection: PracticeSelection
  startedAt: number
  /** The words, in the order the selection drew them. The order is part of the position. */
  words: SavedWord[]
  steps: Step[]
  index: number
  /** Answers by step index. Sparse — an unreached step is simply absent. */
  answers: Map<number, AnsweredStep>
}

/**
 * Expand chosen words into the session's steps.
 *
 * The word order arrives already decided and is preserved, because on resume a
 * stored step index has to mean the same position it meant when it was written.
 */
export function buildSteps(words: SavedWord[], pool: SavedWord[]): Step[] {
  const cards = buildQueueFor(words, pool)

  // Each word's drills are consecutive, so a per-word count is a single pass.
  const drillCountByWord = new Map<string, number>()
  for (const card of cards) {
    drillCountByWord.set(card.word.id, (drillCountByWord.get(card.word.id) ?? 0) + 1)
  }

  const steps: Step[] = []
  let wordIndex = 0
  let drillIndex = 0
  for (const card of cards) {
    steps.push({
      kind: 'drill',
      card,
      wordIndex,
      drillIndex,
      drillCount: drillCountByWord.get(card.word.id) ?? 1,
    })
    drillIndex++
    if (card.isLastForWord) {
      steps.push({ kind: 'check-in', word: card.word, wordIndex })
      wordIndex++
      drillIndex = 0
    }
  }

  return steps
}

/** How many drills were answered. Skips are not answers, so they do not count. */
export function answeredCount(answers: Map<number, AnsweredStep>, steps: Step[]): number {
  return countAnswers(answers, steps, () => true)
}

/** How many were answered correctly. */
export function correctCount(answers: Map<number, AnsweredStep>, steps: Step[]): number {
  return countAnswers(answers, steps, (answer) => answer.outcome === 'correct')
}

/** How many questions the reader declined with "I don't know this yet". */
export function skippedCount(answers: Map<number, AnsweredStep>, steps: Step[]): number {
  let total = 0
  answers.forEach((answer, index) => {
    if (steps[index]?.kind === 'drill' && answer.outcome === 'skipped') total++
  })
  return total
}

/**
 * Count drill answers matching a test.
 *
 * Check-ins are excluded and so are skips, for the same reason and it is the
 * honesty rule the whole app runs on: a drill is one question, and only
 * answered questions are results. A check-in is a self-report with no right
 * answer; a skip is a question the reader declined. Folding either one in pads
 * the denominator with something nobody answered.
 */
function countAnswers(
  answers: Map<number, AnsweredStep>,
  steps: Step[],
  test: (answer: AnsweredStep) => boolean,
): number {
  let total = 0
  answers.forEach((answer, index) => {
    if (steps[index]?.kind !== 'drill') return
    if (answer.outcome === 'skipped') return
    if (test(answer)) total++
  })
  return total
}

/** How many questions the session holds, whether or not they are reached. */
export function questionCount(steps: Step[]): number {
  return steps.filter((step) => step.kind === 'drill').length
}

/**
 * The per-drill record, in the order the questions were asked.
 *
 * Walked in step order rather than read out of the map, because a map keyed by
 * step index has no order worth relying on and the sequence is part of what
 * happened.
 *
 * Skips and check-ins are both absent, and so are unreached steps. A drill
 * never reached is not a miss, and recording it as one would make every session
 * ended early look like a failed one.
 */
export function drillResults(state: RunState): DrillResult[] {
  const results: DrillResult[] = []

  state.steps.forEach((step, index) => {
    if (step.kind !== 'drill') return
    const answer = state.answers.get(index)
    if (!answer || answer.outcome === 'skipped') return
    results.push({
      wordId: step.card.word.id,
      drill: step.card.drill.kind,
      correct: answer.outcome === 'correct',
    })
  })

  return results
}

/**
 * The session as a stored row.
 *
 * Built fresh from the state on every write rather than patched, so the row is
 * always a straight description of the run as it stands — there is no
 * accumulated counter that can drift out of step with the answers it counts.
 *
 * `endedAt` is the moment of this write, which under incremental writes means
 * "last answered". `total` is what was answered, never what was offered:
 * inflating the denominator with untouched drills would make every honest
 * partial session look like a failed one.
 *
 * `wordIds` covers every word the session drew, answered or not, because it
 * records what the session was *about* — which words came up on a given day is
 * the question the field exists to answer.
 */
export function sessionRecord(
  state: RunState,
  completed: boolean,
  now = Date.now(),
): PracticeSession {
  return {
    id: state.sessionId,
    startedAt: state.startedAt,
    endedAt: now,
    mode: 'mixed',
    selection: state.selection,
    wordIds: state.words.map((word) => word.id),
    correct: correctCount(state.answers, state.steps),
    total: answeredCount(state.answers, state.steps),
    completed,
    results: drillResults(state),
  }
}

/** Where the run has got to, for the resume offer. */
export function runRecord(state: RunState, now = Date.now()): PracticeRun {
  return {
    key: CURRENT_RUN_KEY,
    sessionId: state.sessionId,
    startedAt: state.startedAt,
    updatedAt: now,
    selection: state.selection,
    wordIds: state.words.map((word) => word.id),
    stepIndex: state.index,
  }
}

/**
 * Whether anything has been answered yet.
 *
 * What the quit confirm turns on. Leaving a session before answering anything
 * has nothing to lose and nothing to warn about, so it simply leaves.
 */
export function hasAnswers(state: RunState): boolean {
  return state.answers.size > 0
}

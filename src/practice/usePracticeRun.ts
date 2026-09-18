import { useCallback, useEffect, useRef, useState } from 'react'
import type { DrillResult, PracticeSelection, SavedWord } from '../types/domain'
import {
  clearCurrentRun,
  getCurrentRun,
  getSession,
  listWords,
  putCurrentRun,
  putSession,
  recordUsageCheckIn,
} from '../storage/db'
import { nextFSRSState, type UsageGrade } from '../domain/scheduler'
import { practiceCard } from '../domain/practiceSelection'
import {
  buildSteps,
  hasAnswers,
  runRecord,
  sessionRecord,
  type AnsweredStep,
  type Outcome,
  type RunState,
  type Step,
} from './session'

/**
 * The live practice run: its state, its writes, and getting it back after the
 * app is closed.
 *
 * **Everything is written as it happens.** The session row is created on the
 * first answer and re-written after every one, and the run's position is parked
 * beside it. Sessions used to be filed once at the end, so answering forty
 * drills and leaving at forty-one discarded all forty. Now nothing is
 * provisional: what was answered is stored the moment it is answered.
 *
 * **The two rows are written on the same beat but not in one transaction.** If
 * the position write fails and the answers land, the reader loses an offer to
 * resume — annoying, survivable. The other way round would be a session that
 * offers to continue and has no record of what was done, which is worse than
 * either. So the answers go first.
 *
 * **Writes are fire-and-forget from the answer handler, serialised by a
 * promise chain.** A reader answering quickly can put two writes in flight for
 * one session row, and IndexedDB does not promise the later one lands last —
 * so a stale record could overwrite a newer one, losing the most recent answer.
 * Chaining makes each write wait for the one before it, which is ordering
 * without making the reader wait for the disk between questions.
 */

/** The run, once it exists, plus everything a screen does to it. */
export interface PracticeRunController {
  state: RunState | undefined
  /** The whole library, for rebuilding drills — distractors come from every word, not just the session's. */
  pool: SavedWord[]
  /** Start a fresh run over these words. Replaces any parked run. */
  start: (selection: PracticeSelection, words: SavedWord[], pool: SavedWord[]) => void
  /** Continue the parked run, if one was found. */
  resume: () => void
  answer: (outcome: Outcome) => void
  gradeCheckIn: (grade: UsageGrade) => void
  back: () => void
  /** Leave the session, keeping the answers and dropping the offer to resume. */
  quit: () => void
  /** Wipe the run's in-memory state once its end screen is done with it. */
  discard: () => void
}

/** What was found parked, once the store has been read. */
export type ResumeOffer =
  | { status: 'checking' }
  | { status: 'none' }
  | {
      status: 'found'
      selection: PracticeSelection
      /** The label of the card it came from, for the offer's copy. */
      label: string
      /** How far in, as a question number, so the offer can say where it stopped. */
      stepIndex: number
      wordCount: number
      startedAt: number
    }

interface Options {
  /** Told after any write that moves a word's schedule, so the nav badge stays current. */
  onProgress?: () => void
}

/** A parked run, resolved against the library and its filed answers. */
interface ParkedRun {
  words: SavedWord[]
  stepIndex: number
  sessionId: string
  startedAt: number
  selection: PracticeSelection
  /** What the session has already recorded, so resuming continues the row. */
  results: DrillResult[]
}

/**
 * Put filed results back onto the rebuilt steps.
 *
 * `DrillResult` stores a word and a drill kind, not a step index — the index
 * belongs to a queue that is rebuilt on resume and could differ in length. So
 * the match is by `(wordId, drill)`, walked in step order and consumed as it
 * goes, which lands each result on the step that asked it.
 *
 * **Skips do not come back, and that is correct.** A skip is deliberately not
 * in `results`, so a resumed session offers its skipped questions again. That
 * is the better answer anyway: "I don't know this yet" is a statement about a
 * moment, and a reader returning to a session is entitled to another look.
 *
 * Anything that cannot be matched is dropped rather than guessed at. A result
 * with no step is a word whose drills changed since, and inventing a position
 * for it would put an answer against a question nobody was asked.
 */
function replayAnswers(steps: Step[], results: DrillResult[]): Map<number, AnsweredStep> {
  const remaining = new Map<string, boolean[]>()
  for (const result of results) {
    const key = `${result.wordId}:${result.drill}`
    const list = remaining.get(key)
    if (list) list.push(result.correct)
    else remaining.set(key, [result.correct])
  }

  const answers = new Map<number, AnsweredStep>()
  steps.forEach((step, index) => {
    if (step.kind !== 'drill') return
    const key = `${step.card.word.id}:${step.card.drill.kind}`
    const list = remaining.get(key)
    if (!list || list.length === 0) return
    const correct = list.shift()
    answers.set(index, { outcome: correct ? 'correct' : 'wrong' })
  })

  return answers
}

export function usePracticeRun({ onProgress }: Options = {}) {
  const [state, setState] = useState<RunState | undefined>(undefined)
  const [pool, setPool] = useState<SavedWord[]>([])
  const [offer, setOffer] = useState<ResumeOffer>({ status: 'checking' })

  /*
   * The current run, readable synchronously.
   *
   * Every handler below computes the next state from this rather than from a
   * `setState` updater, and the reason is the writes. An updater can be called
   * twice for one transition — React does exactly that in development — so a
   * database write from inside one files the same answer twice. Reading the
   * run from a ref moves the whole transition outside: compute once, write
   * once, then set the state.
   *
   * `state` is still what renders. This is the same value, kept in step by
   * `write` below so the two can never describe different runs.
   */
  const live = useRef<RunState | undefined>(undefined)

  const write = useCallback((next: RunState | undefined) => {
    live.current = next
    setState(next)
  }, [])

  /*
   * The parked run, held from the check so `resume` does not have to read it
   * again — and so the offer's copy and the run it starts can never describe
   * two different things.
   */
  const parked = useRef<ParkedRun | undefined>(undefined)

  /*
   * Serialises the writes. Every write appends to this chain rather than racing
   * its neighbours, so the last answer is always the last thing on disk.
   */
  const writes = useRef<Promise<void>>(Promise.resolve())

  const enqueue = useCallback((work: () => Promise<void>) => {
    writes.current = writes.current.then(work, work)
  }, [])

  /* Look for a run to continue ---------------------------------------------- */

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const [words, run] = await Promise.all([listWords(), getCurrentRun()])
      if (cancelled) return
      setPool(words)

      if (!run) {
        setOffer({ status: 'none' })
        return
      }

      /*
       * Resolve the parked ids against the library as it is *now*, dropping
       * anything deleted since. A run is only worth offering back if enough of
       * it survives to be a session — one word left out of ten is a different
       * session wearing the old one's name, but it is still that reader's
       * unfinished work, so the bar is simply that something is left.
       */
      const byId = new Map(words.map((word) => [word.id, word]))
      const survivors = run.wordIds
        .map((id) => byId.get(id))
        .filter((word): word is SavedWord => word !== undefined)

      if (survivors.length === 0) {
        await clearCurrentRun()
        if (!cancelled) setOffer({ status: 'none' })
        return
      }

      /*
       * The answers already filed for this session, read back so resuming
       * continues the record rather than replacing it.
       *
       * **This is the difference between resuming and quietly destroying the
       * work.** Every answer re-writes the whole session row from the run's own
       * state, so a run resumed with an empty answer map would file a row
       * holding one answer the next time anything was answered — overwriting
       * the forty already stored. Incremental writes and resume only work
       * together if what comes back is what went in.
       */
      const filed = await getSession(run.sessionId)

      parked.current = {
        words: survivors,
        stepIndex: run.stepIndex,
        sessionId: run.sessionId,
        startedAt: run.startedAt,
        selection: run.selection,
        results: filed?.results ?? [],
      }

      setOffer({
        status: 'found',
        selection: run.selection,
        label: practiceCard(run.selection)?.label ?? 'Practice',
        stepIndex: run.stepIndex,
        wordCount: survivors.length,
        startedAt: run.startedAt,
      })
    })()

    return () => {
      cancelled = true
    }
  }, [])

  /* Starting and resuming ---------------------------------------------------- */

  const start = useCallback(
    (selection: PracticeSelection, words: SavedWord[], nextPool: SavedWord[]) => {
      setPool(nextPool)
      setOffer({ status: 'none' })
      parked.current = undefined
      /*
       * The old parked run goes now rather than when the new one first writes.
       * Starting a session is the reader saying they are done with the last
       * one, and leaving it parked would mean a run that offers to resume
       * something they already walked away from.
       */
      enqueue(() => clearCurrentRun())

      write({
        sessionId: crypto.randomUUID(),
        selection,
        startedAt: Date.now(),
        words,
        steps: buildSteps(words, nextPool),
        index: 0,
        answers: new Map(),
      })
    },
    [enqueue, write],
  )

  const resume = useCallback(() => {
    const run = parked.current
    if (!run) return
    setOffer({ status: 'none' })

    /*
     * The queue is rebuilt from the words rather than restored, so a word
     * edited since can change how many drills it carries. The stored index is
     * therefore clamped rather than trusted: past the end it lands on the last
     * step, which is a resume one question off rather than a blank screen.
     */
    const steps = buildSteps(run.words, pool)
    write({
      sessionId: run.sessionId,
      selection: run.selection,
      startedAt: run.startedAt,
      words: run.words,
      steps,
      index: Math.min(run.stepIndex, Math.max(steps.length - 1, 0)),
      answers: replayAnswers(steps, run.results),
    })
  }, [pool, write])

  /* Writing ------------------------------------------------------------------ */

  /**
   * File the session and park the position.
   *
   * `completed` is passed in rather than derived here, because "reached the
   * end" is a fact about the transition that produced this state, not about the
   * state itself: the last step answered and the session finished look
   * identical once the index has stopped moving.
   */
  const persist = useCallback(
    (next: RunState, completed: boolean) => {
      enqueue(async () => {
        await putSession(sessionRecord(next, completed))
        if (completed) {
          await clearCurrentRun()
        } else {
          await putCurrentRun(runRecord(next))
        }
      })
    },
    [enqueue],
  )

  /**
   * Take an answered transition: store it, then file it.
   *
   * State first so the next question paints without waiting for the disk, and
   * the write is queued rather than awaited for the same reason. `completed` is
   * a property of the transition — whether it ran off the end of the queue —
   * not of the state, which is why `advance` reports it rather than this
   * re-deriving it from an index that has stopped moving.
   */
  const commit = useCallback(
    ({ next, completed }: Transition) => {
      write(next)
      persist(next, completed)
    },
    [persist, write],
  )

  /* Answering ---------------------------------------------------------------- */

  /**
   * Record a drill answer and move on.
   *
   * The schedule moves here too, and the three outcomes move it differently:
   *
   * - **Correct** logs a `practice` usage and nudges the word's status, exactly
   *   as before. A correct drill never takes a word past `rehearsed` — only
   *   real use reaches `used`.
   * - **Wrong** and **skipped** both reach the scheduler as `not-yet`, which is
   *   FSRS's Again: come back soon. This is the one place the two agree, and it
   *   is why the skip is not a way of dodging the schedule.
   *
   * Only a correct answer writes a usage row. A miss is not a use, and a skip
   * is not even an attempt.
   */
  const answer = useCallback(
    (outcome: Outcome) => {
      const current = live.current
      if (!current) return
      const step = current.steps[current.index]
      if (step?.kind !== 'drill') return

      const word = step.card.word

      if (outcome === 'correct') {
        const advances = word.status === 'spotted' || word.status === 'understood'
        enqueue(() =>
          recordUsageCheckIn(
            word,
            { status: advances ? 'rehearsed' : word.status, fsrs: word.fsrs },
            { id: crypto.randomUUID(), wordId: word.id, at: Date.now(), kind: 'practice' },
          ),
        )
      } else {
        /*
         * A miss or a skip shortens the interval and logs nothing. The word
         * object in hand carries the pre-answer schedule, which is the right
         * input — the session's copy of a word is not re-read mid-run, so every
         * grade in one session builds on the one before it.
         */
        enqueue(() =>
          recordUsageCheckIn(word, {
            status: word.status,
            fsrs: nextFSRSState(word.fsrs, 'not-yet'),
          }),
        )
      }

      commit(advance(current, { outcome }))
      onProgress?.()
    },
    [commit, enqueue, onProgress],
  )

  const gradeCheckIn = useCallback(
    (grade: UsageGrade) => {
      const current = live.current
      if (!current) return
      const step = current.steps[current.index]
      if (step?.kind !== 'check-in') return

      const word = step.word
      /*
       * Status, schedule, and the use itself in one transaction. As two calls
       * this raced: the usage write re-read the word and could put back the
       * pre-status version, so a word could log a use and keep its old status.
       */
      enqueue(() =>
        recordUsageCheckIn(
          word,
          {
            status: grade === 'used' ? (word.status === 'owned' ? 'owned' : 'used') : word.status,
            fsrs: nextFSRSState(word.fsrs, grade),
          },
          grade === 'used'
            ? { id: crypto.randomUUID(), wordId: word.id, at: Date.now(), kind: 'wild' }
            : undefined,
        ),
      )

      commit(advance(current, { outcome: 'correct', usageGrade: grade }))
      onProgress?.()
    },
    [commit, enqueue, onProgress],
  )

  const back = useCallback(() => {
    const current = live.current
    if (!current || current.index === 0) return
    write({ ...current, index: current.index - 1 })
  }, [write])

  const quit = useCallback(() => {
    const current = live.current
    if (!current) return
    /*
     * The answers stay; only the offer to resume goes. Quitting is the reader
     * saying they are done with this run, and a session that keeps offering
     * itself back after that is not respecting the answer.
     */
    enqueue(async () => {
      if (hasAnswers(current)) await putSession(sessionRecord(current, false))
      await clearCurrentRun()
    })
    write(undefined)
    onProgress?.()
  }, [enqueue, onProgress, write])

  const discard = useCallback(() => write(undefined), [write])

  return { state, pool, offer, start, resume, answer, gradeCheckIn, back, quit, discard }
}

/* -------------------------------------------------------------------------- */

/** The result of answering a step: where the run now is, and whether that was the last one. */
interface Transition {
  next: RunState
  completed: boolean
}

/**
 * Record an answer at the current step and move to the next.
 *
 * Pure — it computes, it does not write. One function because recording and
 * advancing are one action, and splitting them lets them disagree: an answer
 * stored without advancing leaves a card that cannot be re-answered and will
 * not move on.
 *
 * **Re-answering a step replaces its answer rather than adding one.** Back
 * replays an answered step rather than clearing it, so this is mostly
 * defensive — but a map keyed on the step index means a second answer can only
 * overwrite the first, and every count is derived from the map rather than
 * accumulated, so no tally can double-count.
 */
function advance(current: RunState, answered: AnsweredStep): Transition {
  const answers = new Map(current.answers)
  answers.set(current.index, answered)

  const nextIndex = current.index + 1
  const completed = nextIndex >= current.steps.length

  return {
    completed,
    next: {
      ...current,
      answers,
      // A finished run stays on its last step. The end screen is a route, so
      // the index no longer has to encode "past the end" to reach it.
      index: completed ? current.index : nextIndex,
    },
  }
}

/** Whether this step has been answered, for replaying it on Back. */
export function answerFor(state: RunState, index: number): AnsweredStep | undefined {
  return state.answers.get(index)
}

export type { Step }

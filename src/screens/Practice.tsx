import { useCallback, useEffect, useMemo, useState } from 'react'
import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import type { SavedWord, WordStatus } from '../types/domain'
import { addUsage, listWords, saveWord } from '../storage/db'
import { buildPracticeQueue, type PracticeCard } from '../domain/puzzles'
import { nextFSRSState, type UsageGrade } from '../domain/scheduler'
import { DefinitionMatchCard } from '../components/practice/DefinitionMatchCard'
import { FillBlankCard } from '../components/practice/FillBlankCard'
import { SynonymMatchCard } from '../components/practice/SynonymMatchCard'
import { OddOneOutCard } from '../components/practice/OddOneOutCard'
import { UsagePromptCard } from '../components/practice/UsagePromptCard'
import styles from './Practice.module.css'

/**
 * One session: every saved word gets its full run of drills, back to back.
 *
 * Every word in the library is in scope every session — due-date is not a
 * filter here. FSRS's schedule is a signal for later (the Progress page),
 * not a gate on what shows up to practise: a word answered "not yet" a
 * minute ago must still be practiseable a minute later.
 *
 * A word's drills run in the fixed order `buildDrillsForWord` returns —
 * typed recall before multiple choice — so working through one word reads as
 * *practising that word*, not a shuffled deck that happens to mention it
 * once. The usage check-in appears once, after a word's last drill, and its
 * answer never blocks or skips anything; it only feeds the schedule.
 *
 * "Steps", not just "cards": a step is either a drill or the usage check-in
 * that follows a word's last drill, so Back can move through both uniformly.
 * Going back replays the step's already-answered state — its question and
 * the answer strip together — rather than clearing it for a re-attempt,
 * which would double-count the same drill against the session's score.
 *
 * The queue is fixed for the session: built once on entry, not re-read as
 * answers come in, so leaving mid-session and coming back does not reshuffle
 * out from under a reader partway through.
 */

interface PracticeProps {
  /** Told after every answer that moves a word's schedule, so the nav badge stays current. */
  onProgress?: () => void
}

type Step = (
  | {
      kind: 'drill'
      card: PracticeCard
      /** 0-based position of this drill among its word's drills (the check-in is not counted). */
      drillIndex: number
      /** How many drills this word has — the denominator for "Question N of M". */
      drillCount: number
    }
  | { kind: 'check-in'; word: SavedWord }
) & {
  /** 0-based position of this step's word within the session — the same for every step of that word. */
  wordIndex: number
}

/** One step already answered, replayed when Back returns to it. */
type AnsweredStep = { step: Step; correct: boolean; usageGrade?: UsageGrade }

type SessionState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'active'; steps: Step[]; index: number; history: Map<number, AnsweredStep>; correct: number; answered: number }
  | { status: 'done'; total: number; correct: number }

export function Practice({ onProgress }: PracticeProps) {
  const [session, setSession] = useState<SessionState>({ status: 'loading' })

  const start = useCallback(async () => {
    setSession({ status: 'loading' })
    const all = await listWords()
    const cards = buildPracticeQueue(all)
    if (cards.length === 0) {
      setSession({ status: 'empty' })
      return
    }

    // Each word's drills are consecutive, so a per-word count is a single pass:
    // it's the denominator for the "Question N of M" line in the head.
    const drillCountByWord = new Map<string, number>()
    for (const card of cards) {
      drillCountByWord.set(card.word.id, (drillCountByWord.get(card.word.id) ?? 0) + 1)
    }

    const steps: Step[] = []
    let wordIndex = 0
    let drillIndex = 0
    for (const card of cards) {
      const drillCount = drillCountByWord.get(card.word.id) ?? 1
      steps.push({ kind: 'drill', card, wordIndex, drillIndex, drillCount })
      drillIndex++
      if (card.isLastForWord) {
        steps.push({ kind: 'check-in', word: card.word, wordIndex })
        wordIndex++
        drillIndex = 0
      }
    }

    setSession({ status: 'active', steps, index: 0, history: new Map(), correct: 0, answered: 0 })
  }, [])

  useEffect(() => {
    void start()
  }, [start])

  const goBack = useCallback(() => {
    setSession((current) => {
      if (current.status !== 'active' || current.index === 0) return current
      return { ...current, index: current.index - 1 }
    })
  }, [])

  const goNext = useCallback(() => {
    setSession((current) => {
      if (current.status !== 'active') return current
      const nextIndex = current.index + 1
      if (nextIndex >= current.steps.length) {
        return { status: 'done', total: current.answered, correct: current.correct }
      }
      return { ...current, index: nextIndex }
    })
  }, [])

  const recordDrillAnswer = useCallback(
    async (word: SavedWord, step: Step, correct: boolean) => {
      if (correct) {
        await addUsage({ id: crypto.randomUUID(), wordId: word.id, at: Date.now(), kind: 'practice' })
        if (word.status === 'spotted' || word.status === 'understood') {
          await saveWord({ ...word, status: 'rehearsed' })
        }
        onProgress?.()
      }

      setSession((current) => {
        if (current.status !== 'active') return current
        const history = new Map(current.history)
        const alreadyAnswered = history.has(current.index)
        history.set(current.index, { step, correct })
        return {
          ...current,
          history,
          correct: current.correct + (alreadyAnswered ? 0 : correct ? 1 : 0),
          answered: current.answered + (alreadyAnswered ? 0 : 1),
        }
      })
      goNext()
    },
    [goNext, onProgress],
  )

  const recordUsageCheckIn = useCallback(
    async (word: SavedWord, step: Step, grade: UsageGrade) => {
      const fsrs = nextFSRSState(word.fsrs, grade)
      const nextStatus = statusAfterUsage(word.status, grade)
      await saveWord({ ...word, fsrs, status: nextStatus })
      if (grade === 'used' || grade === 'almost') {
        await addUsage({ id: crypto.randomUUID(), wordId: word.id, at: Date.now(), kind: 'wild' })
      }
      onProgress?.()

      setSession((current) => {
        if (current.status !== 'active') return current
        const history = new Map(current.history)
        history.set(current.index, { step, correct: true, usageGrade: grade })
        return { ...current, history }
      })
      goNext()
    },
    [goNext, onProgress],
  )

  const step = session.status === 'active' ? session.steps[session.index] : undefined
  const answeredEntry = session.status === 'active' ? session.history.get(session.index) : undefined

  const progressLabel = useMemo(() => {
    if (session.status !== 'active') return undefined
    // Two grains of progress. The word line is the one a reader tracks across
    // the whole session; the question line shows movement *within* a word, so a
    // word's four drills no longer read as one frozen number. The check-in isn't
    // a question, so it carries no question line.
    const totalWords = session.steps[session.steps.length - 1].wordIndex + 1
    const currentStep = session.steps[session.index]
    return {
      word: `Word ${currentStep.wordIndex + 1} of ${totalWords}`,
      question:
        currentStep.kind === 'drill'
          ? `Question ${currentStep.drillIndex + 1} of ${currentStep.drillCount}`
          : undefined,
    }
  }, [session])

  if (session.status === 'loading') {
    return (
      <div className={styles.screen}>
        <p className={styles.state}>Building today’s session…</p>
      </div>
    )
  }

  if (session.status === 'empty') {
    return (
      <div className={styles.screen}>
        <h1 className={styles.title}>Practice</h1>
        <p className={styles.state}>
          Nothing to practise yet. Save a few more words in Look Up, and there will be enough
          here to work through.
        </p>
      </div>
    )
  }

  if (session.status === 'done') {
    return (
      <div className={styles.screen}>
        <h1 className={styles.title}>Session complete</h1>
        <p className={styles.summary}>
          {session.correct} of {session.total} landed.
        </p>
        <button type="button" className={styles.again} onClick={() => void start()}>
          Practise again
          <RightOutlined />
        </button>
      </div>
    )
  }

  return (
    <div className={styles.screen}>
      <div className={styles.head}>
        <button
          type="button"
          className={styles.backButton}
          onClick={goBack}
          disabled={session.index === 0}
          aria-label="Previous"
        >
          <LeftOutlined />
        </button>
        <div className={styles.progress}>
          <span className={styles.progressWord}>{progressLabel?.word}</span>
          {progressLabel?.question && (
            <span className={styles.progressQuestion}>{progressLabel.question}</span>
          )}
        </div>
      </div>

      {step?.kind === 'check-in' && (
        <UsagePromptCard
          key={`${step.word.id}:check-in:${session.index}`}
          word={step.word}
          answered={answeredEntry?.usageGrade}
          onAnswer={(grade) => void recordUsageCheckIn(step.word, step, grade)}
        />
      )}

      {step?.kind === 'drill' && (
        <DrillCardView
          key={`${step.card.word.id}:${step.card.drill.kind}:${session.index}`}
          card={step.card}
          answered={answeredEntry?.correct}
          onAnswer={(correct) => void recordDrillAnswer(step.card.word, step, correct)}
        />
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function DrillCardView({
  card,
  answered,
  onAnswer,
}: {
  card: PracticeCard
  /** Set when Back has returned to an already-answered card — renders the same reveal without letting it re-submit. */
  answered: boolean | undefined
  onAnswer: (correct: boolean) => void
}) {
  switch (card.drill.kind) {
    case 'definition-match':
      return <DefinitionMatchCard drill={card.drill} answered={answered} onAnswer={onAnswer} />
    case 'fill-blank':
      return <FillBlankCard drill={card.drill} answered={answered} onAnswer={onAnswer} />
    case 'synonym-match':
      return <SynonymMatchCard drill={card.drill} answered={answered} onAnswer={onAnswer} />
    case 'odd-one-out':
      return <OddOneOutCard drill={card.drill} answered={answered} onAnswer={onAnswer} />
  }
}

/**
 * Status only moves on the usage check-in — a drill answered correctly moves
 * a word to `rehearsed` at most (handled at the call site), never past it.
 * Real use is the one thing that should ever reach `used` or `owned`.
 */
function statusAfterUsage(current: WordStatus, grade: UsageGrade): WordStatus {
  if (grade === 'used') return current === 'used' || current === 'owned' ? 'owned' : 'used'
  if (grade === 'almost') return current === 'spotted' ? 'rehearsed' : current
  return current
}

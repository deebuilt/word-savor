import { useState } from 'react'
import { LeftOutlined } from '@ant-design/icons'
import type { UsageGrade } from '../domain/scheduler'
import type { PracticeCard } from '../domain/puzzles'
import type { Outcome, RunState } from '../practice/session'
import { questionCount } from '../practice/session'
import { DefinitionMatchCard } from '../components/practice/DefinitionMatchCard'
import { FillBlankCard } from '../components/practice/FillBlankCard'
import { FragmentClozeCard } from '../components/practice/FragmentClozeCard'
import { SynonymMatchCard } from '../components/practice/SynonymMatchCard'
import { OddOneOutCard } from '../components/practice/OddOneOutCard'
import { UsagePromptCard } from '../components/practice/UsagePromptCard'
import styles from './PracticeSession.module.css'

/**
 * The session itself — one step at a time.
 *
 * A word's drills run consecutively, in the order `buildDrillsForWord` returns
 * (typed recall before multiple choice), so working through one word reads as
 * *practicing that word* rather than as a shuffled deck that mentions it once.
 * The usage check-in appears after a word's last drill and never blocks
 * anything; it only feeds the schedule.
 *
 * **Going back replays an answered step rather than clearing it.** The question
 * and its answer strip come back together, which is what Back is for — checking
 * what you just did. Offering a re-attempt would let the same drill be answered
 * twice, and while the counts are derived from a map keyed on the step and so
 * cannot double, a second attempt after seeing the answer is not a second
 * answer to the same question.
 *
 * **Quitting confirms, but only once there is something to lose.** Leaving
 * before answering anything has nothing to warn about, so it simply leaves.
 * After the first answer the confirm names what happens — the answers are kept,
 * which is true now in a way it was not before, and the reader should not have
 * to guess at it.
 */

interface PracticeSessionProps {
  run: RunState
  onAnswer: (outcome: Outcome) => void
  onGradeCheckIn: (grade: UsageGrade) => void
  onBack: () => void
  onQuit: () => void
}

export function PracticeSession({
  run,
  onAnswer,
  onGradeCheckIn,
  onBack,
  onQuit,
}: PracticeSessionProps) {
  const [confirmingQuit, setConfirmingQuit] = useState(false)

  /*
   * Which step, if any, the reader has declined.
   *
   * The step index rather than a boolean, so it resets itself by never matching
   * a step the reader has not declined. As a boolean it would need an effect to
   * clear it on every move, and an effect that clears a flag one render late
   * shows question five already revealed.
   *
   * Local rather than in the run's state because it is not part of the record:
   * a skip only becomes a fact when the reader taps Next, and until then it is
   * a reveal they can still leave by going back.
   */
  const [skippedStep, setSkippedStep] = useState<number | undefined>(undefined)
  const skipped = skippedStep === run.index

  const step = run.steps[run.index]
  const answered = run.answers.get(run.index)
  const total = questionCount(run.steps)

  /*
   * How many questions deep, counting the drills before this step.
   *
   * Derived from the step's own indices rather than from a counter, so it is a
   * property of *where you are* rather than of how you got here — Back moves it
   * without any bookkeeping, and a resumed session reports the same number it
   * reported before the app closed.
   */
  const questionNumber =
    run.steps.slice(0, run.index + 1).filter((entry) => entry.kind === 'drill').length

  if (!step) return null

  return (
    <div className={styles.screen}>
      <div className={styles.head}>
        <button
          type="button"
          className={styles.backButton}
          onClick={onBack}
          disabled={run.index === 0}
          aria-label="Previous question"
        >
          <LeftOutlined />
        </button>

        {/*
         * The progress line reads as a fraction of questions, not of steps. A
         * reader counts questions; the check-in is not one, so folding it into
         * the denominator would make the session look a quarter longer than the
         * landing page said it was — and that estimate is the whole reason the
         * landing page exists.
         */}
        <span className={styles.progress}>
          {step.kind === 'drill'
            ? `Question ${questionNumber} of ${total}`
            : `Word ${step.wordIndex + 1} of ${run.words.length}`}
        </span>

        <button
          type="button"
          className={styles.quitButton}
          onClick={() => (run.answers.size > 0 ? setConfirmingQuit(true) : onQuit())}
        >
          Quit
        </button>
      </div>

      <div className={styles.bar} aria-hidden="true">
        <span
          className={styles.barFill}
          style={{ width: `${total === 0 ? 0 : (questionNumber / total) * 100}%` }}
        />
      </div>

      {step.kind === 'check-in' ? (
        <UsagePromptCard
          key={`${step.word.id}:check-in:${run.index}`}
          word={step.word}
          answered={answered?.usageGrade}
          onAnswer={onGradeCheckIn}
        />
      ) : (
        <>
          <DrillCardView
            key={`${step.card.word.id}:${step.card.drill.kind}:${run.index}`}
            card={step.card}
            answered={answered?.outcome ?? (skipped ? 'skipped' : undefined)}
            onAnswer={onAnswer}
          />

          {/*
           * "I don't know this yet" sits below the card, out of the way of
           * answering it.
           *
           * **It reveals rather than advances.** Tapping it puts the card into
           * its settled state, which is the same reveal a miss produces — the
           * teaching moment is the point, and a skip that jumped straight to
           * the next question would punish the honest answer by showing less
           * than the wrong one does. The card's own Next button then moves on
           * and reports `skipped`, so the reveal and the record stay one flow.
           *
           * What it does not do is write a wrong answer nobody meant. It is
           * absent once the step is settled, because the answer is already on
           * screen and there is nothing left to decline.
           */}
          {!answered && !skipped && (
            <button type="button" className={styles.skip} onClick={() => setSkippedStep(run.index)}>
              I don’t know this yet
            </button>
          )}
        </>
      )}

      {confirmingQuit && (
        <div className={styles.confirmScrim} role="dialog" aria-modal="true">
          <div className={styles.confirm}>
            <p className={styles.confirmTitle}>Quit this session?</p>
            <p className={styles.confirmBody}>
              Everything you have answered so far is already saved. You just will not be
              offered this session again.
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.confirmCancel}
                onClick={() => setConfirmingQuit(false)}
              >
                Keep going
              </button>
              <button type="button" className={styles.confirmQuit} onClick={onQuit}>
                Quit
              </button>
            </div>
          </div>
        </div>
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
  /** Set when the step is settled — replays the reveal without letting it re-submit. */
  answered: Outcome | undefined
  onAnswer: (outcome: Outcome) => void
}) {
  switch (card.drill.kind) {
    case 'definition-match':
      return <DefinitionMatchCard drill={card.drill} answered={answered} onAnswer={onAnswer} />
    case 'fill-blank':
      return <FillBlankCard drill={card.drill} answered={answered} onAnswer={onAnswer} />
    case 'fragment-cloze':
      return <FragmentClozeCard drill={card.drill} answered={answered} onAnswer={onAnswer} />
    case 'synonym-match':
      return <SynonymMatchCard drill={card.drill} answered={answered} onAnswer={onAnswer} />
    case 'odd-one-out':
      return <OddOneOutCard drill={card.drill} answered={answered} onAnswer={onAnswer} />
  }
}

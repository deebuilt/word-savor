# Practice progress — streaks, history & metrics plan

Status: **built 2026-09-17** — all three layers shipped. See "What shipped" at
the bottom for the dated completion notes, including the two places the build
departed from this plan and why. Awaiting Ruthnie's in-app verification before
the build-and-commit step.

This is the "enhance practice" work: remembering sessions, streaks, scores, and
a Progress page. Split out from `practice-clarity-plan.md` on purpose — that doc
is about making individual drills clear; this one is about tracking practice
over time.

## Guiding idea

The app's core belief is that a vocabulary is *what you reach for*, not what you
can define. So progress should celebrate the status ladder
(`spotted → understood → rehearsed → used → owned`) and real-world use, not just
raw drill counts. Metrics should feel like evidence you're building a
vocabulary, not a video-game score.

## What already exists (groundwork is done)

- **`PracticeSession` type** (`src/types/domain.ts`) — `id`, `startedAt`,
  `endedAt`, `mode`, `wordIds`, `correct`, `total`. Written for exactly this;
  its own comment says "for streaks and history."
- **`sessions` object store** (`src/storage/db.ts`) with a `by-date` index on
  `startedAt`. Ready to write to — nothing does yet.
- **`usages` store** — every correct drill already logs a `{ kind: 'practice' }`
  usage with a timestamp; wild use logs `{ kind: 'wild' }`. A dated activity log
  already exists.
- **Word status** per word (the ladder above) and **FSRS** state (due dates,
  reps, lapses).

None of this needs the API — it's all local/offline, consistent with the app.

## Layered plan (smallest first — stop wherever it feels like enough)

### Layer 1 — Persist a session on completion
When Practice reaches the `done` state, write one `PracticeSession` record
(date, correct/total, wordIds). ~15 lines using the existing store. This is the
foundation everything else reads from. Right now the "X of Y landed" screen just
evaporates.

### Layer 2 — Streak + a few honest metrics
- **Streak** = consecutive calendar days with a completed session (see open
  question below). Current streak + longest streak, computed from the `sessions`
  store grouped by local day.
- **Metrics that fit the app's philosophy**, e.g.:
  - words on each rung of the status ladder (the headline)
  - wild uses this week (the real goal)
  - sessions this week, accuracy trend
  Avoid a wall of vanity stats.

### Layer 3 — The Progress page
A new screen (likely a new bottom-nav tab) showing the above. Design layer.

## Open decisions (answer before building)

1. **What earns a streak day?** Leaning: *completing a practice session*.
   Alternative: any activity (saving or using a word) also counts — gentler, but
   less about practice.
2. **Where does Progress live** — new bottom-nav tab, or folded into an existing
   screen?
3. **First-pass scope** — recommend Layer 1 + a simple Layer 2/3, live with it
   before adding charts or richer metrics.

## Note

Do this after the richer-drills work in `practice-clarity-plan.md` lands, or in
parallel — they don't conflict (different files).

---

## What shipped — 2026-09-17

All three layers, plus the open decisions answered. Typecheck clean; `oxlint`
reports the same four pre-existing `set-state-in-effect` warnings as before and
none from the new files.

### The open decisions, as decided

1. **What earns a streak day:** a completed practice session **or one wild
   use**. Saving a word does not. This extends the plan's leaning rather than
   just taking it — a wild use is the strongest evidence the app's whole
   argument is working, so honouring a drill session while ignoring a real
   conversation would measure the rehearsal and not the performance. Capture is
   excluded because it costs nothing: a streak kept by pasting a word a day is a
   streak about opening the app.
2. **Where Progress lives:** the existing `progress` nav tab. It was already in
   `TabKey`, already had `RiseOutlined` in `BottomBar`, and was reserved at
   `BUILD_PLAN.md:105` — so there was nothing to decide, only a placeholder to
   replace.
3. **First-pass scope:** Layers 1 + 2 + a real Layer 3, no charts. Ladder
   distribution is the headline, wild uses this week second.

### Layer 1 — session persistence

- [`db.ts`](../src/storage/db.ts) — `addSession`, `listSessions`, and
  `listUsagesSince` (a date-bounded read off the existing `by-date` index, so
  counting this week never loads a year).
- [`Practice.tsx`](../src/screens/Practice.tsx) — `startedAt` is stamped when
  the queue is built, and the `done` state now carries the whole
  `PracticeSession` record.

**One structural departure from "~15 lines":** the write does **not** happen in
the `setSession` updater that reaches `done`. A state updater is a pure reducer
that React can call twice for one transition, so a `db.put` in there files the
same session twice — one row too many in the exact store every streak is counted
from. The updater builds the record; an effect guarded by a `useRef` on the
record's id writes it. That also survives StrictMode's double-mount.

**`PracticeSession.mode` changed.** The plan inherited `'recall' | 'usage'`, but
a session today interleaves recall drills *and* usage check-ins, so neither
value was true. Added `'mixed'` and made it what Practice writes, keeping the
other two for the puzzle modes. `total` is drills **answered**, not offered — a
run walked away from two questions in scored two, and padding the denominator
with untouched drills would make every honest session look failed.

### Layer 2 — the metrics

New [`domain/progress.ts`](../src/domain/progress.ts): `dayKey`,
`computeStreak`, `ladder`, `summariseWeek`. Every number is derived from the
logs rather than kept as a counter — a counter can only be wrong, drifting the
first time a word is deleted, with no way to notice.

Three things worth knowing:

- **Days are local calendar days, built from date parts, never `toISOString`.**
  A streak is about the day the *reader* had. `toISOString` converts to UTC, so
  an 11pm Tuesday session would file under Wednesday.
- **Streaks are counted by stepping the calendar**, comparing day-key strings,
  not by diffing timestamps. Keeps DST and month-ends out of the arithmetic
  entirely — adding 24 hours across a spring-forward lands on the wrong day.
- **Today is not required to hold a streak.** A run ending yesterday is still
  current until the day is out; `earnedToday` tells the UI which it is. The
  alternative is an app that tells you at breakfast you lost something you still
  have all day to keep.

**Verified, not assumed.** A throwaway `tsx` harness ran 26 cases: empty
history, today-only, the yesterday grace window, a broken run, `longest`
correctly beating `current` across a gap, a wild use earning a day, a *practice*
usage correctly **not** earning one, mixed sources bridging a run, two sessions
on one day counting once, a run across the Aug/Sep boundary, and the
11pm/12:30am locality pair. All 26 pass.

### Layer 3 — the Progress screen

- [`Progress.tsx`](../src/screens/Progress.tsx) + its CSS module.
- [`LadderBar.tsx`](../src/components/progress/LadderBar.tsx) — the status
  distribution as one proportional bar over a legend.
- [`App.tsx`](../src/App.tsx) — placeholder replaced; `Placeholder` became
  `More`. A `progressToken` now bumps on save, delete, and session-complete,
  because Progress is the one screen whose every number moves while it is
  closed.

**Design:** an editorial column — rules between sections, no cards, no tile
grid, one large figure (the streak, in gold, the word face). A dashboard layout
would make five numbers look equally important and they are not. Rungs at zero
stay in the legend and drop out of the bar: the goal has to stay visible at
zero, but an invisible segment with a label is not a thing. `LadderBar` reuses
`StatusMark`'s exact colour tokens so the library and this screen don't read as
two apps.

**What was deliberately left out:** drill totals, points, accuracy-over-time
charts. An app that leads with volume teaches you to value volume. Accuracy
appears once, in a sentence, as honest session feedback — not as the goal.
Absent values say so: accuracy is `undefined` rather than `0` when nothing was
answered, because "0%" reads as failure where the truth is absence.

### Still open

- **Ruthnie's in-app verification before the full build and commit.**
- The streak's usage read is bounded to one year (`streakLookback`). Fine for
  every number shown; noted in case an all-time metric ever wants more.
- Phase 3's other items remain unbuilt: rarity distribution, the usage-sentence
  history, and constellations from `related[]`.

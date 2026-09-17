# Practice progress — streaks, history & metrics plan

Status: planning only, for a future session. No code changed yet. This is the
"enhance practice" work: remembering sessions, streaks, scores, and a Progress
page. Split out from `practice-clarity-plan.md` on purpose — that doc is about
making individual drills clear; this one is about tracking practice over time.

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

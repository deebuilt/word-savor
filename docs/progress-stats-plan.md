# Stats — what to show, and where

## The rules every stat must follow

Settled 2026-09-17 after the Progress page reported a four-word library as
"saved 0, practiced 2". **These are binding for every future stat, on every
page.** Read them before adding a number to any screen.

### 1. Counts come from the `usages` log, never from `SavedWord.status`

`status` is **one slot per word**. A word can be saved *and* practiced *and*
used — all true at once, none cancelling the others — and a single value cannot
hold that. Writing `rehearsed` erased "saved"; writing `used` erased
"practiced". Any count derived from `status` is therefore wrong by construction,
which is exactly how "saved 0" happened with four words in the library.

`usages` is an append-only event log. Each question is asked of it
independently, and the answers are allowed to overlap. `libraryTotals()` in
[`domain/progress.ts`](../src/domain/progress.ts) is the pattern to copy.

`status` keeps one legitimate use: `used` is the single value a reader genuinely
reports, so it answers "has *this* word been used" for one word. Never for a
count.

### 2. Overlapping counts must not be drawn as a stacked bar

A stacked proportional bar can only show **parts of one whole**. These counts
overlap, so segmenting them was what made "saved" render as an empty row. Show
overlapping figures as plain counts out of the total (`3 of 4`). A bar is only
honest for a genuine either/or.

### 3. Never report a number the app cannot observe

Two stored statuses were dropped from every screen for failing this:

- **`understood`** — nothing in the app can set it. There is no surface where a
  reader says they understand a word.
- **`owned`** — set by tapping "Used it" a second time, which records *returning
  to practice*, not using a word twice. As of 2026-09-17 it is **no longer
  written**; existing values read as `used`.

### 4. Say what was actually measured

`kind: 'wild'` is **self-reported and unverifiable**. So:

- **"Marked used"**, never "used N times". The count is button taps.
- Prefer **distinct words marked** over a tap total. "6 across 2 words" was
  unreadable and measured one word marked repeatedly across sessions.
- A drill is **one question**. A word generates about four per session.

### 5. Absence is not zero

Accuracy is `undefined`, not `0`, when nothing was answered — "0%" reads as
failure where the truth is that nothing happened. Omit the row instead.

### 6. Name the window, or do not imply one

A fixed "last seven days" heading with no control is a stat pretending to be a
view. Either give the range a control or show a trend where the axis is visible.

---


Written 2026-09-17, during the Progress-page cleanup session. This doc covers
the data points worth surfacing across the app and which screen each belongs on.
It is the follow-on from `practice-progress-plan.md`, which built the Progress
page's first pass (status breakdown, streak, last-seven-days).

## The organizing principle

The dividing line is the **scope of the question being asked**:

| Screen | The question it answers |
| --- | --- |
| **Progress** | About the whole library and your habits. "Am I building this, and what kind of vocabulary is it?" |
| **Practice** | About the session you just finished, and past sessions. "How did I do, and how does that compare?" |
| **Library** | Ranking or filtering words against each other. "Which words need attention?" |
| **Word detail** | One word's own history. "What has happened with this word?" |

Same underlying data, four altitudes. A stat belongs on the screen where its
question actually gets asked.

## What is already stored vs. what needs building

This is the part that decides how much is cheap. **Most of it is already in the
database** — the app has been recording more than it displays since Phase 1.

| Data | Stored? | Where |
| --- | --- | --- |
| Session date, correct, total, wordIds | **Yes**, since 2026-09-17 | `sessions` store, `by-date` index |
| Every use, dated, wild vs. practice | **Yes**, Phase 2 | `usages` store, `by-word` + `by-date` |
| Per-word use count and last-used date | **Yes**, denormalized | `SavedWord.usageCount`, `lastUsedAt` |
| Word rarity (frequency per million) | **Yes**, at save time | `SavedWord.rarity`, `by-rarity` index |
| Date each word was saved | **Yes**, Phase 1 | `SavedWord.addedAt`, `by-added` index |
| Word status | **Yes**, Phase 1 | `SavedWord.status`, `by-status` index |
| FSRS schedule and next due date | **Yes**, Phase 2 | `SavedWord.fsrs` |
| Where a word was encountered | Store exists, **barely written** | `encounters` store |
| **Per-word drill results** | **Yes**, since 2026-09-18 | `PracticeSession.results` |

So: of everything below, only the per-word practice record needed new storage,
and it now exists. Everything else is a read and a render.

---

## Progress page

### 1. Rarity spread — build this first

**Status: all data present. Nothing to store.**

Distribution of the library across the five rarity bands that
[`rarity.ts`](../src/domain/rarity.ts) already defines — everyday, common,
uncommon, rare, very rare. `rarityBand()` is written and tested.

**Why it leads:** it is the only stat in the app that describes *what kind* of
vocabulary is being built rather than how much of it there is. It also needs no
history — it is true and interesting the first time you open it, unlike every
session-based number.

It answers a real question Ruthnie raised: *coalesce* and *acquiesce* are words
that fit into ordinary speech, *obfuscate* takes intent to place. A library
skewed to "very rare" is a library that will be hard to actually use, and that
is worth knowing about the collection as a whole.

**Design:** the same bar-plus-rows treatment as the status breakdown, so the two
read as one system.

**Caveat that must be handled:** `rarity` is optional — Datamuse does not score
every word. Unscored words must be **excluded and counted separately**
("3 unscored"), never folded into "very rare." `rarityLabel()` already returns
`undefined` rather than inventing a band, and that decision has to be honored
here.

### 2. Uses over time

**Status: all data present.**

Wild uses per week, over the last several weeks, from the `usages` store's
`by-date` index.

**This replaces the "Last seven days" block.** That block's real problem is not
its numbers but that it is a **fixed window with no control** — a label saying
"last seven days" with no way to change the range is a stat pretending to be a
view. Two ways out: add a range control, or make the time axis visible in a
trend and need no control at all.

**Recommendation: the trend.** Fewer controls, more information, and it shows
direction, which a single window never can.

### 3. Words saved per week

**Status: all data present** (`addedAt`, `by-added` index).

Capture rate over the last 8–12 weeks.

**Keep it visually quiet.** This measures *collecting*, not learning. It is
genuinely useful — capture is the top of the funnel and the app's core loop —
but it must not compete with usage for attention, or the page starts rewarding
the easy action.

### 4. Drill accuracy across sessions

**Status: stored as of 2026-09-17. No history yet — it accumulates from here.**

Accuracy for the last N sessions, plus the current figure.

**Session-indexed, not date-indexed.** A 20-word library builds roughly 100
steps, so sessions are long and infrequent — possibly one a week. A
"last 7 days" accuracy figure will often be empty, while "last 5 sessions,
whenever they happened" always says something.

**Also enabled by the same read:** total sessions, and words practiced per
session.

### Not on this page

- Time since last use — per-word, belongs in Library.
- Anything that ranks individual words — that is Library's job.

---

## Practice page

### 5. Session history

**Status: data stored, nothing reads it back.**

This is the clearest gap found in the session. Practice currently **loops**:
finish a session, get "12 of 13 landed," and the only way forward is starting
another. The score is written to the `sessions` store and then never shown
again. Scores are being kept with nowhere to see them.

**Build:** a history view on Practice — a drawer or a second view, not a new nav
tab — listing past sessions with date, score, and word count. Ruthnie's framing:
*"somewhere to see the practice history so I can see how I've done over time."*

**Also fix the end-of-session screen.** It shows the score and one "Practice
again" button. It should be the natural place to see how this session compares to
the last few, since that is the moment the question is actually being asked.

### 6. Session length — a real constraint, not a stat

Every word in the library gets its full run of drills each session, so a 20-word
library is ~100 steps. That is very likely why no session had been completed
before today.

This **starves every session-based stat** on the Progress page. It is a Practice
design problem rather than a stats problem, but it caps what the stats can ever
show, so it belongs in the same conversation. Worth deciding whether a session
should have a length bound.

---

## Library page

### 7. A stat header above the list

**Status: all data present.**

- **Total words** — already shown.
- **Collection rarity** — a one-line summary, e.g. the median band. Distinct
  from the Progress breakdown: one line of context here, the full distribution
  there.

### 8. Sort and filter by what the stats reveal

**Status: all data present** (`usageCount`, `lastUsedAt`, `addedAt`).

- **Marked used N times** — from `usageCount`. The label must say **marked**
  used, because it counts check-in taps, not observed uses. See the honesty note
  below.
- **Time since last use** — from `lastUsedAt`.
- **Going cold** — saved a while ago, `usageCount === 0`.

**These belong as sort options and filters, not as numbers printed on every
row.** The Library's job is finding a word; a stat earns its place there by
**ordering the list**, not by decorating it. A count on all two hundred rows is
noise, while "sort by longest unused" is a tool.

---

## Word detail page

### 9. One word's history

- **Marked used N times, and when** — `listUsages(wordId)` already exists.
- **Rarity band, with the frequency behind it** — stored.
- **Next scheduled review** — `fsrs.due` is stored and currently invisible.
- **Encounters** — where the word was met. The `encounters` store and
  `listEncounters()` both exist; almost nothing writes to it yet, so this needs
  the capture path filled in first.
- **Practice record for this word** — **needs new storage.** See below.

---

## The two decisions to make before building

### Per-word drill results are not stored

`PracticeSession.wordIds` records which words a session covered, but **not
whether each one was answered correctly.** So "how am I doing on *obfuscate*
specifically" cannot be answered today.

Cheapest honest fix: add `results: Array<{ wordId: string; correct: boolean }>`
to `PracticeSession`. Worth settling **before** the first stats build, because
adding it later means a migration against real session history — the same
argument that put all six stores in at version 1.

### There is no router

Tabs are local state ([`App.tsx`](../src/App.tsx) explains the original
reasoning, which was sound at five destinations and no deep links). The cost
grows as the app gains per-word and per-session views: no deep links, no
back-button, no shareable URL for a word, and a session-history view that cannot
be linked to.

Not blocking any stat below, but it is a real and growing cost, and #5 and #9
both make it hurt more.

---

## Build order

1. ~~**Rarity spread on Progress**~~ — **done 2026-09-17.**
2. ~~**Session history**~~ — **done 2026-09-17**, on Progress rather than
   Practice (see below).
3. ~~**Uses-over-time trend**~~ — **done 2026-09-17**, replacing the fixed
   seven-day window.
4. ~~**Words saved per week**~~ — **done 2026-09-17.**
5. ~~**Library sort and filter**~~ — **done 2026-09-18.**
6. ~~**Word-detail history**~~ — **done 2026-09-18.**

## What shipped — 2026-09-17

The Progress page is complete. Sections, in order: library totals, rarity
spread, streak, words saved per week, words marked used per week, practice.

**Session history landed on Progress, not Practice.** The plan put it on
Practice, but everything a reader compares it against — accuracy, streak,
totals — is already here, and splitting the history from its context would mean
two screens to answer one question. Practice's end-of-session screen is still
worth improving separately.

**The seven-day block is gone.** Its rows either duplicated the lifetime totals
above them (with one session's history, "words marked used this week" printed
the same figure as "marked used") or needed a range control the block did not
have. The trends replace it, with the time axis visible so no dropdown is
implied.

**Two reusable components**, both taking their colors from the caller so neither
knows what any scale means:

- `SpreadBar` — a proportional bar over a legend. **Only for genuine
  parts-of-a-whole splits.** Rarity qualifies; the library totals do not.
- `TrendBars` — weekly counts as bars. Bars rather than a line, because these
  are discrete per-week counts and a line would draw a slope between two weeks
  as though something happened in between. Empty weeks render as a faint stub,
  since a gap is information.

Hand-rolled with flexbox and percentage heights, no charting dependency and no
SVG viewBox maths, so they reflow at any width and theme from the same custom
properties as everything else.

**Rarity honors the unscored rule.** Words Datamuse never scored are counted
and stated separately, never folded into "very rare" — that would overstate the
collection in exactly the direction its owner wants to believe. Shares are out
of scored words only.

**Accuracy is session-indexed**, over the last five sessions, and **weighted by
drills answered rather than averaged across sessions** — a 9-of-10 and a 1-of-10
is 50%, not 55%. Sessions that answered nothing are skipped, not counted as zero.

**On testing:** an earlier version of this note claimed "56 tests pass across
two harnesses." There is no test runner in `package.json` and no test file in
the repository, so that line was wrong and has been removed rather than left to
promise coverage that does not exist. The logic it described — week-bucket
boundaries, rarity banding including unscored words, weighted accuracy — is
still worth covering the day a harness goes in.

## Two build notes

**Charts.** Several of these want a line or bar over time and there is no
charting library in the project. Recommendation: hand-rolled inline SVG
sparklines rather than a dependency for four small charts. They are a few dozen
lines, they theme from the same CSS properties as everything else, and they do
not add a bundle.

**The honesty rule, carried forward from this session.** Two statuses were
dropped from the Progress page for failing it: `understood`, which nothing in
the app can set, and `owned`, which counts "tapped *Used it* a second time" —
that measures *returning to practice*, not using a word twice. The app has no
way to observe real-world use, so any stat implying it does is inventing
evidence.

Every stat above must name what it actually measured. `usageCount` is
**marked**-used, not used. A stat that cannot be honestly labeled does not go on
a screen.

---

## What shipped — 2026-09-18

Library sort and filter, the per-word practice record, and Word detail's own
history. **The Practice page was deliberately left alone** — see the deferral
note at the end.

### Per-word drill results are now stored

`PracticeSession.results` is written on every finished run. The decision the
previous session flagged as "settle before building" is settled, and it was
settled while the session history was one day old — the last point at which it
cost nothing.

**The shape is wider than this doc proposed.** The plan suggested
`Array<{ wordId, correct }>`. That is one row per drill with no way to tell the
rows apart, and a word generates about four drills a session — so a word's
record would read `true, false, true, true` with no idea whether the miss was
typed recall or a multiple-choice guess. Those are different facts: failing to
produce a word from its definition means it is not known, while picking the
wrong synonym out of four means it is nearly known. The stored shape is
`Array<{ wordId, drill, correct }>`, and `DrillKind` moved from
`domain/puzzles.ts` into `types/domain.ts` because it is now a **stored
vocabulary** — renaming a member silently orphans every result recorded under
the old name.

`results` is optional. `undefined` means "this session predates per-drill
recording" and `[]` means "recorded, nothing answered", and every reader must
tell them apart — which is why `wordPracticeRecord` reports
`unrecordedSessions` separately rather than counting an old session as a run of
zero.

**That distinction stays in the data and off the screen.** Word detail briefly
printed "One earlier session is not counted above; it ran before per-drill
results were kept." Ruthnie: *"how do you know that if you know that one exists?
How come it wasn't kept? I don't get it."* Fair — the note was the app
explaining its own release history to its reader. The `sessions` store has always
recorded which words a session covered, so the session is known; what was never
written is which drills were answered, and no later read can recover it. True,
and not the reader's problem. The figure is still computed, because a future
screen may have a reason to distinguish "no record" from "record starts here",
but nothing displays it. Check-ins are excluded from `results`: a check-in is stored in the session
history with `correct: true` so that Back can replay it, but it is a
self-report, not a question, and folding it in would pad every word's record
with a pass it never earned.

### Library

**The letter strip filters instead of jumping.** The jump looked broken and the
diagnosis that mattered was Ruthnie's: with four words the whole list fits on
one screen, so `scrollIntoView` had nowhere to go. A filter always does
something visible, and it gives the page a browse control without adding chrome.
Tapping the active letter clears it. (A real latent bug was found on the way —
the headings are `position: sticky`, and a sticky element that is already stuck
reports its stuck position, so the jump would have under-scrolled even on a long
list. Moot now that nothing scrolls to them.)

The letters offered are computed from the search and filter results but *before*
the letter itself applies — computed after, choosing B would leave B as the only
letter on screen and strand the reader. A letter that stops matching is ignored
during render rather than reset from an effect, so clearing a search restores the
browse rather than silently dropping it.

**Five orders, and each one carries its own caption.** Sorting by longest unused
while showing the date a word was added asks the reader to take the order on
trust — the row cannot be checked against the reason it is there. So the
secondary line always shows the value being sorted on, and under alphabetical it
shows nothing at all, because the order is the word itself.

Two orders needed an explicit decision about missing values, both resolved the
same way the Progress page resolves them. **Never-used words lead "longest
unused"** — a word never used has gone the whole way, and sorting `undefined` as
though it were recent would bury exactly what the order is for. **Unscored words
sort last under "rarest"** — Datamuse having no frequency is not evidence of
rarity, and letting an unmeasured word head a list titled "rarest" is the same
overstatement the rarity spread refuses. Every order falls back to alphabetical
on a tie, so a library where nothing has been used does not reshuffle on every
read.

**Collection rarity is the median band**, not the mean frequency. Frequency spans
four orders of magnitude, so one everyday word dropped into a library of rare
ones moves a mean across two bands and describes neither.

### The status mark was rebuilt

Ruthnie: *"we have an indicator on our library that I didn't notice. Used in
practice has a little dot indicator. We need to do better."*

It encoded three states as a **border color on an 8px circle**, so the whole
difference between "saved" and "practiced" was 1.5px of a tone most people
cannot pick out — and it could not show that practiced and used are independent.
It is now **two pips**, so the state is a count before it is a color: none
filled, one filled, both filled. An unfilled pip stays as a faint ring, because
"one of two" only reads as partial when the empty half is still visible.

Both predicates moved into `domain/library.ts` and are shared with the filters,
so a word the "not practiced" filter shows can never render a practiced mark.

### Word detail

A per-word record: drills answered, **split by drill kind and ordered weakest
first**, because the reason to split at all is to name what to work on. The
drill kinds are labeled by the task ("Recalling it from its meaning"), never by
the stored name. `fsrs.due` is shown for the first time since Phase 2.

**Three corrections came from Ruthnie mid-build, all of them right:**

- **It listed every date the word was marked used.** That grows without bound
  and answers nothing — "Sep 15, Sep 17, Sep 17" makes the reader do arithmetic
  to recover two facts the app can simply state. Now: the count, and when it
  last happened. A per-word event log is a different feature.
- **It sat in the middle of the screen.** Everything above it is the word
  itself — senses, encounters, synonyms, origin — and that is a continuous read.
  *"I'm reading, reading, and then oh, numbers."* The section moved below the
  reference material: the stats are about the reader's relationship with the
  word, not about the word, so they come after the word has been said in full.
- **"Comes back round in 28 days"** was a tic, not clarity. Now "Scheduled in 28
  days."

A due date in the past reads as **ready**, never as overdue. The queue does not
penalize a late review and neither should the label.

## Deferred — the Practice page needs its own session

Everything on Practice was left alone in this session, by decision rather than
oversight: the open questions are entangled and none of them is a stats problem.
**They are worked through in full at the end of this document**, under "The
Practice session — what to settle before building."

**The library work feeds it directly.** The sorts and filters built here —
longest unused, not practiced, going cold — are the same selections a
pre-session word picker needs, which is why this went first.

## Rule 7 — a stat must not imply a rule the app does not enforce

Added 2026-09-18, after `fsrs.due` was shown and then cut the same session.

Word detail briefly printed "Scheduled in 28 days" from the stored FSRS due
date. Two things were wrong with it, and the second is the one worth keeping as
a rule.

**It described a gate that does not exist.** The Practice queue puts *every*
word in the library into *every* session regardless of `fsrs.due` — nothing
reads the due date to exclude anything. So the line announced a schedule the app
does not keep. A figure that describes behavior the code does not have is worse
than no figure, because it will be believed.

**And the behavior it implied is one the app should not have.** Ruthnie:
*"we shouldn't hold a word back. You need repetition... I want a choice. I don't
want it to be enforced that I can't grab the word."* That is the right call and
it matches how spaced repetition is actually implemented everywhere — Anki and
SuperMemo both surface what is *due* while letting the reader drill anything at
any time. The schedule is a suggestion about what to review, never a lock on
what may be reviewed. A vocabulary app that refuses to practice a word its owner
asked for has mistaken its own bookkeeping for the goal.

Worth separating from a real point about intervals: expanding gaps are not a
bug. Recalling something just before you would have forgotten it is what builds
retention, which is why a correct answer pushes the next review out. That part
of FSRS is sound. But the intervals here are also probably not calibrated — FSRS
derives them from difficulty and stability parameters that have almost no
history to work from on a four-word library, so 28 days is extrapolation. Both
questions belong to the Practice session; neither changes the rule above.

**The rule:** before putting a scheduling or ranking figure on a screen, check
that something in the code acts on it. If nothing does, it is a plan, not a
stat, and it does not go on a screen yet.

---

## Amendment to "What shipped — 2026-09-18"

Two things below the Word detail notes above were changed later the same
session, after Ruthnie saw them on screen.

**The due line is gone entirely.** See rule 7 above. `fsrs.due` is still stored
and the scheduler still maintains it; nothing displays it.

**The record section is figures, not prose.** It shipped as two grey sentences
at the foot of a screen that already carries a word's senses, synonyms,
opposites and related terms. Ruthnie: *"it doesn't look like new information...
visually it's not really doing much"* and *"if you put numbers and labels, just
like the way our progress page is, that's visually catching."* Right on both
counts — the section was not earning its space.

It now uses the **same label-left, figure-right rows as Progress**, with the
figures set in the word face. Matching rather than inventing a layout means
there is one way to read a number anywhere in the app. Rows: marked used, frequency,
last marked used, drills correct, practiced in — then the per-drill breakdown as
a second level, weakest first. The "earlier sessions" note dropped to fine
print, because it is a footnote about the data rather than a figure about the
word.

**"Frequency" is new, and it replaced the date list.** The first version listed
every date a word was marked used, which grows without bound and answers
nothing. Ruthnie: *"a pattern would be cool. Every X days, something like that."*
So: the **median** gap between marks, in days. Median rather than mean because
one long silence — three marks in a week, then nothing for four months — drags a
mean to a number describing neither the burst nor the gap.

It appears only at **four or more marks** (`MIN_MARKS_FOR_INTERVAL`). Four marks
give three gaps; two marks give one gap, and calling a single interval "every 9
days" presents one occurrence as a rhythm. Same rule as never reporting a
percentage from one sample.

**A note on writing, for anyone adding copy here.** Three labels had to be
fixed in one session, all the same failure — writing around the thing instead of
naming it.

- *"You reach for this one about every 9 days."* Nobody reaches for a word, and
  the app already has a verb for this: **practice**. Use the terms already on
  the UI.
- *"Comes back round in 28 days."* Says nothing about what comes back, or from
  where. (That line is gone for other reasons — see rule 7 — but the wording was
  wrong before the concept was.)
- *"Last marked."* Marked **what**? Every other label in the app says "marked
  used", because that is the fact being counted. A label that drops its object
  to save a word makes the reader supply it.

Say literally what is meant, name the object, and prefer a label and a figure to
a sentence. This screen carries more prose than any other in the app — every
sentence added here is one more thing to skip past.

---

# The Practice session — what to settle before building

Written 2026-09-18, at the end of the stats session, for the breakout session
that builds Practice. Everything here was deferred by decision rather than
oversight: the questions are entangled, and answering them one at a time
produces a worse page than answering them together.

The goal of this section is that **the build session opens with no open
questions**. Where a decision is already made, it says so. Where a real fork
remains, it is marked **FORK** and stated as a choice with a recommendation.

## What is wrong with Practice today

One sentence each, because these are the constraints everything below has to
satisfy.

1. **Every word gets its full run of drills, every session.** A 20-word library
   is roughly 100 steps. This is almost certainly why no session was finished
   before 2026-09-17.
2. **It opens on question one.** There is no landing, so a reader cannot see
   what the session will be, how long it is, or what it covers before being
   inside it.
3. **There is no way to skip.** The only way past a question you cannot answer
   is to answer it wrong, which writes a wrong answer nobody meant into the
   record.
4. **Per-drill results are written only when the session ends.** Answer forty
   drills, leave at step forty-one, and all forty are discarded.
5. **The schedule is computed and ignored.** `fsrs.due` is maintained on every
   answer and nothing reads it when building the queue.
6. **There is nowhere to see results.** `results` is recorded and Word detail
   reads it per word, but no screen shows a session.

## The decisions

### 1. A session is a selection, not the whole library — SETTLED

The queue is built from every saved word. It should be built from a
**selection**, chosen before the session starts.

Ruthnie, on hand-picking: *"I want a choice. I don't want it to be enforced that
I can't grab the word."* That settles the shape of the whole page. The landing
page is not decoration in front of the queue — it is where the session is
defined, and the queue becomes the thing it produces.

**The schedule suggests; it never restricts.** This is the rule from the stats
session (rule 7, above), and it is the single most important constraint on this
build. `fsrs.due` can order a list, mark a word as due, or pre-select a set. It
must never remove a word from what can be chosen. Anki and SuperMemo both work
this way — due is a recommendation, and anything is drillable on demand. An app
that refuses to practice a word its owner asked for has mistaken its bookkeeping
for the goal.

### 2. The landing page — SETTLED in shape, FORK on one detail

Practice opens on a screen that says what the session will be and lets it be
changed. It needs four things:

- **A count and a length estimate.** "12 words, about 48 questions." The
  estimate is honest arithmetic, not a guess: `buildDrillsForWord` already
  returns the exact drill list per word, so the count is known before the
  session starts. This is the single most valuable thing on the page — it is
  the answer to *"I know how short or long it's going to be."*
- **A default selection**, already made, so Start is one tap for anyone who does
  not want to choose.
- **Quick selections**, which are the Library filters reused: due, not
  practiced, not used, going cold, longest unused. `domain/library.ts` already
  implements every one of these, which is why the Library work was done first.
- **A word list with checkboxes**, for hand-picking.

**FORK: what is the default selection?** Options:

- *Everything due*, falling back to everything when nothing is due.
- *A fixed count of the most overdue*, e.g. 10 words.
- *Last session's selection.*

**Recommendation: a fixed count of the most overdue, defaulting to 10 words.**
It makes the default session a predictable length, which is the problem being
solved — "everything due" can be 2 words or 60 and the reader cannot tell which
until they are looking at it. Ordering by most overdue uses the schedule as a
suggestion, which is its correct role. 10 words is roughly 40 questions, which
is a sitting.

### 3. Session length — SETTLED in principle

Bounded by the **selection**, not by a cap inside the session. A cap that stops
a reader mid-run ("that's enough for today") is the same paternalism as the
schedule refusing a word. Choosing 30 words should give a 30-word session.

So the binding is: the default selection is a sensible size, the estimate is
shown before starting, and a reader who wants 100 steps can have them.

**This answers *"yeah I do, but how?"*** The how is not a cap. It is that the
session is chosen rather than assembled from everything.

### 4. Skipping — SETTLED

Add an explicit **"I don't know this yet"** on every drill.

What it does:

- Reveals the answer, exactly as a wrong answer does. The teaching moment is the
  point, and a skip that hides the answer punishes honesty.
- **Records nothing in `results`.** It is not a wrong answer — the reader told
  the truth and no question was answered. Writing it as incorrect corrupts
  accuracy with answers nobody meant, which is the current bug.
- **Feeds the scheduler as a lapse.** FSRS should hear "not known", because that
  is exactly what it needs to shorten the interval. This is the one place where
  skip and wrong agree.

The asymmetry is deliberate and worth stating: **the record is about what the
reader answered; the schedule is about what they know.** A skip is silent in one
and loud in the other.

### 5. When results are written — FORK, and it touches the streak

Today `results` is written once, when the session ends. Ruthnie, on finding
this: *"I guess that is the argument. It should keep counting every time I run
the drill."*

**Recommendation: write the session row on the first answer, and update it
after every answer.** `addSession` is already a `put`, so re-writing the same id
overwrites rather than duplicating. Give the session its id at start and file it
incrementally.

**The knock-on, which must be decided at the same time:** `computeStreak` counts
a day as practiced if a session ended that day. If partial sessions are written,
a day where the reader answered three drills and walked away starts counting.

Two coherent positions:

- **Any answered drill earns the day.** Simple, and defensible: a drill answered
  is practice done.
- **The day is earned at a threshold** — say five drills answered — so opening
  the app and tapping once does not count.

**Recommendation: any answered drill earns the day.** The threshold is a second
number to explain and to tune, and the streak already excludes the genuinely
free action (saving a word). Answering a drill is not free.

Note the session record needs an `endedAt` that means "last answered", not
"finished", once it is written incrementally.

### 6. The results view — SETTLED in placement, FORK on depth

Session results belong on Practice, reached from the landing page. Progress
already holds the *history* across sessions; this is one session in detail.

**FORK: how much detail?** Either a list of sessions with a score each (which
Progress already has), or a per-session drill-down showing every word and how it
went.

**Recommendation: the drill-down.** The list already exists on Progress, so
building it again on Practice adds a second place to read the same thing. The
per-word detail is the thing `results` was added for and the thing nothing can
currently show.

### 7. The end-of-session screen — SETTLED

Today it shows a score and one button. It should show what the session did — the
words covered and how each went — and offer the same landing page as the way to
start another, so "practice again" does not mean "the same 100 steps again."

## The router

Three of the decisions above add a destination inside the Practice tab: the
landing page, the session, and the results view. The end-of-session screen is a
fourth state. Local state can hold four states, but it cannot give any of them a
URL.

Ruthnie: *"we have literally no routing, so I don't know how you want to do
that."*

**This is now the second plan to name it, and the first where it is load-bearing
rather than a growing cost.** The costs that bite here specifically: no back
button out of a session, no link to a past session, and a reader who switches
tabs mid-session loses their place — `App.tsx` unmounts the tab's contents.

**Recommendation: settle the router before building the landing page, not
after.** Retrofitting routes across four states that were built as local state
means rewriting all four. The app is five tabs and a word stack; converting it
is a contained piece of work now and a much larger one after Practice grows.

If the answer is no router, then the Practice tab needs an explicit state
machine of its own, and losing the session on a tab switch has to be an accepted
cost rather than a surprise.

## Build order for the breakout session

1. **The router decision**, before anything below.
2. **Incremental session writes** (#5) — small, and it makes everything after it
   measurable.
3. **The landing page** (#2) with the selection model (#1), reusing
   `domain/library.ts`.
4. **The skip** (#4).
5. **The end-of-session screen** (#7).
6. **The results view** (#6).

## What is already built that this can use

- `domain/library.ts` — every quick selection on the landing page: due, not
  practiced, not used, going cold, longest unused, plus search. Built in the
  stats session specifically to feed this.
- `buildPracticeQueue` / `buildDrillsForWord` — returns the exact drill list per
  word, so the length estimate is arithmetic rather than a guess.
- `PracticeSession.results` — recorded now, read by Word detail, with no
  session-level view yet.
- `wordPracticeRecord` — per-word figures, already used on Word detail.

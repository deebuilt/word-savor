# Plan: Flashcards

**Status:** Plan agreed 2026-09-22, built the same day — see the progress entry
at the bottom.
**Sits on:** `docs/favorite-definition-practice-spec.md` (the two stars, and
`src/domain/senses.ts`, shipped 2026-09-22)

---

## What this is

A flashcard deck on the Practice page, under Audio practice. The word on one
side, its starred definition on the other, tap to flip, move through the set.

**Nothing is scored. Nothing is written.** No practice log row, no FSRS
scheduling, no session to resume, no grade. Leaving is just leaving.

---

## The principle question, answered before building

`docs/BUILD_PLAN.md` says this is "not a flashcard app with a different skin,"
and `BottomBar.tsx` says the tab is Practice rather than Review because "review
is flashcard vocabulary and implies the goal is recall. The goal is use."

Both stand, and neither is in conflict with this, because **both are arguments
about the grading model, not about a card with two sides.** The inversion
BUILD_PLAN describes is that spaced repetition grades *did you remember it* and
WordSavor grades *did you use it*. A surface that grades nothing at all does not
take a side in that argument — it is a reading surface, not a grading one.

`PracticeSpeak` already established this category and made the same case in its
own words: "not a drill and deliberately not scored... it fills a real gap
rather than adding a seventh way to be tested." Flashcards are that screen's
sibling, and they sit in the same section for the same reason.

**The real risk, named rather than papered over:** the calmest surface on the
page can quietly become the one that gets used, leaving the scored practice as
the thing the reader means to get to. That is a usage risk, not a correctness
one, and the mitigation is placement — below the menu, in the unscored section,
where it reads as a supplement rather than an eighth option. It is not a reason
not to build it.

---

## Decisions

### The section gets a real name: "Quiet practice"

It was labelled **"Not a test"**, which worked as a disclaimer over a single
item and fails as a heading over two. It also says what the section *is not*,
which leaves a reader to infer the category.

Rejected: *Unscored* (a negation wearing a noun's clothes — same failure),
*No pressure* (a mood, not a category), *Extras* / *More ways to practice*
(says nothing; every card on the page is a way to practice).

**Quiet practice** names it positively and is true of both members: neither one
asks a question, keeps a score, or has an end to reach.

### One card, not two — and the set is chosen inside the deck

The alternative was two cards, "Flashcards" and "Favorite flashcards". Rejected:
that is the same verb twice with a filter bolted on, and it borrows the shape
the menu above uses for seven genuinely different selections. Two rows would
make flashcards look like two ways to practice when they are one way across two
sets.

A toggle *on* the card was rejected for a sharper reason: the menu's whole
premise, stated in `PracticeStart.tsx`, is that tapping a card **is** the choice
and it starts — "not a configuration screen in front of a queue". A toggle turns
an entry point into a one-line settings row, which is the thing that screen was
built to not be.

So the card is a plain entry point with a word count, exactly like Audio
practice, and **the scope switch lives in the deck** — `All` / `Favorites`, at
the top of the screen where the looking happens. That is a filter on what you
are paging through, the same act as the Library's Favorites filter, and it
belongs next to the cards rather than in front of them.

Flipping the scope returns to the first card, because the position in one set
does not mean anything in the other.

### The definition shown is the starred one, always

Via `favoriteSense` / `favoriteDefinition` in `src/domain/senses.ts`. Never
`word.senses[0]`. That resolver is the reason the groundwork was built first:
the library row, the practice drill and the flashcard back must name the same
meaning, or the app disagrees with itself about what a word means.

### A word with no senses is excluded, and the exclusion is stated

Same rule Audio practice applies to words with no recording: a card with a blank
back is worse than a card that is not there, because the reader taps it twice
and then wonders whether the feature is broken. The deck says how many were left
out.

### An empty Favorites set disables the option rather than hiding it

The menu's existing rule — "an empty card stays, greyed and untappable" —
applies for the same reason: a control that appears and vanishes as a library
changes cannot be learned or described.

---

## Shape

| File | Role |
| --- | --- |
| `src/domain/flashcards.ts` | The deck rule: eligibility, scope, order. No React. |
| `src/components/flashcards/Flashcard.tsx` | One card. Front, back, flip. |
| `src/components/flashcards/DeckControls.tsx` | Position, previous/next. |
| `src/components/flashcards/ScopeSwitch.tsx` | All / Favorites. |
| `src/screens/PracticeFlashcards.tsx` | Composes them; owns index and scope. |
| `src/app/routes/PracticeFlashcardsRoute.tsx` | `/practice/cards`. |

Named `PracticeFlashcards`, not `PracticeCards` — `components/practice/
PracticeCards.module.css` already belongs to the drill cards, and two things
called cards in one feature area is a name collision waiting to be read wrong.

**Mobile, designed at 375px rather than merely surviving it:** the card is the
screen. It fills the height between the header and the controls so that flipping
is a thumb tap anywhere on it, not a hunt for a button. The word is set at
display scale — one word, owning the screen, the same argument `PracticeSpeak`
makes for setting its word larger than any other list. The back is the part of
speech over the definition, left-aligned, wrapping, capped at the 44ch every
other prose block in the app uses. Controls sit at the bottom, in thumb reach,
clear of the bottom bar.

Prev/next are visible buttons, not swipe-only: a gesture with no affordance is a
feature that has to be discovered, and there is nothing on the screen to
discover it from.

---

## Progress — 2026-09-22 (built, awaiting Ruthnie's eyes)

Built as planned above, typecheck and lint clean. **Not yet verified in the
running app, not built, not committed.**

### What shipped

| File | What it does |
| --- | --- |
| `src/domain/flashcards.ts` | **New.** `isCardable`, `toFlashcard`, `scopeWords`, `buildDeck`, `countDeck`. The deck rule, with no React in it. |
| `src/components/flashcards/Flashcard.tsx` + `.module.css` | **New.** One card. The whole surface is the flip button. |
| `src/components/flashcards/DeckControls.tsx` + `.module.css` | **New.** Position and prev/next. |
| `src/components/flashcards/ScopeSwitch.tsx` + `.module.css` | **New.** All / Favorites, with each side's count. |
| `src/screens/PracticeFlashcards.tsx` + `.module.css` | **New.** Composes the three; owns index, scope and flip. |
| `src/app/routes/PracticeFlashcardsRoute.tsx` | **New.** `/practice/cards`. |
| `src/app/routes.tsx` | Route registered; "four screens" comment corrected. |
| `src/app/routes/PracticeStartRoute.tsx` | `onFlashcards` wired. |
| `src/app/routes/practiceContext.ts` | Comment: not every screen under the layout reads the run. |
| `src/screens/PracticeStart.tsx` + `.module.css` | Section renamed; second row added; `.aside` became a list. |
| `src/design/theme.css` | **New variable** `--ws-bottom-bar-height`. |
| `src/design/tokens.ts` | `cssVar` block documenting it. |

### Three things decided during the build, not in the plan

**1. `--ws-bottom-bar-height` is new, and it is why.** The deck fills the height
above the nav, which means subtracting the nav's height — and that height was
not a number anywhere. `tokens.ts` has `control.bottomBarHeight: 64`, but the
bar's real height is emergent: `52px` tab + `6px` padding + `max(6px,
env(safe-area-inset-bottom))` + a `1px` rule, so on a notched phone it is not 64
at all. Hardcoding a guess would have been wrong on exactly the devices this app
is for. The variable is built from the same three parts `BottomBar.module.css`
builds the bar from, so there is one definition rather than two that drift.

**2. The screen's height is `100dvh` minus that, not `min-height: 100%`.** The
first attempt used a percentage, which does not resolve here: the shell's
scrolling region takes its height from `flex: 1` — a *used* height, not a
specified one — so a percentage child has no definite basis and collapses to its
content in some engines. `dvh` for the reason the shell already documents: `vh`
is measured with the mobile URL bar expanded, which would push the deck controls
under the browser chrome.

**3. The deck position is clamped during render, not in an effect.** The library
can change while the screen is open, and a stored index past the new end renders
an empty card. An effect would paint that empty frame first and then fix it;
deriving the position during render means the bad frame never exists. The
clamped value is written back to state on the render where it bit, so the screen
and the state cannot hold two different positions — without that the display is
right while `index` is stale, which is harmless until the deck grows back and
the reader lands on a card they never navigated to.

### A real problem found on the way

**`npx tsc --noEmit` checks nothing in this project.** The root `tsconfig.json`
is `{"files": [], "references": [...]}` — a solution-style config — so bare
`tsc` resolves zero files and exits 0 no matter what is broken. It reported
clean on a `PracticeStart` that was missing a required prop.

The command that actually typechecks is **`npx tsc -b`** (`npm run typecheck`),
which is what `npm run build` runs. Every typecheck in this session after that
discovery used `-b`, and it caught the error immediately.

Worth knowing beyond this feature: any past session that verified with
`--noEmit` verified nothing.

### Not done

- **Ruthnie has not seen it yet.** Especially: the card at 375px, whether the
  flip-by-tapping-anywhere reads as obvious with only the foot hint to say so,
  and whether the scope switch belongs in the deck rather than on the Practice
  page.
- Dev server closed → full build → commit → push.
- **Hiding definitions** — still named in the favourite-definition spec as the
  natural companion to the stars. Still not built.

---

## Addition — 2026-09-22, same day: direction and order

Ruthnie asked for reverse practice, then for shuffle. Both built. Also removed
the standfirst under the title ("The word, then what you starred it for. Nothing
is scored.") — it explained a two-sided card to someone already holding one, and
the section it is reached from is already called Quiet practice.

### Reverse — `Word first` / `Meaning first`

**Flagged before building, and it stands:** meaning-first overlaps a real drill.
`buildDefinitionMatch` already asks "which word means this?" — definition shown,
word withheld. Meaning-first flashcards are that question without the four
options and without a verdict.

Built anyway, because it is still a different act: the drill tests and records,
this shows the answer the instant you ask and writes nothing. Same relationship
Audio practice has to saying a word aloud. But it is worth knowing that one
position of this toggle is a calm version of something the app already does
sharply — that is noted in `DeckDirection`'s own doc comment so it is not
rediscovered later as a surprise.

`direction` decides which face is up, not what the card holds. So `flipped` now
means "turned over from wherever this deck starts", and `showingWord` is
resolved once in the component rather than as three parallel ternaries across
the face, the hint and the accessible name — three chances to get one backwards.
The flip stays symmetric in both directions: a one-way reveal would make it a
question you answer rather than a card you look at.

### Shuffle — `In order` / `Shuffled`, plus `Again`

**A comment I wrote earlier was wrong, and it is corrected in place.**
`buildDeck` claimed alphabetical was right because "a shuffle is what a test
does... and there is no answer here to protect." That is false. Position becomes
the answer on this screen too: page a fixed deck a few times and you start
recalling *the next card* rather than the word. No score has to be involved for
that to be the wrong thing to practise. The comment now argues both sides, which
is why this is a toggle and not a replacement.

**Three implementation points that matter:**

1. **The shuffle is made in the screen, not in `buildDeck`.** The deck is
   memoised on `words`, which changes whenever any word is edited — a shuffle
   generated during the build would deal a new order on every such change and
   teleport the reader mid-page. The screen holds the id sequence in state;
   `buildDeck` only applies it.
2. **Fisher-Yates, not `sort(() => Math.random() - 0.5)`.** The comparator trick
   is what everyone reaches for and it is not uniform — an inconsistent
   comparator violates what sort assumes, so the bias depends on the engine's
   algorithm and some cards sit near their original position far more than
   chance. Verified empirically over 60,000 shuffles of a 5-card deck: every
   card lands in every position 19.5–20.3% of the time.
3. **`applyOrder` tolerates drift.** The id list is a snapshot and the library
   moves under it. An id naming a word no longer in scope is skipped rather than
   leaving a hole; a word the list never saw is appended in alphabetical order
   rather than silently hidden. Verified: stale order `c,a,b` against a live set
   `b,c,z` yields `c,b,z`.

**`Again` exists because without it shuffle is just a second fixed order** — it
gets memorised exactly the way alphabetical does, which is the thing shuffle was
added to prevent. It appears only when shuffled, rather than sitting greyed out.

**Scope changes clear the shuffle** and drop back to alphabetical. Reusing it
would append most of the new scope's words to the end, giving a deck that is
shuffled at the front and alphabetical after it. Toggling order off and back on
*keeps* the existing sequence, so flipping to alphabetical and back returns you
to the deck you were in — `Again` is there for when it should not.

### Layout

Three controls over a card at 375px would spend the card's height on settings.
So scope keeps the tab row (it is the loud choice — it changes the count and the
set), and direction and order became a single quiet text row beneath it, dotted
underlines, each stating its current value and flipping on tap. The split is
conceptual as well as spatial: scope is *what am I paging through*, these are
*how*.

### Files added or changed in this pass

| File | What changed |
| --- | --- |
| `src/domain/flashcards.ts` | `DeckDirection`, `DeckOrder`, `shuffleIds`, `applyOrder`; `buildDeck` takes order + sequence; the wrong ordering comment rewritten |
| `src/components/flashcards/DeckOptions.tsx` + `.module.css` | **New.** The quiet row. |
| `src/components/flashcards/Flashcard.tsx` | Direction-aware; `showingWord` resolved once |
| `src/screens/PracticeFlashcards.tsx` | Direction/order/shuffle state and handlers; blurb removed |
| `src/screens/PracticeFlashcards.module.css` | `.blurb` removed; title carries the spacing |

Typecheck (`npx tsc -b`) and lint clean. Still not verified in the running app,
still not built, still not committed.

### Sizing follow-up, same day

The quiet row went out at 13px with 32px tap heights and read as a caption
rather than a control on a phone. Raised to **15px** (the app's body size) with
**40px** tap heights; `Again` to 14px, a step below the two toggles because it
is an action tapped far less often than the states beside it.

Deliberately short of the 44px `control.minTouchTarget` the nav uses: that
figure is for a target you hit without looking, and this is one you are already
looking at. 44 here would push the card down by a band it needs.

---

## Noted for a future session — this app is top-anchored

Raised by Ruthnie while looking at the deck controls, and it is bigger than the
screen that prompted it. **Nearly every action in this app sits at the top of
the viewport, which on a phone is the hardest place for a thumb to reach — while
the navigation sits at the bottom, which is the easiest.** That is backwards.

Instances she named:

- **Look Up** — the search field is at the very top of the phone.
- **Look Up** — Save sits at the top of the looked-up word.
- **Flashcards** — the scope tabs, and the direction/order row under them.
- On-page `<h1>` titles throughout, which push everything else down and consume
  the most reachable-from-nothing band of the screen with a word the tab bar has
  usually already said.

The exception, and the pattern worth generalising from: **the deck's prev/next
controls are at the bottom on purpose**, in thumb reach, with the card above
them. `DeckControls` already documents why.

What she wants out of it: get rid of the on-page titles, and use a real header
(or a better back affordance) instead — which would also free the top band and
let the tabs and the option row move up into it, or let the whole screen shift
down into reach.

**Deliberately not attempted here.** It is app-wide, it changes navigation, and
it touches every screen — a separate session, with the title removal and the
header rework planned together rather than one screen at a time.

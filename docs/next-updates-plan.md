# Next updates — plan

Status: listed, not started. Three changes that came out of using the app, each
checked against the code as it stands on `main`, with a rough size and the open
questions to settle before building.

| # | Update | Size | Touches |
|---|--------|------|---------|
| 1 | Where the word was met, shown after the answer | Small | `DrillAnswer`, drill cards, `listEncounters` |
| 2 | The sense sheet, reachable from every drill | Medium | `SenseSheet`, `PracticeSession`, `PracticeSpeak` |
| 3 | Everything one size up (not the studied word) | Medium, mostly mechanical | `index.css`, `useTypefaces`, ~15 CSS files |

Suggested order: **1, then 3, then 2.** #1 is the smallest and does the most for
recall. #3 changes how every screen looks, so it is worth doing before #2 adds
new UI that would otherwise be sized twice.

---

## 1. Show where the word was met, once the answer is revealed

**Why.** Once a drill reveals the answer, the reader sees definitions, synonyms,
and related words: all dictionary material. What's missing is the reader's own
memory of the word: the sentence they found it in, and where. That personal
hook is the strongest one for recall, and it is already saved.

**What exists.** Encounters are their own store (`Encounter` in
`types/domain.ts`: `context` = the sentence, `source` = book, podcast,
person). Look Up writes one on save when either field is filled in. The word's
detail screen reads them with `listEncounters(wordId)` and renders them with
`EncounterEntry` (`WordDetail.tsx`). Practice never reads them today.

**The change.**
- Load a word's encounters when its drills start, not on every card. A word's
  drills run back to back, so one read covers all of them.
- Add a "Where you met it" block to `DrillAnswer`, below the existing
  `reference`. It renders only when an encounter exists, so words saved without
  context look exactly as they do now.
- Show the most recent encounter, with the word highlighted in the sentence.
  Show the source line under it when there is one.

**Safe to show?** Yes, because it only appears after the reveal. No drill
builds its question from the encounter sentence (`domain/puzzles.ts` uses the
dictionary's examples), so this never repeats the question or gives the answer
away early.

**To decide.**
- If a word was met more than once: show the newest only, or all of them
  (capped at 2)?
- Should the user's own `note` ("why this one was worth keeping") show here too?

---

## 2. Open the sense sheet from every drill

**Why.** On Flashcards, tapping the word opens `SenseSheet`: every meaning,
with the star, over the deck without leaving it. Drills have no equivalent, so
fixing the wrong starred meaning mid-session means leaving the session.

**What exists.** `SenseSheet` (`components/flashcards/SenseSheet.tsx`) is already
self-contained. It takes a `SavedWord`, `onClose`, and `onSaved`, and it saves
the star through the same `withFavoriteSense` → `saveWord` path as the detail
screen. It is a modal, so the session underneath stays mounted and keeps its
place. That is the property that matters here too.

**The change.**
- Move `SenseSheet` out of `components/flashcards/` into `components/word/`,
  since it is no longer flashcard-only.
- Render one `SenseSheet` in `PracticeSession` (and `PracticeSpeak` for Audio
  practice), and give each drill card a way to open it.
- On save, update the session's copy of the word, the same way
  `PracticeFlashcards` merges edits through `applyEdit`.

**The one real design question: when is it available?**
The sheet shows every definition. Opened *before* answering, it gives away the
answer to Definition match, Fill in the blank, and Type the word. Options:
- **After the reveal only** *(recommended)*. A "See all meanings" button inside
  `DrillAnswer`. Nothing leaks, and it sits next to the answer, where the
  reader is deciding whether the right meaning was drilled.
- Always available, but it counts as "peeked" and the drill is scored as missed.
  Honest, but it adds rules to explain.

**Watch for.** Re-starring a different meaning mid-session changes what the
*next* drills for that word should ask. Decide whether the drills already built
for that word stay as they are (simplest) or get rebuilt.

---

## 3. Bump text up a notch, app-wide

**Why.** Senses, chips (related, synonyms), and labels read small on a phone.
The studied word is already large and mostly fine.

**What exists, and why this is easier than it sounds.** Nearly all text is
already sized as `calc(Npx * var(--ws-scale-body))` (about 100 places), and
the headword as `calc(Npx * var(--ws-scale-word))`. The two scales are separate,
which is exactly the split this needs. They're set in `index.css` and overwritten
per typeface by `hooks/useTypefaces.ts`, because each font has its own optical
size.

**The change.**
- Add a second, user-level multiplier (e.g. `--ws-size-body`) and multiply it
  into `--ws-scale-body` in `useTypefaces.ts`, so the per-font correction
  keeps working. Start it at about **1.1** (15px → 16.5px, 12px chips → 13px).
- Leave `--ws-scale-word` alone, per the ask.
- Convert the ~15 hard-coded `font-size: 12px/13px/…` holdouts to the scaled
  form so they grow with everything else.
- Match Ant Design's base size (`fontSize` in `design/antTheme.ts`) so its
  modals and messages don't look smaller than the rest of the app.

**Worth considering.** Instead of one fixed bump, make it a **Text size**
setting (Default / Large / Larger) next to the typeface picker. It's the same
code with a choice on top. It's also a real accessibility feature, in line with
the dyslexia-friendly typeface the app already offers.

**Check after.** Chips wrapping to more lines, the bottom bar and top bar
labels, flashcard text fitting its card (the recent "fit a word to the space"
work), and the drill option buttons on a small phone.

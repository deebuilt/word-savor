# Plan: Favorite words & favorite definitions (groundwork for flashcards)

**Branch:** `claude/favorite-definition-spec-9em29e`
**Status:** Plan — for discussion, nothing built yet
**Related older doc:** `docs/favorite-editable-definitions-plan.md` (still useful, but predates the practice engine and the current dictionary)

---

## What we're building, in plain words

Two stars, both on a word's detail page:

1. **A star on each definition.** Tap the star on the definition you actually
   care about and it fills in. That starred definition becomes the one the app
   quizzes you on in practice — instead of whatever the dictionary happened to
   list first.

2. **A star on the word itself.** Same idea, one level up: mark the whole word
   as a favorite. This feature is actually *half-built already* — the app can
   store "this word is a favorite," and the Library even has a "Favorites"
   filter waiting for it — but there's no button anywhere to turn it on. We
   finish it by adding the button.

Filled star = favorited. Outline star = not. That's the whole interaction — a
plain star that's always visible, tapped on mobile or clicked on desktop (no
press-and-hold, no menu). **Only one definition per word can be favorited:**
starring a different one moves the star to it.

---

## Why the definition star matters (the real problem)

Right now, when a word comes up in practice, the app quizzes you on **whichever
definition the dictionary printed first.** That's often not the meaning you
care about.

Your own example: **precipitate.** The definition you want to study is *"to
hurry / bring about suddenly."* But the dictionary tends to lead with *"to
throw or hurl"* (and there's a chemistry one about something settling out of a
liquid). Those aren't how you use the word, so being drilled on them is wasted
effort.

Favoriting the "hurry" definition fixes that: practice uses the one you starred.

---

## Where this is heading: flashcards (NOT building yet)

The reason we do the two stars first is that they're the foundation for a
**flashcards practice mode** you want next. With the stars in place, flashcards
can:

- let you **filter to your favorite words**, so you study the set you chose, and
- show you **your favorite definitions**, so you're never drilled on a meaning
  you don't care about (the precipitate problem again).

We're deliberately not starting flashcards now. But building the stars the right
way means flashcards later is a small, clean addition rather than a rework.

---

## What actually changes in the app

### 1. The word star (finishing the half-built feature)
- Add a star toggle next to the word on its detail page. Tap to favorite /
  unfavorite; it fills or outlines.
- The Library's existing "Favorites" filter starts working the moment the
  button exists — no other change needed there.

### 2. The definition star (new)
- Add a star on each definition on the word's detail page.
- In practice, the "Which word means this?" drill uses the *favorited*
  definition instead of the first one. If you haven't starred anything, it
  behaves exactly like today (uses the first) — so nothing breaks for words you
  never touch.
- One favorite per word. Starring a definition un-stars whatever was starred
  before.

---

## The technical bit (for when we build — skip if you like)

- Each definition is already stored with its part of speech, its text, and its
  examples. We add one optional "favorited" flag to it.
- The word already has a true/false "favorite" value stored; it just needs a
  button wired to it.
- The practice change is tiny and lives in one file
  (`src/domain/puzzles.ts`): the definition drill currently reads
  `word.senses[0]` — "the first definition." We change it to "a favorited
  definition, or the first one if none is starred."
- **No data migration.** The flags are optional. Every word already in your
  library simply has nothing starred, which behaves the same as it does now.
- Places that show a word's one-line definition (the Library list, the
  practice-pick list) get pointed at the favorited definition too, so what you
  see matches what you're quizzed on.

Files this touches: `src/types/domain.ts`, `src/domain/puzzles.ts`,
`src/screens/WordDetail.tsx`, `src/components/word/SenseList.tsx`,
`src/screens/Library.tsx`, `src/screens/PracticePick.tsx`.

---

## What changed since the older plan

- The dictionary source changed (FreeDictionary → Merriam-Webster), so the old
  doc's file references are stale.
- The old doc's premise — that the app auto-picks the "plainest" definition to
  lead — is no longer true; today it just uses the dictionary's first one, which
  is exactly why a manual favorite is worth having.
- The old doc never covered practice at all (the practice feature didn't exist
  yet). The connection to practice — and to flashcards — is the new part.
- The old doc also described "hide definitions" and "edit a definition's
  wording." **Hiding is a natural companion to the favorite star** — save every
  definition (storage is free and the app blocks re-downloading, so trimming at
  save time would be a permanent decision made at the worst moment), but let you
  tuck away the meanings you don't care about, reversibly, so your word page
  stays clean. Worth building alongside or just after this, but not part of the
  core favorite feature. Editing a definition's wording is separate and further
  off.

---

## Can we build this here, or do you need to look at it in VS Code?

Split answer:

- **The logic** — the flags, the practice change, the word-favorite wiring — can
  be built and *proven* right here in this session. I can run the type checks,
  the build, and unit tests that confirm practice uses your starred definition.
  No need for you to look at anything for that part.
- **The look and feel** — where the stars sit, how the filled/outline star
  reads, whether it feels right on your phone — is something you'll want to see
  with your own eyes. The app is mobile-first, so it's best judged running on a
  phone, not just described. I can build it and push to the branch, and you view
  the running app (or open it in VS Code) to react.

So: I can do all the invisible plumbing here with confidence. The visual polish
is the part where I'd build it, then hand it to you to eyeball and adjust.

---

## Decisions settled

- It's a **star**, filled vs. outline, called a **favorite**.
- A plain visible star, tap or click — no press-and-hold, no menu.
- **One favorite definition per word.**
- Save every definition; **hiding** (reversible) is the way to declutter, added
  alongside or after this — never trimming at save time.

---

## Progress — 2026-09-22 (built, awaiting Ruthnie's eyes)

Both stars are built and typecheck clean. **Not yet verified in the running app,
not built, not committed.**

### One decision changed from the plan above

The plan said to add "one optional *favorited* flag" to each definition. Built
differently, and the reason matters:

A definition has **no ID**, so "which one did you star" has to be recorded some
other way. A flag on the definition cannot express *only one per word* — nothing
in the shape stops two being flagged, so the rule would have to be remembered by
hand in every code path that writes, and the first one that forgets it produces a
word with two stars and no way to say which practice should use.

Instead the *word* stores a pointer to the starred sense —
`favoriteSenseRef?: { partOfSpeech, definition }`. One field holds one value, so
"only one favorite" becomes structurally impossible to violate rather than a rule
to enforce.

**Why the pair and not a position ("the 3rd definition"):** positions move. The
app deliberately caches raw dictionary responses so senses can be re-parsed later
without re-downloading; a re-parse that splits or merges a sense silently
re-points every index after it, and the star would then sit on a *different
meaning* than the one that was tapped — wrong, and quiet about it. The
part-of-speech + text pair is what already identifies a sense here (`SenseList`
keys its list on exactly that).

**Known future cost, flagged deliberately:** if "edit a definition's wording"
(listed in this doc as a later feature) is ever built, editing the text breaks
the pointer. That is the day real sense IDs become correct, and it would be a
migration. Judged better than building ID plumbing now for a feature that may
never come — and the failure is safe either way: a pointer that misses falls back
to the first sense, which is exactly how the app behaved before favorites existed.

### One thing built beyond the plan

The **synonym-match** drill also walks senses in dictionary order. Left alone, a
word with a favorite would be drilled on the starred meaning by definition-match
and on the dictionary's leading meaning by synonym-match, in the same session.
So the starred sense now goes first in that walk too — as a *preference, not a
filter*: a starred sense the thesaurus has no terms for still yields to one that
has them, because a drill that can be built honestly beats no drill.

**Ruthnie has not judged this yet** and said so plainly — it needs to be felt in
real drills, not read about. If it turns out weird, it is a one-line change.

### Files

| File | What changed |
| --- | --- |
| `src/types/domain.ts` | New `SenseRef`; `favoriteSenseRef?` on `SavedWord` |
| `src/domain/senses.ts` | **New.** The single resolver — `favoriteSense`, `favoriteDefinition`, `withFavoriteSense`, `isSenseRef` |
| `src/domain/puzzles.ts` | `buildDefinitionMatch` uses the starred definition; `pickSensePair` walks starred-sense-first |
| `src/components/word/FavoriteStar.tsx` + `.module.css` | **New.** One star component, both sizes |
| `src/components/word/SenseList.tsx` + `.module.css` | Optional star per sense; opens the disclosure when the star is hidden behind it |
| `src/screens/WordDetail.tsx` + `.module.css` | Both stars wired, optimistic write with revert on failure |
| `src/screens/Library.tsx` | Row shows the starred definition |
| `src/screens/PracticePick.tsx` | Row shows the starred definition |

### Notes

- **No migration.** The field is optional; every existing word reads as unstarred
  and behaves exactly as before.
- **Stars only appear on saved words.** The lookup preview renders the same
  `SenseList` for a word that is not in the library — there is nowhere to record
  a preference about it.
- The Library's existing "Favorites" filter now works, with no change to it.
- **No tests were written.** This project has no test harness (no runner, no test
  files); adding one is a bigger decision than this feature. The spec's mention of
  unit tests was written before that was known.

### Left to do

1. Ruthnie looks at it in the running app — especially the star placement at
   375px and whether the synonym-drill behavior feels right.
2. Dev server closed → full build → commit → push.
3. **Hiding definitions** — named in this doc as the natural companion. Not built.
4. **Flashcards** — the reason this groundwork exists. Not started.

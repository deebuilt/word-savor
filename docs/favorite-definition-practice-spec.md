# Spec: Favorite a Definition (so practice uses *that* one)

**Branch:** `claude/favorite-definition-spec-9em29e`
**Status:** Spec / not yet built — for discussion first
**Supersedes the practice angle of:** `docs/favorite-editable-definitions-plan.md`

---

## 0. What changed, and why this is a re-spec rather than a "go build it"

The original plan (`favorite-editable-definitions-plan.md`) is still a good
document, but the codebase has moved under it and — more importantly — the
*goal* has narrowed to something the original plan never actually addressed.

### The goal, in one sentence

> Let me star one definition on a saved word, and have the **practice drills**
> quiz me on *that* definition instead of whichever one happens to sit at the
> top.

The original plan was about **curating what you see** (keep-list, edit the
wording, star a favorite for display, refresh safely). It never mentions
practice at all — because when it was written, the practice engine didn't
exist yet. The new goal is about **what practice consumes as input**. That is a
genuinely new requirement, and it's the reason for this document.

### Three things the original plan assumed that are no longer true

1. **The dictionary source changed: FreeDictionary → Merriam-Webster.**
   The original plan's anchor file, `src/api/freedictionary.ts`, is gone. The
   dictionary now comes from `src/api/merriam.ts` (Merriam-Webster Collegiate,
   via a keyed proxy). Every "read this file first" pointer in the old plan's
   table is now stale.

2. **`plainnessScore()` — the thing the old plan was reacting against — no
   longer exists.** The old plan's premise was: *"the app already reorders
   senses so the plainest one leads, but the user can't override that choice."*
   That reordering is gone. Merriam-Webster's senses are kept in **MW's own
   order** (grouped by part of speech, then interleaved round-robin so a
   heavily-documented noun can't crowd out a verb — see `collectSenses` in
   `merriam.ts`). So today `senses[0]` is simply *"MW's first-listed sense of
   the first part of speech."*

   This actually makes the user's complaint **stronger**, not weaker. There is
   no longer any "plainest sense" logic trying to help — the top definition is
   whatever the dictionary printed first, which may be archaic, technical, or
   just not the meaning you met the word in.

3. **A word-level `favorite` already exists — and it's a different feature.**
   `SavedWord.favorite: boolean` (types/domain.ts:133) already powers the
   Library's "Favorites" filter and the star on a word. **"Favorite a *word*"
   is taken.** "Favorite a *definition*" is a new, separate concept, and we
   have to name and present it so the two don't blur together. (See §5.)

---

## 1. Where practice actually picks a definition today

This is the heart of it. Practice lives in `src/domain/puzzles.ts`, and only
two of the five drill types use a specific *definition* at all:

| Drill | How it picks its definition | Honors a favorite today? |
|---|---|---|
| **definition-match** ("Which word means this?") | `word.senses[0].definition` — the top sense, hard-coded (`puzzles.ts:152`) | **No — this is the one the user is describing.** |
| **synonym-match** | `pickSensePair()` walks senses *in order* and takes the first sense that also has a usable synonym group (`puzzles.ts:206`) | Partly — it's order-dependent, but constrained by needing a synonym match. |
| fill-blank | Uses example *sentences*, not a definition | n/a |
| fragment-cloze | Uses example *fragments*, not a definition | n/a |
| odd-one-out | Uses `related[]` terms, not a definition | n/a |

So the **primary target is `buildDefinitionMatch`**. Fixing that one line is
80% of the felt value. `pickSensePair` is a worthwhile secondary target.

The same top-sense assumption also shows up in three **display** spots, which
we'll want to keep consistent so the star doesn't feel like it's lying:

- `src/screens/Library.tsx:306` — the one-line definition under each library row
- `src/screens/PracticePick.tsx:117` — the definition shown when hand-picking words
- `src/components/word/SenseList.tsx` — renders `senses[0]` as the "primary" sense

---

## 2. The data model change

We need to record **which single sense is the favorite**, per word. There's a
real design choice here, so I'll lay out both options and give a recommendation.

### Option A — a flag on the sense (matches the original plan)

```ts
// src/types/domain.ts
export interface Sense {
  partOfSpeech: string
  definition: string
  examples: string[]
  primary?: boolean   // NEW — true on the one starred sense; absent = not starred
}
```

- **Pro:** minimal change, matches the already-written plan, optional field means
  **zero migration** (every existing word just has no `primary` anywhere, which
  reads as "no favorite set → fall back to top sense").
- **Pro:** it travels *with* the sense — saved words persist their `senses`
  array verbatim (`getWord` reads stored objects; it does **not** re-parse), so
  a flag set on a saved sense survives a reload.
- **Con:** "exactly one primary" isn't enforced by the type — it's an invariant
  the setter has to maintain (setting a new star clears the old one). Same
  caveat the original plan called out.

### Option B — an identifier on the word

```ts
// src/types/domain.ts
export interface SavedWord {
  // ...
  preferredDefinition?: string   // the definition text of the favored sense
}
```

- **Pro:** "exactly one" is enforced structurally — it's a single field.
- **Pro:** robust if senses ever get reordered, because it matches on text, not
  position. (Definitions are deduplicated within a word, per the note in
  `SenseList.tsx`, so the text is a stable-enough key.)
- **Con:** slightly duplicates data; a lookup helper has to resolve text → sense.

### Recommendation

**Option A (`primary?: boolean` on `Sense`).** It keeps continuity with the
existing plan, it's the smallest diff, and the "clear the old star when setting
a new one" rule is a two-line setter. The fragility Option B guards against
(sense reordering) can't happen today — nothing reorders a *saved* word's
senses. If we later build the refresh/merge feature from the old plan, we'd
revisit this, because that's the one code path that rebuilds senses. **This is
the main thing worth a quick gut-check from you before I build.**

---

## 3. The build, in two small steps

### Step 1 — Record the favorite and make practice use it (the whole point)

1. **Type:** add `primary?: boolean` to `Sense` (§2).
2. **A tiny helper**, next to the drill builders:
   ```ts
   // returns the starred sense, or undefined if none is starred
   function preferredSense(word: SavedWord): Sense | undefined {
     return word.senses.find((s) => s.primary)
   }
   ```
3. **`buildDefinitionMatch`:** change
   `const definition = word.senses[0]?.definition`
   to
   `const definition = (preferredSense(word) ?? word.senses[0])?.definition`.
   The `?? word.senses[0]` fallback is what makes every existing word keep
   working with no migration.
4. **`pickSensePair` (synonym-match):** check the preferred sense *first*, then
   fall through to the rest in order. If the favored sense has no usable synonym
   group, it correctly falls through — you can't build an honest synonym drill
   from a sense with no synonyms, and forcing it would reintroduce exactly the
   verb-definition/adjective-synonym mismatch that `pickSensePair` was written to
   prevent.
5. **The setter:** starring a sense sets `primary = true` on it, clears
   `primary` on every other sense, and calls `saveWord()` (which re-writes the
   whole word — that's already how saving works). One star at a time.

**Done when:** starring the third definition on a word makes
"Which word means this?" quiz the third definition, and this survives closing
and reopening the app.

### Step 2 — Make the star visible and consistent (the polish)

6. **`SenseList.tsx`:** sort the primary sense to the top so the collapsed
   saved-word view leads with your choice, and add a star/pin control — **but
   only in the editable, saved-word context.** `SenseList` is shared by the
   lookup preview, the related-word popup, and the drill "reference" answer
   panels; none of those should show editing controls. Gate it behind a new
   opt-in prop (e.g. `onSetPrimary?`) that only `WordDetail` passes.
7. **`Library.tsx` and `PracticePick.tsx`:** change their `senses[0]` previews
   to `preferredSense(word) ?? senses[0]` too, so the line you see in the list
   matches the line you'll be quizzed on.

**Done when:** the starred definition leads everywhere a definition is shown for
that word, and the star reads clearly as *this-definition*, not *this-word*.

---

## 4. Files that get touched

| File | Step | What |
|---|---|---|
| `src/types/domain.ts` | 1 | add `primary?: boolean` to `Sense` |
| `src/domain/puzzles.ts` | 1 | `preferredSense()` helper; use it in `buildDefinitionMatch` + `pickSensePair` |
| `src/screens/WordDetail.tsx` | 1–2 | wire the star control to a setter that calls `saveWord` |
| `src/components/word/SenseList.tsx` | 2 | sort primary first; render the star control behind a new opt-in prop |
| `src/screens/Library.tsx` | 2 | preview uses preferred sense |
| `src/screens/PracticePick.tsx` | 2 | preview uses preferred sense |

No new IndexedDB store, no schema version bump, no migration script.

---

## 5. Risks and things to be careful about

- **The naming collision is the biggest UX risk.** "Favorite" already means a
  starred *word*. If a sense also gets a star that reads as "favorite," the two
  will blur. Options: call the sense one **"Set as primary"** / **"Use in
  practice"** with a distinct icon (a pin rather than a star), or lean into it
  as a definition-level star but make its scope unmistakable in context. Worth
  deciding together — this is a wording/UX call more than a code one.

- **One star at a time.** The setter must clear the previous primary. (Option B
  would make this structural instead.)

- **Migration-free by construction.** Keep the field optional and always read it
  as `preferredSense(word) ?? word.senses[0]`. Never assume a saved word has the
  field.

- **Don't let a re-lookup silently wipe the star.** This is the original plan's
  headline risk, still true. The *only* code path that rebuilds a saved word's
  senses from scratch is a fresh lookup (`readFromCache` / `toSavedWord`
  re-parse the raw payload into new `Sense` objects with no `primary`). Today
  re-saving over an existing word is blocked in the UI, so there's no live path
  that does this — but if we ever build the refresh/merge feature, the star has
  to be carried across the merge, not overwritten.

- **`saveWord` stamps `updatedAt`.** Starring a sense will re-date the word.
  That's arguably correct (it *is* an edit), but worth being aware of if any
  "recently updated" view exists.

---

## 6. What this spec deliberately leaves out

From the original plan, still valid but **not** part of this narrow goal:

- **Hide/keep-list** (pruning senses) — display curation, not practice input.
- **Edit the wording** of a definition + revert — genuinely useful, larger, and
  independent of the practice goal.
- **Refresh / merge on re-lookup** (`mergeSenses`) — the hard 20%. Only becomes
  relevant if we start re-fetching saved words, which we don't today.

These aren't cancelled — they're just a different piece of work. This spec is
the smallest thing that delivers the actual ask: *star a definition, practice
uses it.*

---

## 7. Suggested first commit (when we do build)

Step 1, items 1–3 only: add the optional field, add `preferredSense()`, and
point `buildDefinitionMatch` at it. That's a self-contained, testable slice —
a unit test can assert the drill honors a starred sense and falls back to the
top sense when none is starred — before any UI is touched.

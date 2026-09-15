# Feature Plan: Favorite & Editable Definitions

**Branch:** `claude/favorite-editable-definitions-az048c`
**Status:** Planning / ready to build
**Goal:** Let a user curate the definitions on a saved word — keep the ones they
like, drop the fluff, star a favorite, and edit the wording — without ever
silently losing that work.

---

## 1. Why this exists

Definitions come in from FreeDictionary (Wiktionary data) and often carry fluff:
technical senses, obscure uses, clunky phrasing. The app already reorders senses
so the plainest one leads (`plainnessScore()` in `src/api/freedictionary.ts`),
but the user can't override that choice or clean up the list.

This feature makes a saved word's definitions **the user's own copy** to curate:

1. **Keep-list** — check off which senses to keep; the rest are hidden.
2. **Star a favorite** — mark one sense as primary so it leads and stands out.
3. **Edit the wording** — reword a definition (e.g. paste in a cleaner one),
   with the original kept so the edit is always reversible.
4. **Refresh safely** — if the word is looked up again, offer to merge in new
   dictionary data instead of overwriting the user's curation.

---

## 2. How the code works today (context for the builder)

Read these before starting; the doc-comments in each file are worth reading.

| Area | File | What it does |
|---|---|---|
| Lookup orchestration | `src/api/lookup.ts` | Fetches + merges dictionary, Datamuse, audio. `toSavedWord()` builds a `SavedWord` from a lookup. |
| Dictionary parsing | `src/api/freedictionary.ts` | Wiktionary wire format → `Sense[]`. `plainnessScore()` reorders so the plainest sense leads. |
| Data shapes | `src/types/domain.ts` | `Sense` and `SavedWord` interfaces. |
| Persistence | `src/storage/db.ts` | IndexedDB. `saveWord()` is a plain `db.put('words', word)` — a full overwrite keyed on `id`. |
| Definition rendering | `src/components/word/SenseList.tsx` | Renders `senses: Sense[]` as a list. Used by both lookup result and saved-word view. |
| Saved-word screen | `src/screens/WordDetail.tsx` | Where a saved word is viewed. Natural home for curation controls. |
| Lookup screen | `src/screens/LookUp.tsx` | Capture screen. Save button disables to "In your library" when the word already exists. |

### Key facts

- **Storage is local only** (IndexedDB, no server, no accounts). A word is
  stored once, keyed on its normalized `id` (lowercased word).
- **Saving stores the whole payload** — every sense, not just the word string.
- **Re-save is blocked by the UI, not the data layer.** `saveWord()` itself has
  no "already exists" guard — it overwrites. Today the LookUp screen disables the
  Save button when the word exists, which is the *only* thing preventing a fresh
  lookup from wiping a saved record. **This is the gap this feature must respect:
  once curation exists, "already saved" means "protect the user's work."**

### The `Sense` shape today

```ts
// src/types/domain.ts
interface Sense {
  partOfSpeech: string
  definition: string
  examples: string[]
}
```

---

## 3. Data model change

Add **optional** curation fields to `Sense`. Optional matters: every word
already in a user's library has senses without these fields, so making them
optional means old records keep loading with **zero migration**.

```ts
// src/types/domain.ts
interface Sense {
  partOfSpeech: string
  definition: string              // the text shown: the user's edit if edited, else original
  examples: string[]

  // --- curation (all optional, all default to "off" when absent) ---
  originalDefinition?: string     // untouched Wiktionary text; set the first time the user edits
  hidden?: boolean                // true = pruned out of the keep-list (default: visible)
  primary?: boolean               // true = the one starred favorite that leads
}
```

### How each field behaves

- **Keep-list:** a sense is "kept" when `hidden` is not `true`. The keep
  checkboxes in the UI flip `hidden`. Absent = kept, so old records are fine.
- **Star:** exactly one sense in a word has `primary === true`. Setting a new
  star clears the old one. The starred sense sorts to the top.
- **Edit:** on the first edit of a sense, copy the current `definition` into
  `originalDefinition`, then change `definition`.
  - "Is this edited?" → `originalDefinition != null && definition !== originalDefinition`
  - "Revert to original" → `definition = originalDefinition`

No new IndexedDB store is needed. Curation lives on the saved word, and
`saveWord()` already re-writes the whole word.

---

## 4. Build it in two phases

The curation UI is easy and delivers everything originally asked for. The
refresh/merge is the genuinely tricky part and *depends on* the curation model
existing — so build curation first, on a stable model, then merge into it.

### Phase 1 — Curate a saved word (the high-value 80%)

Delivers: favorite, prune, edit. All local mutations of the saved word.

1. **Types** — add the three fields above to `Sense` in `src/types/domain.ts`.
2. **Rendering + controls** — in `src/components/word/SenseList.tsx`, for a
   *saved* word show per-sense controls:
   - a **star** toggle (set `primary`, clearing any other),
   - a **keep checkbox** (toggle `hidden`),
   - an **edit** affordance: tap → inline textarea → save writes `definition`
     (setting `originalDefinition` on first edit).
   - Sort so the `primary` sense leads; show hidden senses dimmed or behind a
     "show hidden" toggle (don't delete them outright — hiding is reversible).
3. **Edited marker + revert** — when a sense is edited, show a small "edited"
   tag and a "revert to original" link that restores `originalDefinition`.
4. **Persist** — each change calls `saveWord()` (`src/storage/db.ts`) to re-write
   the word. Keep the controls on the saved-word path only
   (`src/screens/WordDetail.tsx`), not on a live network preview.

**Definition of done (Phase 1):** on a saved word the user can star one sense,
hide/keep any senses, edit wording, see an "edited" marker, and revert — and all
of it survives closing and reopening the app.

### Phase 2 — Offer to refresh (the tricky 20%)

The problem: senses have **no stable IDs**. To re-fetch a word without wiping
curation, we need a way to recognize "this fresh sense is the same one you
already have." **The `originalDefinition` we keep in Phase 1 is that matching
key** — which is exactly why keeping the original text makes refresh possible.

1. **`mergeSenses(saved, fresh)`** — a pure function (good place for unit tests),
   likely near `src/api/lookup.ts`:
   - Match each fresh sense to a saved sense by comparing the fresh text against
     the saved sense's original text (`originalDefinition ?? definition`) **and**
     part of speech.
   - **Match** → the saved version wins (keeps edit, star, hidden state).
   - **Fresh with no match** → genuinely new; add it, flagged so the user can
     decide whether to keep it (default: needs review, not auto-kept).
   - **Saved with no fresh match** → the dictionary dropped it, but the user
     curated it, so keep it.
   - Return counts so the UI can say "2 new definitions available."
2. **Refresh UI** — replace the dead "In your library" state on the LookUp screen
   (`src/screens/LookUp.tsx`) with a "Refresh definitions" action that runs the
   lookup, merges, and shows a small review step. Never a silent overwrite.

**Definition of done (Phase 2):** refreshing a curated word never loses an edit,
star, or hide decision; new dictionary senses are surfaced for review; and a
sense the user kept but the dictionary no longer returns is preserved.

---

## 5. Files that get touched

- `src/types/domain.ts` — new `Sense` fields *(Phase 1)*
- `src/components/word/SenseList.tsx` — star / keep / edit controls *(Phase 1, bulk of the UI)*
- `src/screens/WordDetail.tsx` — wire controls to `saveWord` *(Phase 1)*
- `src/storage/db.ts` — likely untouched in Phase 1; maybe a merge helper nearby *(Phase 2)*
- `src/api/lookup.ts` — `mergeSenses()` *(Phase 2)*
- `src/screens/LookUp.tsx` — turn disabled Save into a "Refresh" action *(Phase 2)*

---

## 6. Risks & things to be careful about

- **Silent data loss on re-save.** The single biggest risk. `saveWord()`
  overwrites. Any code path that rebuilds a word from a fresh lookup must go
  through the merge, never a blind `saveWord()` of API data over a curated record.
- **Migration safety.** Keep the new fields optional; never assume they exist on
  a loaded word (`sense.hidden === true`, not `sense.hidden`-as-required).
- **One star at a time.** Setting `primary` must clear the previous primary.
- **Hide vs. delete.** Prefer hiding (reversible) over deleting a sense outright,
  so a mistaken prune isn't permanent.
- **Test the merge.** `mergeSenses()` is where silent data loss hides — cover the
  three cases (match, new, dropped) with unit tests.

---

## 7. Suggested first commit

Phase 1, step 1 only: add the optional fields to `Sense` and confirm the app
still builds and existing saved words still load. Small, safe, reviewable — then
build the UI on top.

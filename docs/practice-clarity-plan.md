# Practice clarity — tweaks plan

Status: #1–#5 implemented and shipped. #6–#7 deferred (polish, not integrity).
Testing surfaced a bigger question — why sessions feel thin — which is captured
in the "Update" section at the end, framed as *recovering what's missing*, not
accepting it. This documents issues found while testing practice after the
Merriam-Webster switch, and how to fix them.

## Guiding principle

Every drill must **announce what it is testing**, and the user must be able to
**sense what they are being asked for** before they answer. A drill that
teaches something the user did not expect (e.g. branching out to synonyms and
associations) is fine — even good — *as long as it is labeled as that*, and not
disguised as a different drill.

Nothing here needs the API. Every drill runs on data already saved to the word
(`senses`, `synonyms`, `related`, `examples`). The MW switch did not create
these issues — the practice structure predates it — but MW's shorter, tighter
data made the confusing bits obvious and made one case circular.

## What was observed (real examples)

Practicing the word **acquiesce** (definition: "to accept, agree, or comply,
usually by staying silent or by not arguing"):

1. Card 1 — **type the word**. Prompt: "Which word means this?" + the
   definition. Typed `acquiesce`. Correct. Below it repeats the same verb +
   definition.
2. Card 2 — **pick from four**. Prompt: *identical* — "Which word means this?" +
   *the same definition*. Options were other library words plus one synonym.
   Looks like the exact same question repeated, but it wants a synonym, not the
   word. Confusing.
3. Card 3 — **odd one out**. "Which one doesn't belong with acquiesce?" Options:
   accede, grant, comply, equivocation. Picked equivocation (correct). The
   answer strip then listed *synonyms* — accede, agree, assent, come round,
   consent, subscribe, comply — and **"grant" was not in that list**, even
   though it had just been shown as a belonging option. Reads as broken.

Also: the progress counter stayed "1 of 12" across all of acquiesce's cards.

And earlier, for **bespoke** (definition "custom made"), the synonym-match
answer was "custom" — the answer sat inside the definition. Circular.

## Issues and fixes

### 1. Progress counter reads as stuck
`Practice.tsx` `progressLabel` (~L159–167) counts **words**, not questions:
`${currentWord + 1} of ${totalWords}`. So every drill for one word shows the
same number, and it only advances when the next word starts. It's working as
written, but it reads as frozen.

**Desired:** keep the word count, but also show progress *within* the word.
- Primary: `Word 3 of 12`
- Secondary (somewhere on the card/head): `Question 2 of 4` for the current
  word, or a small dot row.

**Where:** `Practice.tsx`. The `Step` type (~L44–50) already carries
`wordIndex`; add a per-word step index and per-word step count when building
`steps` in `start()` (~L73–83), then surface both in the head (~L204–217).

### 2. Two drills share one prompt
`definition-match` and `synonym-match` both use the eyebrow **"Which word means
this?"** and both show `senses[0].definition`. Back to back on the same word
they look like the same question asked twice.

**Desired:** distinct, short labels that say what each is testing.
- `definition-match` (type the word): keep "Which word means this?" — here the
  answer really *is* the user's word.
- `synonym-match` (pick from four): relabel to something short that signals a
  synonym is wanted, e.g. **"Which of these is a synonym?"** Keep it brief; it
  just has to not impersonate the definition drill.

**Where:** `DefinitionMatchCard.tsx` eyebrow (L45), `SynonymMatchCard.tsx`
eyebrow (L36).

### 3. Synonym-match: keep it, but make the relationship explicit
Decision: **keep this drill.** Pulling in a synonym the user didn't study is a
fair way to branch out — recognizing an association, eliminating distractors.
It just has to be honest about what it's doing (see #2), and the answer strip
should name the relationship so the user learns *why* it was right.

**Desired answer text:** name the source word and the relation, e.g.
"'accede' is a synonym of 'acquiesce'." Currently the wrong-answer statement
says "The word is 'acquiesce.'" and the reference lists synonyms with no
framing.

**Where:** `SynonymMatchCard.tsx` `DrillAnswer` (L61–68).

### 4. Odd-one-out: the answer strip shows the wrong list
Options come from `word.related` (Datamuse). The answer strip shows
`word.synonyms` (MW thesaurus) — a different list — so a correct *belonging*
option (e.g. "grant") is missing from what's shown. This is the biggest
integrity issue: it makes a working drill look broken.

**Desired:** the answer strip should show the list the drill actually drew
from — the **related** terms — labeled as such ("Related to acquiesce"), so the
belonging options are all present. If synonyms are also shown, label them
separately so it's clear they're a different set.

**Where:** `OddOneOutCard.tsx` reference block (L69–76) — swap `word.synonyms`
for the drill's related terms (the options minus the impostor, or
`word.related`), and relabel.

### 5. Circular synonym answer
`buildSynonymMatch` uses `word.synonyms[0]` as the answer. When that synonym
appears in the definition ("custom" in "custom made"), the answer is given away
by the prompt.

**Desired:** skip any synonym that appears in the definition (case-insensitive,
whole-word) and use the next one; if none qualifies, skip the drill for that
word.

**Where:** `puzzles.ts` `buildSynonymMatch` (~L120–143).

### 6. Related-word quality (lower priority)
Odd-one-out options come from Datamuse `related`, which sometimes yields odd
entries ("alliage", "single" for unalloyed). Consider light filtering (drop
non-alphabetic or obviously off terms), or revisit whether related words should
come from MW's thesaurus `rel_list` instead. Not urgent; note for later.

### 7. Minor: definition-match repeats itself
After answering the type-the-word drill, the reference shows the same sense +
definition just read in the prompt. Harmless, but could show the *other* senses
instead, or the pronunciation/etymology, to add something rather than repeat.

## Code map

- `src/screens/Practice.tsx` — session/steps, counter (#1)
- `src/domain/puzzles.ts` — drill builders (#5, #6)
- `src/components/practice/DefinitionMatchCard.tsx` — prompt (#2), reference (#7)
- `src/components/practice/SynonymMatchCard.tsx` — prompt (#2), answer (#3)
- `src/components/practice/OddOneOutCard.tsx` — answer strip (#4)

## Suggested order

1. #4 (integrity — looks like a bug) and #5 (circular) — smallest, highest trust
   impact.
2. #2 (distinct prompts) and #3 (name the relationship) — clarity.
3. #1 (counter) — needs a small change to how steps are built.
4. #6, #7 — polish.

---

## Update — 2026-09-17: shipped, and the richer-sessions plan

### What shipped (#1–#5)

Implemented and pushed. In `puzzles.ts`, `Practice.tsx`, and the three card
components:

- **#1 counter** — head now shows `Word X of Y` plus a per-word
  `Question N of M`. The usage check-in shows no question line (it isn't a
  question).
- **#2 prompt** — synonym-match eyebrow is now "Which of these is a synonym?"
  so it no longer impersonates the type-the-word drill.
- **#3 relationship** — synonym-match answer names it: "'accede' is a synonym
  of 'acquiesce.'"; the reference block is labeled "Synonyms".
- **#4 odd-one-out** — the answer strip now leads with the **related** terms
  the drill actually drew from (labeled "Related to …"), so no belonging option
  goes missing; synonyms follow as a separate labeled block.
- **#5 circular synonym** — `buildSynonymMatch` skips any synonym that appears
  in the definition (whole-word, case-insensitive) and skips the drill if none
  qualify.

#6 (related-word quality) and #7 (definition-match repeats itself) remain
untouched — polish, not integrity.

### What testing taught us: how many drills a word gets

Drills are built **per word, independently**. A word gets exactly the drills
its own data supports. There is **no rule that words match**, and one word
never suppresses another's drill — fill-blank shows for *any* word that has a
real sentence, regardless of its neighbors.

| Drill | Appears when |
| --- | --- |
| definition-match (type the word) | always (needs a definition) |
| fill-blank | the word has a real **sentence** (capitalized, ends in `.?!`, 4+ words, contains the word) |
| synonym-match | the word has a synonym **and** the library has 4+ words (distractors come from other saved words) |
| odd-one-out | the word has **3+ related** terms + another word supplies an impostor |

Merriam-Webster gives most everyday vocabulary short usage **fragments**
("a bespoke suit", "gaudy costumes"), not sentences — so fill-blank rarely
fires. Words that *do* carry a real sentence (e.g. **obfuscate**) still get it;
nothing was lost in the switch or in these fixes.

### The real problem to solve: sessions feel thin

Not a regression — a design limit. Two causes, both to be **fixed, not
accepted**:

1. Only four drill types exist, and two are hard-gated on scarce data.
2. Synonym-match is blocked below 4 saved words.

### Solution — recover what's missing (SHIPPED)

Both parts below are now implemented (`puzzles.ts` + new `FragmentClozeCard.tsx`):
synonym-match works from the first saved word, and fragment-only words gain a
cloze drill. Verified with the real builder against fragment-only words
(bespoke, gaudy) and a full-data word (obfuscate → up to five drills).

**A. Synonym-match without the 4-word floor.** Stop sourcing wrong answers
only from other saved words. Fill the three distractor slots from, in order:
the word's own **antonyms** → other saved words → a small **bundled
common-word list**. Guarantees three fair distractors at any library size, from
word #1. Never use this word's own synonyms/related as a distractor (avoids a
second correct answer).

**B. New drill — "fill in the blank (choose)", a fragment cloze.** Reuse the
usage **fragments** that the typed sentence fill-blank rejects. Mask the word
in a fragment ("a \_\_\_ suit") and offer it among three other saved words.
Because it's a *pick*, not a type, a short fragment is fair — the sentence
shape can't hand over the answer. Known caveat: fragments can be loosely
interchangeable ("a \_\_\_ suit" fits *bespoke* or *gaudy*); mitigate by
preferring distractors that don't also fit, and accept mild ambiguity as still
educational. This gives fragment-only words (bespoke, gaudy, optimistic,
proviso) a fourth exercise.

**Not doing:** loosening the *typed* sentence fill-blank to accept fragments —
that turns it into a giveaway. The fragments get their own fair drill instead.

More drill **variety** is the durable cure for thin sessions. Progress /
streaks / history is tracked separately in `practice-progress-plan.md`.

### Known follow-up — synonym-match shows the wrong sense

Found while testing (word: **precipitate**). Synonyms are stored as one flat
`word.synonyms` list, not grouped by sense or part of speech, but synonym-match
shows `senses[0].definition`. For a polysemous word the two can disagree: the
drill showed the *verb* sense "to throw violently, hurl" but the answer was
"cursory", a synonym of the *adjective* sense "hasty". Reads as wrong because it
is — cursory is not a synonym of "hurl".

Not introduced by any of the fixes above; it predates them (the MW dictionary
supplies senses, the MW thesaurus + Datamuse supply one merged synonym list, and
the sense linkage is lost in the merge).

Fix options considered:
1. **Small:** show the **word**, not a single sense's definition — "Which of
   these is a synonym of *precipitate*?" Any-sense synonym is then fair, and the
   mismatch disappears. Matches how odd-one-out already reads.
2. **Fuller:** store synonyms per sense / part of speech (MW thesaurus groups
   them this way) and align the shown definition's part of speech with the
   answer. Keeps the definition.

**Decision — go with the fuller fix (#2).** The whole point of this app is
reverse recall: read the definition, weigh each candidate word, test it against
the meaning. Option 1 trades that away for convenience. The fuller fix keeps the
definition *and* makes the answer honest. **Build it before the progress work**,
so streaks and scores are never recorded against a known-wrong drill.

**How the fix works.** MW's thesaurus payload already groups synonyms by entry
(part of speech) and by sense within it (`meta.syns`). Today
`parseMerriamThesaurus` flattens every group across every entry into one list —
that flatten is where the sense linkage is lost. Re-parse it to keep the
grouping, realistically at the **part-of-speech** level: dictionary senses and
thesaurus entries are separate responses whose per-sense numbering doesn't line
up, but POS does. Then synonym-match shows a definition of POS X and only
answers with a synonym from POS X's group. Store it additively (per `Sense`, or
a POS→synonyms map on the word) and keep the flat `synonyms` for the
constellations view so nothing else breaks.

**Migration — what happens to words already saved.** Safe, and mostly no
network:
- The **raw** MW thesaurus response is already cached per word in the `lookups`
  store, and the app re-derives fields from those raw payloads with no re-fetch
  (see `readFromCache` in `src/api/lookup.ts`). A one-time migration re-parses
  each saved word's cached thesaurus into the new grouped shape — locally,
  offline, no API calls.
- Words with **no** cached thesaurus payload (thesaurus didn't answer when they
  were saved) get re-fetched once. Trivial at a ~12-word library.
- Mechanism: bump the IndexedDB version; the upgrade walks saved words and
  rewrites only their synonym structure from cache, re-fetching just the gaps.
- Low risk: additive (flat list retained), re-derivable, reversible. Definitions,
  senses, FSRS, usages, and status are untouched.

---

## Update — 2026-09-17 (later): per-sense synonyms SHIPPED

Built as decided above — the fuller fix, not the "show the word instead" shortcut.
Typecheck and lint clean. **Not yet verified in the running app by Ruthnie.**

### Verified against real Merriam-Webster data

The MW thesaurus was called directly for three words and the new parser run over
the actual payloads. *Precipitate* returns **three entries, one per part of
speech**, which is the bug in plain sight:

| POS | MW's synonyms |
| --- | --- |
| adjective | cursory, drive-by, flying, gadarene, hasty, headlong … |
| noun | aftereffect, aftermath, backwash, consequence, outcome … |
| verb | pour, rain, storm |

The old flatten produced `synonyms[0] = "cursory"` — the adjective's — and
offered it against whatever definition was shown, including the verb's. The
lists share nothing, so the drill had no right answer.

After the fix, running the real builder:

- **precipitate** — verb definition "to throw violently : hurl" → answer
  **"pour"**, strip shows `pour, rain, storm`. Correct.
- **bespoke** — adjective "custom-made" → answer **"custom-tailored"**; #5's
  circularity guard still holds, skipping `custom` and `custom-made`.
- **acquiesce** — single-POS word, unchanged from before. No regression.
- **Flat `synonyms[0]` is identical in all three**, so the five screens reading
  the flat list are untouched.

### What changed

- **`merriam.ts`** — `parseMerriamThesaurus` keeps MW's grouping as
  `byPartOfSpeech`, merging multiple entries that share a POS. The flat lists
  are still returned exactly as before.
- **`domain.ts`** — new `PartOfSpeechTerms`; `SavedWord.synonymsByPartOfSpeech`
  added **optional**. `undefined` = never parsed, `[]` = parsed and empty. The
  migration depends on that distinction.
- **`lookup.ts`** — carries the grouping through both the network and cache
  paths and into `toSavedWord`. Datamuse terms are deliberately excluded from
  the grouped lists: Datamuse returns no part of speech, so filing its terms
  under one would invent the very link this field exists to be trusted on.
- **`puzzles.ts`** — `pickSensePair` walks senses in dictionary order and picks
  definition + answer *together* from one POS. `SynonymMatchDrill` gained
  `partOfSpeech` and `senseSynonyms`.
- **`SynonymMatchCard.tsx`** — names the part of speech above the definition,
  and the answer strip lists only that sense's synonyms.
- **`migrations.ts`** (new) + `main.tsx` — the backfill.

### Two decisions made during the build, beyond the plan

1. **No fallback to the flat list.** A word with no grouping **skips**
   synonym-match rather than guessing. A skipped drill is honest; a mispaired
   one is the bug being fixed. This is also what makes the pre-migration state
   safe — worst case is a temporarily missing drill, never a wrong one.
2. **The antonym distractor tier is now sense-scoped too.** It read the flat
   `word.antonyms`, so a verb definition could draw the adjective's opposites
   ("unhurried" against "to hurl") — unrelated words, testing nothing. It now
   takes only the matched POS's antonyms. Blocking still uses the **whole** flat
   synonym list on purpose: any sense's synonym could be argued as a second
   right answer, so the stricter direction is the safe one.

### Migration — placement changed from the plan

The plan said to do this in the IndexedDB `upgrade` callback. That is the wrong
place and it was not done there: an upgrade transaction **cannot await a network
call** without deadlocking, and it holds locks on every store while it runs.
It is instead a post-open backfill in `src/storage/migrations.ts`, started from
`main.tsx` (once, outside React, so StrictMode's double-mount cannot run it
twice) and **not awaited** — the library renders from disk and a backfill should
never be why the first screen is blank.

No DB version bump was needed: the field is additive and optional, so the
existing schema holds it without a structural change.

Behaviour: words with a cached thesaurus payload are re-parsed **locally, no
network**. Words without one are fetched once. Every word is written even when
the result is empty, so nothing is retried forever, and failure is caught
per-word so one bad word cannot abort the rest.

### Still open

- **#6 related-word quality** and **#7 definition-match repeats itself** —
  untouched polish, as before.
- **Needs Ruthnie's in-app verification** before commit. Worth saving
  **precipitate** specifically, since it is the word that exposed this.
- Note for the progress work: it is now safe to record streaks and scores
  against synonym-match, which was the reason this went first.

---

## Update — 2026-09-17 (third): synonym-match distractors, and the dev proxy

### The dev server could not reach Merriam-Webster at all

Found while testing: every lookup on `npm run dev` failed, and real words came
back as **"No entry for precipitate"** with spelling suggestions whose alternates
also failed.

Nothing was wrong with the words. `VITE_MW_PROXY_BASE` pointed at the deployed
preview, which has **Vercel deployment protection** on, so `/api/mw` answered
`302` to an SSO login page instead of JSON. The misleading message comes from
[`lookup.ts`](../src/api/lookup.ts) — if the dictionary fails but Datamuse
succeeds, it concludes "the network is fine, so this is not a word". Datamuse is
keyless and public, so it sailed through while MW was walled off.

**Fix:** `merriamDevProxy` in `vite.config.ts` serves `/api/mw` from the dev
server itself — no deployed origin, no SSO wall, no CORS. Keys are read via
vite's `loadEnv`, so they stay in the Node process and never reach the browser
bundle, the same guarantee the real function gives. `apply: 'serve'` only;
production still uses `api/mw.ts`. `VITE_MW_PROXY_BASE` is now empty.

Verified live: `precipitate` returns 200 with all three parts of speech.

### Synonym-match was asking a recognition question, not a comprehension one

Ruthnie, testing: *"it's giving me one synonym out of three words that are in my
library… obfuscate, coalesce, epigraph, and pour. Obviously, it's pour. That's a
bad drill."*

Correct, and worse than it first looks. Drawing distractors from the library
meant the drill could be passed **without reading the definition** — three
options are words you have seen before, one is not. That is a familiarity test
wearing a comprehension test's clothes.

**Library words are no longer used as synonym-match distractors at all.** The
new source order, best first:

1. **Related terms** (`word.related`), *only for polysemous words* — see below
2. **Other senses' synonyms** — tests whether the reader noticed which sense is on trial
3. **This sense's antonyms**
4. **Common words** — the floor

`buildSynonymMatch` no longer takes `pool`. Fragment-cloze keeps using library
words via `pickClozeDistractors`: there the blank wants a real word and there is
no definition to reason against, so an unfamiliar option gives nothing away.

### Two traps found by testing the real output, both fixed

Testing three real words caught distractors that were not wrong answers at all:

- *Obfuscate* is defined "to throw into shadow : **darken**" — and `darken`
  arrived from Datamuse as a distractor, **printed in the prompt** and marked
  wrong beneath it. Now: no term appearing in the definition can be a distractor.
- *Coalesce* ("to grow together") offered `merge` and `conflate` as wrong beside
  `associate` as right. Both are better answers than the one being scored. Now:
  the block list covers the word's **whole** synonym list, every sense, not just
  the tested sense's.

### Why related terms are gated on polysemy

Datamuse `ml=` returns *means-like* terms. For a word with one tight meaning,
"means-like" and "synonym" are the same set, so the tier produces defensible
wrong answers (`obscure`, `confound` against *obfuscate*). No filter separates
those — the difference is not in the data. MW simply did not list them, and
absence from a thesaurus is not evidence of a different meaning.

Where a word spans parts of speech, the related list spans them too, and a term
from another sense is a genuine wrong answer. So the tier is spent only when
`synonymsByPartOfSpeech.length > 1`; single-sense words fall through to their
antonyms and then common words — an easier question, but an answerable one.

Verified output:

| word | options | answer |
| --- | --- | --- |
| precipitate (verb) | pour, hasten, precipitant, come down | pour |
| obfuscate | clarify, illuminate, clear (up), becloud | becloud |
| coalesce | sever, associate, section, dissever | associate |

40-run check confirms no library word is ever used as a distractor.

### Prompt fix

"Which of these is a synonym?" asked for a synonym *of a definition*, which is
not a relationship words have. It now names the word — **"Which of these is a
synonym of precipitate?"** — with the part of speech and definition below it.

### Known quirk, deliberately kept: archaic citations in fill-blank

Testing turned up a fill-blank built from a **1531 Thomas Elyot** citation —
"Also the vertues beynge in a cruell persone be nat only \_\_\_ or hyd…" — for
*obfuscate*. It is not a bug in the drill: MW marks that sense **obsolete**, and
a dead sense's only citation is naturally five centuries old. Modern senses get
modern examples.

[`isFullSentence`](../src/domain/puzzles.ts) would pass any such citation —
capitalised, terminally punctuated, 4+ words is all it checks. **Ruthnie's call
was to keep it** ("it's just weird", not harmful), so no filter was added. Worth
remembering if archaic examples ever become common enough to annoy: the fix
would be to skip senses MW labels obsolete, not to pattern-match the spelling.

### Still needs Ruthnie's in-app verification before commit.

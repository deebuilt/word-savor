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

### Solution — recover what's missing (design; not built yet)

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

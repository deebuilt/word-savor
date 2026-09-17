# Practice clarity — tweaks plan

Status: planning only. No code changed yet. This documents issues found while
testing practice after the Merriam-Webster switch, and how to fix them, so the
work can be picked up in a fresh session.

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

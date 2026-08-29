# WordSavor — Build Plan

Started 2026-08-28. This doc is the source of truth for the plan and its
progress. Append dated completion notes as work lands.

---

## What it is

A vocabulary library for words met in the wild. You find a word somewhere real —
a book, a conversation, a podcast — look it up, keep it, and the app brings it
back on a cadence to prompt you to *use* it.

**The thing it is not:** an app that feeds you words. There is no word of the
day, no curriculum, no pre-loaded list. Every word in the library got there
because it was encountered. That constraint is the product.

---

## The core inversion

Standard spaced repetition grades on *did you remember it*. WordSavor grades on
*did you use it*.

A card comes up and asks:

> **perspicacious** — have you used this since last time?
>
> Used it · Almost had it · Not yet · Still fuzzy

"Used it" pushes the interval far out — the word is yours. "Not yet" brings it
back sooner with a prompt rather than a definition. That reframing is the whole
product, and it is why this is not a flashcard app with a different skin.

---

## Status progression

`spotted → understood → rehearsed → used → owned`

Only the last two mean anything. Everything before them is prologue. `owned`
means used more than once, unprompted, in the wild.

---

## Data sources

All free, no key, no account.

| Source | Endpoint | Gives | Limit |
| --- | --- | --- | --- |
| **FreeDictionaryAPI** | `freedictionaryapi.com/api/v1/entries/en/{word}` | definitions, examples, synonyms, antonyms, pronunciation, word forms, etymology | 1,000/hr per IP |
| **dictionaryapi.dev** | `api.dictionaryapi.dev/api/v2/entries/en/{word}` | same, plus **audio pronunciation URLs** | none published |
| **Datamuse** | `api.datamuse.com/words?ml=…` and `?sp=…&md=f` | `ml=` associations, **frequency per million** (own call) | 100k/day; free key required from 2027-01-01 |

> **Corrected 2026-08-29 against the live endpoints.** This table originally
> said `rel_trg` and one merged Datamuse call; both were wrong. See "What the
> plan got wrong about the APIs" under Phase 1.

**The plan: layer them.** Definitions from a dictionary, associations and
frequency from Datamuse, audio from dictionaryapi.dev. One lookup, one merged
record.

**Attribution:** FreeDictionaryAPI is Wiktionary data under CC BY-SA 4.0 — a
credits line in About covering Wiktionary, FreeDictionaryAPI, and Datamuse.
Datamuse asks to be acknowledged in app documentation. One line each, in About.

**Offline fallback considered and deferred:** `wordnet-db` (npm, ~10MB, 140k
words) would make lookup work with no network at all. Not in v1 — the bundle
cost is real and every *saved* word is already cached permanently. Revisit if
lookup-while-offline turns out to matter.

---

## Architecture decisions already made

**No router.** Five destinations, no deep links, no URL worth sharing. Tabs are
local state. The one route that will need real URL handling is `/share` (the
share-target handler) — a single entry point, not a reason to route the app.

**No backend, no account.** Everything is IndexedDB on the device. This is what
makes the app free to run forever. Sync is a later decision, and the local
schema will say exactly what it needs by then.

**Lookups cached permanently.** A saved word never hits the network twice. This
is also what makes the library fully readable offline.

**`related[]` written at save time.** Backfilling an association graph across
300 saved words is 300 API calls. Writing it once per word, as it is saved,
costs nothing.

**Six stores created at version 1**, including three nothing reads yet
(`collections`, `sessions`, and the `usages` split). An empty store is free;
adding one later is a version bump against a real library.

---

## Bottom navigation — settled

| Slot | Tab | Icon | Holds |
| --- | --- | --- | --- |
| 1 | **Library** | `BookOutlined` | Every saved word. Search, sort, filter. The home screen. |
| 2 | **Practice** | `ThunderboltOutlined` | Due words + usage prompts. Gold badge with the count. |
| 3 | **Look Up** | `PlusOutlined` (accent) | Capture. Centred and the only colour in the row. |
| 4 | **Progress** | `RiseOutlined` | Streaks, rarity curve, usage log, constellations. |
| 5 | **More** | `EllipsisOutlined` | Theme, backup, about, what's new. |

Why this order:

- **Look Up is centre and accent** — the window between meeting a word and
  losing it is a few seconds long, so capture gets the thumb's home position.
- **Library is first, not Practice** — opening onto a drill screen would make
  this an app that feeds you words.
- **"Practice", not "Review"** — review implies the goal is recall. The goal is
  use.

Puzzles land inside **Practice** as a second mode; their scores surface in
**Progress**. No nav change needed later — that is the point of settling it now.

---

## Phase 0 — Scaffold ✅ *(2026-08-28)*

- [x] Vite + React 19 + TS, Ant 6, `idb`, `ts-fsrs`, `vite-plugin-pwa`
- [x] Port **8205**, `host: true` so it opens on a phone
- [x] `design/tokens.ts` — no raw pixel number outside this file
- [x] `design/theme.css` — three-state light/dark, warm palette
- [x] `design/antTheme.ts` — Ant bridge (literals, not `var()` — Ant's colour
      maths cannot parse a custom property)
- [x] `hooks/useTheme.ts` — system/light/dark, localStorage, pre-paint script in
      `index.html` so there is no flash of the wrong theme
- [x] `types/domain.ts` — full schema including stub fields
- [x] `storage/db.ts` — six stores, four indexes on `words`
- [x] `BottomBar` — five equal columns, safe-area inset, gold due badge
- [x] App shell — `100dvh`, one scroll region, placeholder screens
- [x] PWA manifest **including `share_target`** — declared now because a share
      target must be in the manifest the app was installed with
- [x] GitHub Actions → Pages, `public/CNAME` → `wordsavor.com`
- [x] Typecheck clean

### Phase 0b — Reading faces *(2026-08-29)*

Pulled forward from "later" on purpose. Had Phase 1 built its screens against a
hardcoded family, adding this would have meant finding and rewriting every
component that sets type. Wiring it first makes the setting nearly free.

- [x] `design/typefaces.ts` — four faces, each publishing its own optical scale,
      leading, and **the heaviest weight it actually ships**
- [x] `hooks/useTypefaces.ts` — two independent preferences, applied to the root
      as CSS custom properties, persisted to localStorage
- [x] `TypefacePicker` — radio group where every option previews itself in the
      face it offers
- [x] Defaults declared in `index.css` so the first painted frame is already
      correct and does not reflow
- [x] `BottomBar` and `App` weights rerouted through the variables

**The rule this establishes:** no component names a font family, a font weight,
or a line height directly. Read `var(--ws-font-word)`, `var(--ws-font-body)`,
`var(--ws-weight-word-bold)` and friends. Phase 1 onward must follow this.

| Option | Face | Ships |
| --- | --- | --- |
| Editorial | Fraunces | 400/500/600 |
| Plain | Archivo | 400/500/600 |
| Hyperlegible | Atkinson Hyperlegible | **400/700 only** |
| Dyslexia | OpenDyslexic | **400/700 only** |

**The weight trap, worth knowing before writing any CSS here:** the two
accessibility faces publish 400 and 700 with nothing between. A hardcoded
`font-weight: 500` gets a browser-synthesised weight on both — smeared strokes,
in exactly the two faces chosen for legibility. Each face declares its own
`mediumWeight` and `boldWeight`, and components read those.

On OpenDyslexic: the evidence that its weighted-bottom design measurably helps
is mixed. It is offered because preference varies between individual readers and
some people find it genuinely easier; Atkinson Hyperlegible — designed by the
Braille Institute, with disambiguated letterforms — has the stronger case. Both
are there, and the reader picks.

## Phase 1 — Look up and save ✅ *(2026-08-29)*

The first real loop. Nothing else matters until this works end to end.

- [x] `api/freedictionary.ts` — definitions, parsing split from fetching
- [x] `api/datamuse.ts` — associations + rarity
- [x] `api/audio.ts` — audio only, non-blocking
- [x] `api/lookup.ts` — merge, cache, `toSavedWord`
- [x] `api/http.ts` — timeout-bounded fetch
- [x] Look Up screen: search field, result view, Save
- [x] Encounter capture on save — optional, never blocking
- [x] Library list, alphabetical, letter index
- [x] Word detail screen
- [x] Delete, with its cascade
- [x] `TopBar` — shared header, theme control
- [x] `domain/rarity.ts` — frequency to a readable band

### What the plan got wrong about the APIs

All four found by probing the live endpoints. None of them are in any of the
three APIs' documentation.

**`rel_trg` is the wrong Datamuse endpoint.** `rel_trg=perspicacious` returns
`[]` — its trigger data is sparse and misses most literary vocabulary, which is
the entire category this app exists for. `ml=` returned eight strong
associations for the same word. Since `related[]` is written once at save time
and is the one field expensive to backfill, an empty array here would have been
a quiet permanent loss across the whole library.

**Rarity needs its own call.** `md=f` returns frequency for the *results*, not
the queried word, and Datamuse excludes the query from its own `ml=` output.
Without a separate `?sp=<word>&md=f&max=1`, `rarity` lands `undefined` on every
saved word.

**A FreeDictionaryAPI miss is HTTP 200 with `entries: []`,** never a 404. And
`entries[]` is not one entry per part of speech — "bank" returns seven, four
noun and three verb, because Wiktionary splits by etymology too.

**Example sentences are often in `quotes[].text`, not `examples[]`** — and
bibliographic citations leak into *both*. `ephemeral` carried
`"1821-1822, Vicesimus Knox, Remarks on…"` in its `examples` array, which would
have been the first thing shown for that word. Filtered by a leading-year test.

**dictionaryapi.dev is unreliable per-word.** Measured ~20s on every call, and
HTTP 522 for `perspicacious` while answering `hello` in the same minute. Demoted
to audio only, 4s timeout, allowed to lose. A save never waits on it.

### Caps, all set from measurements

Uncapped, "bank" yields 40 senses and "good" returns hundreds of synonyms.

- 6 senses per part of speech, 12 total — allocated in rounds, so a word does
  not spend its whole budget on nouns and hide that it is also a verb
- 12 synonyms, 12 antonyms, 12 related
- 3 examples per sense

### Decisions made while building

- **Save sits beside the word, not below the senses.** Twelve senses on "bank"
  would put the only action on the screen behind a scroll.
- **Senses expanded on Look Up, collapsed on detail.** Deciding whether to keep
  a word needs all of them; returning to a word you own needs the primary one.
- **Theme moved to the header, typeface stayed on More.** Theme is
  glance-and-flip; the reading face is a considered choice that wants preview
  room. Not duplicated — two copies of one control can disagree on screen.
- **Letter headings come from the library, never the alphabet.** A forty-word
  library would show two-thirds dead letters.
- **Two lines of definition per library row.** One line cuts most definitions
  mid-clause and ends up less recognisable than none.
- **Detail is a full screen, not a sheet.** A sheet tall enough for twelve
  senses is a screen with a drag handle. Sheets are worth revisiting later for
  short glanceable things — practice metrics, say.

### Still open

- Rows are wired to `onOpenWord` and the detail screen reads from IndexedDB, but
  **nothing edits a saved word yet** — no note, no tags, no favourite, no adding
  an encounter after the fact. `SavedWord` carries all four fields.
- The empty-state line on Look Up is a placeholder Ruthnie wants to rewrite once
  the app's purpose is stated properly.

## Phase 2 — Practice

- [ ] `domain/scheduler.ts` — `ts-fsrs` wrapper, usage-graded
- [ ] Practice queue from the `by-due` index
- [ ] The four-button usage prompt
- [ ] Usage log write-through
- [ ] Status progression on use

## Phase 3 — Progress

- [ ] Streaks, from `sessions`
- [ ] Rarity distribution across the library
- [ ] Usage history — every sentence written, by word
- [ ] Constellations, from `related[]`

## Phase 4 — Capture paths

- [ ] `/share` share-target handler
- [ ] Paste-a-sentence, extract the word, keep the sentence
- [ ] Datamuse `/sug` autocomplete on the search field

## Phase 5 — Keeping it

- [ ] `storage/backup.ts` — JSON export/restore, `putWordVerbatim` on restore
- [ ] Web Push + a Vercel cron for the practice nudge
- [ ] Convert More from a screen to a bottom sheet, following read-amour's
      `MoreSheet`. A sheet beats a popover here: it rises from where the thumb
      already is, holds labelled items with descriptions, and avoids the
      positioning problem a popover anchored to a bottom-bar item has — it
      either covers the nav or floats awkwardly above it.
- [ ] About + credits (the CC BY-SA attribution)
- [ ] Release notes / what's-new

## Later — gamification

Deliberately not scoped yet. The shapes that fit:

- **Use-it-or-lose-it** — a word that goes long enough unused drops a status
- **Puzzles in Practice** — fill-in-the-blank from the word's own example
  sentences, odd-one-out from `related[]`, synonym matching
- **Collections** — user-made sets (`collections` store is already there)
- **More faces** — the registry takes one new entry per face; nothing else changes
- **Weekly recap** — words added, words used, one word that has gone quiet

---

## Deferred, with reasons

**Sync across devices.** Needs an account and a backend. The local schema will
say what it needs when the time comes, and `backup.ts` covers the real fear
(losing the library) without either.

**Offline dictionary.** ~10MB bundle. Saved words are already cached; this only
buys looking up a *new* word with no signal.

**A router.** Adds a dependency and a base-path problem for five tabs and no
deep links.

---

## Notes

- **Dev server: port 8205.** Registered in `DEV_SERVERS.md`, beside read-amour
  on 8204.
- **Build:** run it bare. The `tee-build.js` hook captures to `build.log`; never
  pipe a build through `head`/`tail`/`grep`. Re-reading the log is free, a
  second build is not.
- **Repo:** its own apex domain, `wordsavor.com`, matching the read-amour
  pattern — `BASE = '/'`, CNAME in `public/` (never the repo root, or Pages
  drops the domain on every deploy).

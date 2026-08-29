# WordSavor

A vocabulary library for words met in the wild.

You find a word somewhere real — a book, a conversation, a podcast — look it up,
keep it, and the app brings it back on a cadence to prompt you to *use* it.

It is deliberately **not** an app that feeds you words. No word of the day, no
curriculum, no pre-loaded list. Every word in the library got there because you
encountered it and decided to keep it. That constraint is the product.

The name works both ways: you **savor** the word, and you **save** it.

---

## Running it

```bash
npm install
npm run dev      # http://localhost:8205
```

The dev server binds to the LAN as well as localhost, so it opens on a phone at
the Network URL Vite prints on startup. **Use that one.** This app is
mobile-first, and two of its layout rules — the `100dvh` shell and the bottom
bar clearing the home indicator — cannot be exercised in a desktop browser,
because there is no URL bar to collapse.

```bash
npm run typecheck   # continuous, during work
npm run lint
npm run build       # only before a commit — run it bare, read build.log
```

---

## Stack

| | |
| --- | --- |
| Build | Vite 8, React 19, TypeScript |
| UI | Ant Design 6, themed from `src/design/tokens.ts` |
| Storage | IndexedDB via `idb` — no backend, no account |
| Scheduling | `ts-fsrs` (Free Spaced Repetition Scheduler) |
| Offline | `vite-plugin-pwa`, `autoUpdate` |
| Type | Four reader-selectable faces, self-hosted via `@fontsource` |
| Deploy | GitHub Actions → Pages, apex domain `wordsavor.com` |

---

## How it is organised

```
src/
  api/          dictionary + Datamuse clients
  components/
    chrome/     BottomBar, ThemeToggle — the always-on shell
  design/       tokens.ts, theme.css, antTheme.ts
  domain/       scheduler, status transitions, derived stats
  hooks/        useTheme and friends
  storage/      db.ts, backup.ts
  types/        domain.ts — every stored shape
```

**`design/tokens.ts` is the single source of truth for every visual value.**
Nothing outside it should contain a raw pixel number. When a component needs a
size, a gap, or a colour, it reads it from there, so a change to the type scale
or the spacing rhythm happens once and lands everywhere.

**The reading face is a setting, and there are two of them** — the *word* face
and the *body* face. Someone may want a high-contrast serif for the word itself
and a hyperlegible sans for the definitions underneath it.

| Option | Face | Ships |
| --- | --- | --- |
| Editorial | Fraunces | 400/500/600 |
| Plain | Archivo | 400/500/600 |
| Hyperlegible | Atkinson Hyperlegible | **400/700 only** |
| Dyslexia | OpenDyslexic | **400/700 only** |

Both preferences are applied to the root element as CSS custom properties, so
**no component should ever name a font family, weight, or line height
directly.** Read the variables:

```css
font-family: var(--ws-font-word);              /* or --ws-font-body */
font-size: calc(38px * var(--ws-scale-word));  /* per-face optical scale */
line-height: calc(1.1 * var(--ws-leading-word));
font-weight: var(--ws-weight-word-bold);       /* never a literal */
```

That last line matters more than it looks. Atkinson Hyperlegible and
OpenDyslexic publish **400 and 700 only** — nothing in between. A hardcoded
`font-weight: 500` gets a browser-synthesised weight on both: smeared strokes,
in precisely the two faces chosen for legibility. Each face declares its own
`mediumWeight` and `boldWeight` in `design/typefaces.ts`, and the hook publishes
them as variables.

Adding a face is one entry in `TYPEFACES` plus its `@fontsource` import. Nothing
else changes.

Colour lives in two places on purpose: `theme.css` for CSS custom properties,
`antTheme.ts` as literals for Ant. Ant resolves its tokens in JS and feeds them
to a colour engine — a `var()` reaches it as an unparseable string and every
derived state (hover, disabled, focus ring) collapses. Changing a colour means
changing it in both files. That is the only duplication in the design system.

---

## Data sources

All free, no key, no account.

- **[FreeDictionaryAPI](https://freedictionaryapi.com/)** — definitions,
  examples, synonyms, antonyms, pronunciation, etymology. 1,000 req/hr per IP.
  Wiktionary data under CC BY-SA 4.0.
- **[dictionaryapi.dev](https://dictionaryapi.dev/)** — same shape, plus **audio
  pronunciation URLs**.
- **[Datamuse](https://www.datamuse.com/api/)** — semantic associations
  (`rel_trg`) and **word frequency per million** from Google Books Ngrams.
  100k req/day; a free key becomes required 2027-01-01.

They are layered rather than chosen between: definitions from a dictionary,
associations and rarity from Datamuse, audio from dictionaryapi.dev, merged into
one record.

Every response is cached permanently in IndexedDB at save time, so **a saved
word never hits the network twice** — which is also what makes the library
readable with no signal.

Attribution for all three lives in the About panel.

---

## Notes worth knowing before changing things

**The database is the app.** There is no server. `storage/backup.ts` (JSON
export/restore) is the only thing standing between a user and losing their
library, so it is not optional polish.

**`share_target` is in the manifest from day one.** A share target must be in
the manifest the app was *installed with* — adding it later means every early
installer has to reinstall to get it. The handler route is stubbed; the
declaration is not.

**Three stores are created but unread** (`collections`, `sessions`, and the
`usages`/FSRS split). An empty object store costs nothing; adding one later is a
version bump against a database holding a year of someone's words.

**`related[]` is written at save time.** It is what the constellations view
reads, and backfilling an association graph across a few hundred saved words
means a few hundred API calls that could have been made one at a time.

**`putWordVerbatim` exists for restores only.** `saveWord` stamps `updatedAt`,
which is right for every edit and wrong for a restore — it would re-date an
entire library to the moment the backup was read.

**CNAME lives in `public/`, never the repo root.** Vite copies `public/` into
`dist` verbatim, and `dist` is the entire deployed site. Setting the domain
through the Pages settings UI writes CNAME to the repo root, where the workflow
never sees it — the next deploy ships without one and GitHub clears the custom
domain. The domain would drop on every push.

---

## Where the plan lives

**[`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md)** — phases, decisions with their
reasons, and what is deliberately deferred. It is the source of truth for both
the plan and its progress; completion notes get appended there.

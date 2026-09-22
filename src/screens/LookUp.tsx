import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Input, Tag, message } from 'antd'
import type { InputRef } from 'antd'
import { CheckOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import {
  lookupWord,
  toSavedWord,
  WordNotFoundError,
  type LookupResult,
} from '../api/lookup'
import { normaliseWord } from '../api/http'
import { suggestSpellings } from '../api/datamuse'
import { addEncounter, getWord, saveWord } from '../storage/db'
import { Word } from '../components/word/Word'
import { SenseList } from '../components/word/SenseList'
import { AudioButton } from '../components/word/AudioButton'
import styles from './LookUp.module.css'

/**
 * Look Up — the capture screen, and the reason the app exists.
 *
 * Search, read, keep. The field stays at the top and results render beneath it
 * rather than on a screen of their own, because the common failure here is a
 * misspelling of a word just overheard — and correcting one should not mean
 * navigating back.
 *
 * **Save is offered twice, and that is deliberate.** A glyph beside the word,
 * because a word like "bank" carries twelve senses and a reader who knows on
 * sight that they want it should not have to scroll past all of them to say
 * so. And a full button at the foot of the encounter, because the reader who
 * *did* read to the bottom and write down the sentence they met it in ends up
 * there, a whole screen away from the only other way to keep it. Both do the
 * same thing; which one is tapped says only when the mind was made up.
 *
 * **The encounter fields are optional and never block.** Where a word was met
 * is the strongest memory hook the app has, so the fields are visible rather
 * than hidden behind a "add context" link. But a word saved with nothing but
 * its own spelling is a perfectly good save, and nothing here is required.
 */

interface LookUpProps {
  /** Called after a save, so the shell can refresh its counts. */
  onSaved?: () => void
  /**
   * A word to look up on open, from the OS share sheet.
   *
   * Searched automatically: someone who shared a word has already chosen it,
   * and making them tap the button again would waste the seconds this path
   * exists to save.
   */
  initialWord?: string
  /** The sentence the shared word arrived in, prefilled into the encounter. */
  initialContext?: string
  /**
   * A number that increases every time the reader asks for the search field.
   *
   * Tapping Look Up while Look Up is already open means "I want to type" — the
   * gesture Spotify gives search — and the address is already correct, so
   * nothing about the location changes to signal it. The shell increments this
   * instead. The value itself is meaningless; only the change matters.
   */
  focusRequest?: number
}

type Status =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'found'; result: LookupResult; alreadySaved: boolean }
  | { kind: 'missing'; word: string; suggestions?: string[] }
  | { kind: 'offline' }

export function LookUp({ onSaved, initialWord, initialContext, focusRequest }: LookUpProps) {
  const [query, setQuery] = useState(initialWord ?? '')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [context, setContext] = useState(initialContext ?? '')
  const [source, setSource] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, toastHolder] = message.useMessage()

  /*
   * Guards against an out-of-order response.
   *
   * Searching "epi", correcting to "epigraph", and having the slower first
   * request land last would show the wrong word under the right query. Each
   * search takes a ticket and only the newest one is allowed to write state.
   */
  const requestId = useRef(0)

  /*
   * The search field, so the screen can put the cursor in it.
   *
   * Two moments want that. Arriving at Look Up at all is one: this screen has a
   * single purpose and one input, and landing on it without a keyboard means
   * the reader's first act is always the same tap. The other is asking again —
   * tapping Look Up from Look Up — which previously did nothing, because the
   * address was already right.
   *
   * Both are the same call, so both run through one effect keyed on the
   * request. `focusRequest` starts undefined on a first arrival and becomes a
   * number on every later ask, and a change in either direction is a change.
   */
  const searchField = useRef<InputRef>(null)

  useEffect(() => {
    /*
     * Not when a word arrived from the share sheet. That word is already
     * searched and the reader's next move is Save or the encounter fields —
     * opening a keyboard over the result would bury the thing they shared.
     */
    if (initialWord) return

    /*
     * `select` rather than plain focus, so a word already in the box is ready
     * to be replaced by typing. Someone asking for the field again is starting
     * a new lookup, not editing the last one.
     */
    searchField.current?.focus({ cursor: 'all' })
  }, [focusRequest, initialWord])

  const search = useCallback(
    async (raw: string, options: { keepContext?: boolean } = {}) => {
      const term = raw.trim()
      if (!term) return

      const ticket = ++requestId.current
      setStatus({ kind: 'searching' })

      /*
       * A new search abandons whatever context was typed for the previous word.
       *
       * The exception is a shared capture, where the sentence arrived with the
       * word and is the reason the share was worth making — clearing it would
       * throw away the only part the dictionary cannot supply.
       */
      if (!options.keepContext) {
        setContext('')
        setSource('')
      }

      try {
        const result = await lookupWord(term)
        if (ticket !== requestId.current) return

        // A word already in the library is not an error — it is worth saying so,
        // and worth still showing, since someone may be checking a definition.
        const existing = await getWord(result.id)
        if (ticket !== requestId.current) return

        setStatus({ kind: 'found', result, alreadySaved: Boolean(existing) })
      } catch (error) {
        if (ticket !== requestId.current) return

        if (!(error instanceof WordNotFoundError)) {
          setStatus({ kind: 'offline' })
          return
        }

        // The not-found message goes up at once. Suggestions are a non-blocking
        // enrichment on top of it — the same posture the successful path takes
        // with its optional sources — so the reader is never left staring at a
        // spinner while a "did you mean" is fetched.
        setStatus({ kind: 'missing', word: term })

        const suggestions = await suggestSpellings(term)
        // Guarded again: a correction typed while this was in flight must win,
        // and an empty list is left as the plain not-found state rather than
        // rewritten into an identical one.
        if (ticket !== requestId.current || suggestions.length === 0) return
        setStatus({ kind: 'missing', word: term, suggestions })
      }
    },
    [],
  )

  /*
   * Search a shared word once, on open.
   *
   * Guarded by a ref rather than an empty dependency list, so that a second
   * share arriving while the app is already open still searches — the effect
   * re-runs on the new word, and the ref only blocks repeating the same one.
   */
  const searchedShare = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!initialWord || searchedShare.current === initialWord) return
    searchedShare.current = initialWord
    void search(initialWord, { keepContext: true })
  }, [initialWord, search])

  /*
   * Tapping a suggestion corrects the field and searches, in place.
   *
   * Setting `query` first keeps the box honest — it now shows the word actually
   * on screen — and re-uses `search` so a correction is the same inline replace
   * a retyped word would be, never a navigation. This is the "correcting a typo
   * should not mean going back" the screen is built around.
   */
  const chooseSuggestion = useCallback(
    (term: string) => {
      setQuery(term)
      void search(term)
    },
    [search],
  )

  const save = useCallback(async () => {
    if (status.kind !== 'found' || saving) return
    setSaving(true)

    try {
      /*
       * Records how the word got in, so capture paths can be compared later.
       *
       * Compared on the normalised id rather than the raw strings: the shared
       * text arrives in whatever casing it was highlighted in, while the result
       * carries the dictionary's own form.
       */
      const fromShare =
        initialWord !== undefined &&
        normaliseWord(initialWord) === status.result.id
      const word = toSavedWord(status.result, {
        source: fromShare ? 'share' : 'manual',
      })
      await saveWord(word)

      /*
       * The encounter is its own record, written only when there is something
       * to write. An empty encounter row would claim the word was met somewhere
       * unspecified, which is a different statement from having no record.
       */
      const trimmedContext = context.trim()
      const trimmedSource = source.trim()
      if (trimmedContext || trimmedSource) {
        await addEncounter({
          id: `${word.id}:${Date.now()}`,
          wordId: word.id,
          at: Date.now(),
          context: trimmedContext || undefined,
          source: trimmedSource || undefined,
        })
      }

      toast.success(`${word.word} saved.`)
      setStatus({ ...status, alreadySaved: true })
      onSaved?.()
    } catch {
      toast.error('Could not save that word. Try again.')
    } finally {
      setSaving(false)
    }
  }, [status, saving, context, source, toast, onSaved, initialWord])

  return (
    <div className={styles.screen}>
      {toastHolder}

      <div className={styles.search}>
        <Input.Search
          ref={searchField}
          className={styles.searchInput}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          /*
           * Wrapped rather than passed directly. Ant calls `onSearch` with the
           * originating DOM event as its second argument, which would land in
           * the options parameter and read as an unrecognised option object.
           */
          onSearch={(value) => void search(value)}
          placeholder="Type a word"
          /*
           * A magnifying glass rather than the words "Look up". The screen is
           * already titled Look Up in the header and in the nav, the field is
           * the only thing on it, and the label was restating what the
           * placeholder and the tab both say. The icon also keeps the button square, which leaves the
           * field its full width at 375px.
           */
          enterButton={
            /* An icon alone has no accessible name — a screen reader would
               announce an unlabelled button. The text is visually hidden and
               read aloud. */
            <span aria-label="Look up this word" role="img">
              <SearchOutlined aria-hidden />
            </span>
          }
          size="large"
          loading={status.kind === 'searching'}
          allowClear
          /*
           * Autocapitalise and autocorrect off. A phone keyboard capitalising
           * the first letter of a field is right for a sentence and wrong for a
           * lookup, and autocorrect actively fights an unusual word — which is
           * every word this app is for.
           */
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          /* `search` rather than `text` so the on-screen keyboard shows a
             "search" key instead of a newline. */
          type="search"
        />
      </div>

      {status.kind === 'idle' && (
        <p className={styles.empty}>
          Search a word to find its meaning and save it to your library.
        </p>
      )}

      {status.kind === 'missing' && (
        <div className={styles.state}>
          <p className={styles.stateTitle}>No entry for “{status.word}”</p>
          <p className={styles.stateBody}>
            Check the spelling. Wiktionary also misses very new slang and most
            proper nouns.
          </p>

          {status.suggestions && status.suggestions.length > 0 && (
            <div className={styles.suggestions}>
              <p className={styles.suggestionsLabel}>Did you mean</p>
              <div className={styles.suggestionTerms}>
                {status.suggestions.map((term) => (
                  /* A real button, not a styled tag: it is the primary action of
                     this state, and it must be focusable and announced as
                     something that can be pressed. */
                  <button
                    key={term}
                    type="button"
                    className={styles.suggestion}
                    onClick={() => chooseSuggestion(term)}
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {status.kind === 'offline' && (
        <div className={styles.state}>
          <p className={styles.stateTitle}>Could not reach the dictionary</p>
          <p className={styles.stateBody}>
            Your saved words are all still here. Try this one again in a moment.
          </p>
        </div>
      )}

      {status.kind === 'found' && (
        <Result
          result={status.result}
          alreadySaved={status.alreadySaved}
          saving={saving}
          context={context}
          source={source}
          onContextChange={setContext}
          onSourceChange={setSource}
          onSave={save}
        />
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

interface ResultProps {
  result: LookupResult
  alreadySaved: boolean
  saving: boolean
  context: string
  source: string
  onContextChange: (value: string) => void
  onSourceChange: (value: string) => void
  onSave: () => void
}

function Result({
  result,
  alreadySaved,
  saving,
  context,
  source,
  onContextChange,
  onSourceChange,
  onSave,
}: ResultProps) {
  return (
    <div className={styles.result}>
      <div className={styles.head}>
        <div className={styles.headText}>
          <Word size="title" as="h2">
            {result.word}
          </Word>

          {(result.pronunciation || result.audioUrl) && (
            <div className={styles.meta}>
              {result.pronunciation && (
                <span className={styles.pronunciation}>{result.pronunciation}</span>
              )}
              {result.audioUrl && <AudioButton src={result.audioUrl} word={result.word} />}
            </div>
          )}
        </div>

        {/*
          Save, as a glyph beside the word rather than a labelled button
          floating off its shoulder.

          The decision to keep a word is made on sight, so this has to be
          reachable without scrolling — but the wide button that used to sit
          here was as tall as the word itself and fought it for the top of the
          screen. A round icon button reads as an accent on the word, sits on
          its baseline, and gives the word back the line.

          The label it loses is not lost: the button at the foot of the screen
          spells it out, and this one carries the same sentence as its
          accessible name.
        */}
        <Button
          type={alreadySaved ? 'default' : 'primary'}
          shape="circle"
          size="large"
          className={styles.saveMark}
          icon={alreadySaved ? <CheckOutlined /> : <PlusOutlined />}
          loading={saving}
          disabled={alreadySaved}
          onClick={onSave}
          aria-label={alreadySaved ? `${result.word} is in your library` : `Save ${result.word}`}
          title={alreadySaved ? 'In your library' : 'Save'}
        />
      </div>

      <div className={styles.senses}>
        {/*
          Expanded here, unlike the detail screen. Someone deciding whether to
          keep a word is deciding whether this is the right word, and hiding
          senses behind a disclosure hides the very thing that answers it.
        */}
        <SenseList senses={result.senses} expanded />
      </div>

      {result.synonyms.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Similar</h3>
          <div className={styles.terms}>
            {result.synonyms.map((term) => (
              <Tag key={term}>{term}</Tag>
            ))}
          </div>
        </section>
      )}

      {!alreadySaved && (
        <section className={styles.section}>
          {/*
            Both labels name the actual thing being asked for. "Where you met
            it" and "where it came from" were the earlier wording and both were
            vague in the same way — a generic slot standing in for a sentence
            and a title. The reader has to guess what goes in the box, and the
            placeholder ends up doing the label's job.
          */}
          <h3 className={styles.sectionTitle}>The encounter</h3>
          <div className={styles.fields}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="encounter-context">
                The sentence you read or heard
              </label>
              <Input.TextArea
                id="encounter-context"
                value={context}
                onChange={(event) => onContextChange(event.target.value)}
                placeholder="Paste or type the full sentence"
                autoSize={{ minRows: 2, maxRows: 5 }}
                maxLength={500}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="encounter-source">
                The book, podcast, or person
              </label>
              <Input
                id="encounter-source"
                value={source}
                onChange={(event) => onSourceChange(event.target.value)}
                placeholder="Title, show, or name"
                maxLength={120}
              />
            </div>

            <p className={styles.hint}>
              Both optional. Save without them and add them whenever.
            </p>
          </div>

          {/*
            Save again, at the foot of the screen.

            Not a duplicate by accident. Reading a word runs top to bottom —
            the senses, then the sentence you met it in, then who said it — and
            the reader finishes that at the *bottom*, with the one button on
            the screen now a full scroll behind them. Worse, the encounter
            fields are the last thing they touched, so the save they want is
            the one that includes what they just typed, and the only way to
            reach it was to scroll back past everything they had already read.

            Both buttons do exactly the same thing. Which one gets tapped just
            says whether the word was kept on sight or after its story was
            written down, and the app has no opinion about that.
          */}
          <Button
            type="primary"
            size="large"
            block
            className={styles.saveFull}
            loading={saving}
            onClick={onSave}
          >
            Save to library
          </Button>
        </section>
      )}
    </div>
  )
}


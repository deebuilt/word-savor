import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Input, Tag, message } from 'antd'
import { SearchOutlined, SoundOutlined } from '@ant-design/icons'
import {
  lookupWord,
  toSavedWord,
  WordNotFoundError,
  type LookupResult,
} from '../api/lookup'
import { normaliseWord } from '../api/http'
import { addEncounter, getWord, saveWord } from '../storage/db'
import { Word } from '../components/word/Word'
import { SenseList } from '../components/word/SenseList'
import styles from './LookUp.module.css'

/**
 * Look Up — the capture screen, and the reason the app exists.
 *
 * Search, read, keep. The field stays at the top and results render beneath it
 * rather than on a screen of their own, because the common failure here is a
 * misspelling of a word just overheard — and correcting one should not mean
 * navigating back.
 *
 * **Save sits at the top, beside the word.** Not below the definitions: a word
 * like "bank" carries twelve senses, and putting the only action on the screen
 * underneath all of them turns keeping a word into a scroll. The decision is
 * made on sight.
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
}

type Status =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'found'; result: LookupResult; alreadySaved: boolean }
  | { kind: 'missing'; word: string }
  | { kind: 'offline' }

export function LookUp({ onSaved, initialWord, initialContext }: LookUpProps) {
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
        setStatus(
          error instanceof WordNotFoundError
            ? { kind: 'missing', word: term }
            : { kind: 'offline' },
        )
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
           * already titled Look Up in the nav, the field is the only thing on
           * it, and the label was restating what the placeholder and the tab
           * both say. The icon also keeps the button square, which leaves the
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

        <Button
          type="primary"
          size="large"
          loading={saving}
          disabled={alreadySaved}
          onClick={onSave}
        >
          {alreadySaved ? 'In your library' : 'Save'}
        </Button>
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
        </section>
      )}
    </div>
  )
}

/**
 * Play the pronunciation.
 *
 * The Audio element is created per press rather than held in state. These are
 * one-second clips from a third-party host that is measurably unreliable, and a
 * retained element that failed to load once stays failed — a fresh one retries
 * for free.
 */
function AudioButton({ src, word }: { src: string; word: string }) {
  const play = useCallback(() => {
    // Playback can reject — an unreachable host, or a browser that has not seen
    // a user gesture it accepts. Neither is worth an error message for
    // something entirely supplementary.
    void new Audio(src).play().catch(() => {})
  }, [src])

  return (
    <button
      type="button"
      className={styles.audioButton}
      onClick={play}
      aria-label={`Hear ${word} pronounced`}
    >
      <SoundOutlined />
    </button>
  )
}

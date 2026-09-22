import { useCallback, useEffect, useState } from 'react'
import { Button, Modal, Tag, message } from 'antd'
import type { Encounter, SavedWord, Sense, Usage } from '../types/domain'
import {
  deleteWord,
  getWord,
  listEncounters,
  listSessions,
  listUsages,
  saveWord,
} from '../storage/db'
import { lookupWord, toSavedWord, type LookupResult } from '../api/lookup'
import { rarityLabel } from '../domain/rarity'
import { wordPracticeRecord, type WordPracticeRecord } from '../domain/progress'
import { withFavoriteSense } from '../domain/senses'
import { Word } from '../components/word/Word'
import { SenseList } from '../components/word/SenseList'
import { FavoriteStar } from '../components/word/FavoriteStar'
import { StatusMark } from '../components/word/StatusMark'
import { WordHistory } from '../components/word/WordHistory'
import { RelatedWordCard } from '../components/word/RelatedWordCard'
import { AudioButton } from '../components/word/AudioButton'
import { useHeaderState } from '../app/useHeaderState'
import styles from './WordDetail.module.css'

/**
 * One saved word, in full.
 *
 * Everything the library row leaves out: every sense, where the word was met,
 * its synonyms and associations, its etymology, and the one destructive action
 * in the app.
 *
 * The order is deliberate. What the word means comes first, because that is
 * what someone opening it wants. The encounter comes next — the sentence you
 * found it in is a stronger memory hook than any definition, and it is the only
 * part of this screen that is yours rather than the dictionary's. Everything
 * below that is reference.
 */

interface WordDetailProps {
  wordId: string
  /**
   * The word beneath this one on the navigation stack, if any.
   *
   * Drives the back button's label — "sagacious" rather than a blanket
   * "Library" when Back is really returning to another word's detail, opened
   * from a related-word popup. `undefined` at the floor of the stack, where
   * Back does mean Library.
   */
  backToWordId?: string
  onBack: () => void
  /** Called after a delete, so the library re-reads. */
  onDeleted: () => void
  /** Opens another word's detail screen, on top of this one. */
  onOpenWord: (wordId: string) => void
  /** Told about a save, from this screen or a related-word popup, so counts refresh. */
  onSaved?: () => void
}

export function WordDetail({
  wordId,
  backToWordId,
  onBack,
  onDeleted,
  onOpenWord,
  onSaved,
}: WordDetailProps) {
  const [word, setWord] = useState<SavedWord | undefined>(undefined)
  const [encounters, setEncounters] = useState<Encounter[]>([])
  /**
   * This word's own record: every use logged for it, and how its drills have
   * gone.
   *
   * Read alongside the word rather than from a counter on it, for the reason
   * every other figure in the app is derived: a stored tally drifts the first
   * time a session is deleted or a backup restored, and nothing can tell that
   * it has. Only loaded for a saved word — a live preview of an unsaved one has
   * no history by definition.
   */
  const [usages, setUsages] = useState<Usage[]>([])
  const [record, setRecord] = useState<WordPracticeRecord | undefined>(undefined)
  /**
   * A word not (yet) in the library, shown from a live lookup.
   *
   * Opening a related word's detail must not save it — only a tap on Save may
   * ever write to the library. So when `getWord` comes back empty, this is
   * the fallback: the same screen, sourced from the network instead of
   * storage, with Save offered here rather than assumed.
   */
  const [preview, setPreview] = useState<LookupResult | undefined>(undefined)
  const [previewMissing, setPreviewMissing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toast, toastHolder] = message.useMessage()
  /** The term open in the related-word popup, if any. */
  const [openTerm, setOpenTerm] = useState<string | undefined>(undefined)
  /** The display form of `backToWordId`, for the back button's label. */
  const [backLabel, setBackLabel] = useState<string | undefined>(undefined)

  /*
   * No `setLoading(true)` here to reset between words: the shell keys this
   * component on `wordId`, so opening a different word mounts a fresh copy with
   * `loading` already true. Setting it synchronously inside the effect would
   * schedule a second render on every mount for no change in what is shown.
   */
  useEffect(() => {
    let cancelled = false

    void (async () => {
      const [found, met, used, sessions] = await Promise.all([
        getWord(wordId),
        listEncounters(wordId),
        listUsages(wordId),
        listSessions(),
      ])
      if (cancelled) return

      if (found) {
        setWord(found)
        setEncounters(met)
        setUsages(used)
        setRecord(wordPracticeRecord(wordId, sessions))
        setLoading(false)
        return
      }

      // Not in the library — try the network before concluding it was deleted.
      // Distinguishes "opened from a synonym you haven't kept" from "you came
      // back to a word you removed," which read very differently on screen.
      try {
        const result = await lookupWord(wordId)
        if (cancelled) return
        setPreview(result)
      } catch {
        if (cancelled) return
        setPreviewMissing(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [wordId])

  // Resolves the label for what Back returns to. Storage first, since most
  // words one level up are already saved; a network fallback covers the case
  // of backing out through a whole unsaved chain.
  useEffect(() => {
    if (!backToWordId) {
      setBackLabel(undefined)
      return
    }

    let cancelled = false

    void (async () => {
      const saved = await getWord(backToWordId)
      if (cancelled) return
      if (saved) {
        setBackLabel(saved.word)
        return
      }

      try {
        const result = await lookupWord(backToWordId)
        if (!cancelled) setBackLabel(result.word)
      } catch {
        if (!cancelled) setBackLabel(backToWordId)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [backToWordId])

  const save = useCallback(async () => {
    if (!preview || saving) return
    setSaving(true)

    try {
      const saved = toSavedWord(preview, { source: 'manual' })
      await saveWord(saved)
      toast.success(`${saved.word} saved.`)
      setWord(saved)
      setPreview(undefined)
      onSaved?.()
    } catch {
      toast.error('Could not save that word. Try again.')
    } finally {
      setSaving(false)
    }
  }, [preview, saving, toast, onSaved])

  /*
   * Both stars write immediately and update the screen from the same object
   * they wrote, rather than re-reading the word back.
   *
   * No confirmation and no save button: a favourite is a preference, it is
   * reversible by tapping the same star again, and the filled star *is* the
   * confirmation. A toast on top of that would announce something the reader
   * can already see, every time.
   *
   * The optimistic update is not a shortcut here — `saveWord` is a put of this
   * exact object, so the state and the row in the database are the same value.
   * A failed write is the one case they could part company, and it leaves the
   * screen showing a star that did not save, so it is reverted and named.
   */
  const toggleWordFavorite = useCallback(async () => {
    if (!word) return
    const next = { ...word, favorite: !word.favorite }
    setWord(next)
    try {
      await saveWord(next)
      onSaved?.()
    } catch {
      setWord(word)
      toast.error('Could not save that. Try again.')
    }
  }, [word, toast, onSaved])

  const toggleSenseFavorite = useCallback(
    async (sense: Sense) => {
      if (!word) return
      const next = withFavoriteSense(word, sense)
      setWord(next)
      try {
        await saveWord(next)
        onSaved?.()
      } catch {
        setWord(word)
        toast.error('Could not save that. Try again.')
      }
    },
    [word, toast, onSaved],
  )

  const confirmDelete = useCallback(() => {
    if (!word) return

    Modal.confirm({
      title: `Delete ${word.word}?`,
      /*
       * Names what else goes with it. The encounters and usage history are
       * deleted in the same transaction, and someone who has written three
       * sentences about a word is losing more than a dictionary entry — this is
       * the only warning they get, since nothing is on a server to restore.
       */
      content:
        encounters.length > 0
          ? `This also deletes ${encounters.length} recorded ${
              encounters.length === 1 ? 'encounter' : 'encounters'
            }. It cannot be undone.`
          : 'This cannot be undone.',
      okText: 'Delete',
      okButtonProps: { danger: true },
      cancelText: 'Keep',
      onOk: async () => {
        await deleteWord(word.id)
        toast.success(`${word.word} deleted.`)
        onDeleted()
      },
    })
  }, [word, encounters.length, toast, onDeleted])

  /*
   * The way back moves into the app bar; the word does not.
   *
   * This screen is the one exception to "the header holds the title". The word
   * here is set in display type and it is the *subject*, not a label on the
   * screen — shrinking it into a 16px bar and leaving the page to open on a
   * pronunciation would be reading it out of the app entirely. So the header
   * keeps naming the screen "Library", which is where you are and where Back
   * goes, and the word stays where it can be looked at.
   *
   * What the bar does take is the back button, and with it the trail: the
   * label says "sagacious" rather than "Library" when Back really returns to
   * another word opened from a related-word popup. Drawn as a chevron, spoken
   * in full — see `HeaderState`.
   */
  useHeaderState({
    backLabel: backLabel ? `Back to ${backLabel}` : 'Back to Library',
    onBack,
  })

  if (loading) {
    return (
      <div className={styles.screen}>
        <p className={styles.state}>Opening…</p>
      </div>
    )
  }

  if (!word && !preview) {
    return (
      <div className={styles.screen}>
        <p className={styles.state}>
          {previewMissing
            ? 'No dictionary entry for this word.'
            : 'That word is no longer in your library.'}
        </p>
      </div>
    )
  }

  // Read from whichever source resolved — a saved word, or a live preview of
  // one that has not been kept. Both carry the same reference fields; the
  // difference is what actions are on offer below.
  const shown = word ?? preview!
  const rarity = word ? rarityLabel(word.rarity) : undefined

  return (
    <div className={styles.screen}>
      {toastHolder}

      <div className={styles.head}>
        {/*
          The word and its star share a row, with the star trailing at the edge
          of the column. Only for a saved word: the star records that this one
          is a keeper, and a word that has not been kept cannot be one.
        */}
        <div className={styles.wordRow}>
          <Word size="display" as="h1">
            {shown.word}
          </Word>
          {word && (
            <FavoriteStar
              active={word.favorite}
              size="word"
              label={`Favourite ${word.word}`}
              onToggle={() => void toggleWordFavorite()}
            />
          )}
        </div>

        <div className={styles.meta}>
          {word ? (
            <StatusMark word={word} showLabel />
          ) : (
            <span className={styles.unsaved}>Not in your library</span>
          )}
          {shown.pronunciation && (
            <span className={styles.pronunciation}>{shown.pronunciation}</span>
          )}
          {shown.audioUrl && <AudioButton src={shown.audioUrl} word={shown.word} />}
          {rarity && (
            /* The band, with the frequency behind it on hover rather than on
               screen. "0.109 per million" is unreadable without a scale the
               reader does not have, and the band is the fact worth showing —
               but the measurement is what the band is claiming, so it stays
               reachable rather than hidden. */
            <span
              className={styles.rarity}
              title={
                word?.rarity !== undefined
                  ? `About ${formatFrequency(word.rarity)} per million words`
                  : undefined
              }
            >
              {rarity}
            </span>
          )}
        </div>
      </div>

      <div className={styles.senses}>
        {/* Collapsed for a saved word — it is already yours, and the primary
            sense is what you came back for. Expanded for a preview, same as
            the lookup result: deciding whether to keep it needs to see it. */}
        {/* Stars only for a saved word — same reason as the word star above:
            nothing to record the choice on until the word is kept. */}
        <SenseList
          senses={shown.senses}
          expanded={!word}
          favoriteRef={word?.favoriteSenseRef}
          onToggleFavorite={word ? (sense) => void toggleSenseFavorite(sense) : undefined}
        />
      </div>

      {encounters.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Where you found it</h2>
          <ul className={styles.encounters}>
            {encounters.map((encounter) => (
              <li key={encounter.id}>
                <EncounterEntry encounter={encounter} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {shown.synonyms.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Similar</h2>
          <div className={styles.terms}>
            {shown.synonyms.map((term) => (
              <TermTag key={term} term={term} onOpen={setOpenTerm} />
            ))}
          </div>
        </section>
      )}

      {shown.antonyms.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Opposite</h2>
          <div className={styles.terms}>
            {shown.antonyms.map((term) => (
              <TermTag key={term} term={term} onOpen={setOpenTerm} />
            ))}
          </div>
        </section>
      )}

      {shown.related.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Related</h2>
          <div className={styles.terms}>
            {shown.related.map((term) => (
              <TermTag key={term} term={term} onOpen={setOpenTerm} />
            ))}
          </div>
        </section>
      )}

      {shown.etymology && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Origin</h2>
          <p className={styles.etymology}>{shown.etymology}</p>
        </section>
      )}

      {/*
        This word's own record, and it goes last on purpose.

        Everything above is the word itself — its senses, where it was met, its
        synonyms and origin. That is a continuous read, and dropping a block of
        numbers into the middle of it interrupts exactly the part of the screen
        someone came here for. The stats are about the reader's relationship
        with the word rather than about the word, so they sit after the word has
        been said in full.

        Only for a saved word — a live preview of one that has not been kept has
        no history, and "nothing recorded yet" under it would be answering a
        question nobody asked.
      */}
      {word && record && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Your record</h2>
          <WordHistory record={record} usages={usages} />
        </section>
      )}

      {word ? (
        <div className={styles.danger}>
          <Button danger onClick={confirmDelete}>
            Delete
          </Button>
        </div>
      ) : (
        <div className={styles.saveRow}>
          <Button type="primary" size="large" loading={saving} onClick={() => void save()}>
            Save to library
          </Button>
        </div>
      )}

      <RelatedWordCard
        term={openTerm}
        onClose={() => setOpenTerm(undefined)}
        onOpenDetail={(id) => {
          setOpenTerm(undefined)
          onOpenWord(id)
        }}
        onSaved={onSaved}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */

/**
 * One recorded encounter.
 *
 * The sentence carries the entry when there is one, with the source and date
 * beneath it. When only a source was recorded, that becomes the entry rather
 * than sitting as a caption under nothing.
 */
function EncounterEntry({ encounter }: { encounter: Encounter }) {
  const when = formatDate(encounter.at)
  const attribution = [encounter.source, when].filter(Boolean).join(' · ')

  if (!encounter.context) {
    return <p className={styles.encounterSourceOnly}>{attribution}</p>
  }

  return (
    <>
      <p className={styles.encounterContext}>{encounter.context}</p>
      {attribution && <p className={styles.encounterMeta}>{attribution}</p>}
    </>
  )
}

/**
 * A synonym, antonym, or related term, tappable to open in place.
 *
 * A plain `Tag` with an `onClick` rather than swapping in a `Button` — antd's
 * Tag already renders a `<span>` with a border and a background, which is the
 * exact look this needs; the click handler is the only thing missing.
 */
function TermTag({ term, onOpen }: { term: string; onOpen: (term: string) => void }) {
  return (
    <Tag
      role="button"
      tabIndex={0}
      className={styles.termTag}
      onClick={() => onOpen(term)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen(term)
        }
      }}
    >
      {term}
    </Tag>
  )
}


/**
 * A frequency, at a readable number of digits.
 *
 * Frequencies in this app span four orders of magnitude — "run" is 96 per
 * million and "sesquipedalian" is 0.0085 — so a fixed number of decimal places
 * either rounds the rare words to zero or prints the common ones to a precision
 * the source does not support. Significant digits track the scale instead.
 */
function formatFrequency(frequency: number): string {
  return frequency >= 1 ? frequency.toFixed(1) : frequency.toPrecision(2)
}

/**
 * A date, in the reader's own locale.
 *
 * Hardcoding a format would be wrong for most of the world — 3/4/2026 is two
 * different days depending on where you are reading it. The month is spelled
 * out, which removes the ambiguity entirely.
 */
function formatDate(at: number): string {
  return new Date(at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

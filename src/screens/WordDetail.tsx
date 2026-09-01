import { useCallback, useEffect, useState } from 'react'
import { Button, Modal, Tag, message } from 'antd'
import { ArrowLeftOutlined, SoundOutlined } from '@ant-design/icons'
import type { Encounter, SavedWord } from '../types/domain'
import { deleteWord, getWord, listEncounters, saveWord } from '../storage/db'
import { lookupWord, toSavedWord, type LookupResult } from '../api/lookup'
import { rarityLabel } from '../domain/rarity'
import { Word } from '../components/word/Word'
import { SenseList } from '../components/word/SenseList'
import { StatusMark } from '../components/word/StatusMark'
import { RelatedWordCard } from '../components/word/RelatedWordCard'
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
      const [found, met] = await Promise.all([getWord(wordId), listEncounters(wordId)])
      if (cancelled) return

      if (found) {
        setWord(found)
        setEncounters(met)
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

  if (loading) {
    return (
      <div className={styles.screen}>
        <BackButton label={backLabel} onBack={onBack} />
        <p className={styles.state}>Opening…</p>
      </div>
    )
  }

  if (!word && !preview) {
    return (
      <div className={styles.screen}>
        <BackButton label={backLabel} onBack={onBack} />
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
      <BackButton label={backLabel} onBack={onBack} />

      <div className={styles.head}>
        <Word size="display" as="h1">
          {shown.word}
        </Word>

        <div className={styles.meta}>
          {word ? (
            <StatusMark status={word.status} showLabel />
          ) : (
            <span className={styles.unsaved}>Not in your library</span>
          )}
          {shown.pronunciation && (
            <span className={styles.pronunciation}>{shown.pronunciation}</span>
          )}
          {shown.audioUrl && <AudioButton src={shown.audioUrl} word={shown.word} />}
          {rarity && <span className={styles.rarity}>{rarity}</span>}
        </div>
      </div>

      <div className={styles.senses}>
        {/* Collapsed for a saved word — it is already yours, and the primary
            sense is what you came back for. Expanded for a preview, same as
            the lookup result: deciding whether to keep it needs to see it. */}
        <SenseList senses={shown.senses} expanded={!word} />
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

function BackButton({ label, onBack }: { label?: string; onBack: () => void }) {
  return (
    <button type="button" className={styles.back} onClick={onBack}>
      <ArrowLeftOutlined />
      {label ?? 'Library'}
    </button>
  )
}

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

function AudioButton({ src, word }: { src: string; word: string }) {
  const play = useCallback(() => {
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

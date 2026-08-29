import { useCallback, useEffect, useState } from 'react'
import { Button, Modal, Tag, message } from 'antd'
import { ArrowLeftOutlined, SoundOutlined } from '@ant-design/icons'
import type { Encounter, SavedWord } from '../types/domain'
import { deleteWord, getWord, listEncounters } from '../storage/db'
import { rarityLabel } from '../domain/rarity'
import { Word } from '../components/word/Word'
import { SenseList } from '../components/word/SenseList'
import { StatusMark } from '../components/word/StatusMark'
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
  onBack: () => void
  /** Called after a delete, so the library re-reads. */
  onDeleted: () => void
}

export function WordDetail({ wordId, onBack, onDeleted }: WordDetailProps) {
  const [word, setWord] = useState<SavedWord | undefined>(undefined)
  const [encounters, setEncounters] = useState<Encounter[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, toastHolder] = message.useMessage()

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
      setWord(found)
      setEncounters(met)
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [wordId])

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
        <BackButton onBack={onBack} />
        <p className={styles.state}>Opening…</p>
      </div>
    )
  }

  if (!word) {
    return (
      <div className={styles.screen}>
        <BackButton onBack={onBack} />
        <p className={styles.state}>That word is no longer in your library.</p>
      </div>
    )
  }

  const rarity = rarityLabel(word.rarity)

  return (
    <div className={styles.screen}>
      {toastHolder}
      <BackButton onBack={onBack} />

      <div className={styles.head}>
        <Word size="display" as="h1">
          {word.word}
        </Word>

        <div className={styles.meta}>
          <StatusMark status={word.status} showLabel />
          {word.pronunciation && (
            <span className={styles.pronunciation}>{word.pronunciation}</span>
          )}
          {word.audioUrl && <AudioButton src={word.audioUrl} word={word.word} />}
          {rarity && <span className={styles.rarity}>{rarity}</span>}
        </div>
      </div>

      <div className={styles.senses}>
        {/* Collapsed here, unlike the lookup result: this word is already
            yours, and the primary sense is what you came back for. */}
        <SenseList senses={word.senses} />
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

      {word.synonyms.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Similar</h2>
          <div className={styles.terms}>
            {word.synonyms.map((term) => (
              <Tag key={term}>{term}</Tag>
            ))}
          </div>
        </section>
      )}

      {word.antonyms.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Opposite</h2>
          <div className={styles.terms}>
            {word.antonyms.map((term) => (
              <Tag key={term}>{term}</Tag>
            ))}
          </div>
        </section>
      )}

      {word.related.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Related</h2>
          <div className={styles.terms}>
            {word.related.map((term) => (
              <Tag key={term}>{term}</Tag>
            ))}
          </div>
        </section>
      )}

      {word.etymology && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Origin</h2>
          <p className={styles.etymology}>{word.etymology}</p>
        </section>
      )}

      <div className={styles.danger}>
        <Button danger onClick={confirmDelete}>
          Delete
        </Button>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className={styles.back} onClick={onBack}>
      <ArrowLeftOutlined />
      Library
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

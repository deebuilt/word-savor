import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Modal, message } from 'antd'
import { lookupWord, toSavedWord, WordNotFoundError, type LookupResult } from '../../api/lookup'
import { getWord, saveWord } from '../../storage/db'
import { Word } from './Word'
import { SenseList } from './SenseList'
import styles from './RelatedWordCard.module.css'

/**
 * A synonym, antonym, or related term, opened in place.
 *
 * Tapping a term on the detail screen should not feel like leaving it — this is
 * the "read it, close it, keep reading" the tags exist for. It is deliberately
 * one level deep: the popup shows a plain definition with no tappable terms of
 * its own, because a popup that can open another popup is the lost-context
 * spiral this component exists to prevent.
 *
 * Two ways forward, not one, because they answer different questions. **Save**
 * keeps the word without leaving — the quiet option, for "worth having." **Open
 * full detail** commits to *looking further*, not to keeping it — it navigates
 * to the word's detail screen unsaved, the same way `WordDetail` can preview
 * any word. Neither action implies the other: opening detail must never save
 * behind the reader's back, and it did, once — the button said "open" and it
 * saved. A tap that names one action must only ever do that one action.
 */

interface RelatedWordCardProps {
  /** The term tapped. `undefined` closes the modal — Modal owns its own exit
      animation, so the term stays rendered through it rather than unmounting
      the instant the close button is pressed. */
  term: string | undefined
  onClose: () => void
  /** Opens the word's own detail screen. Called after ensuring it is saved. */
  onOpenDetail: (wordId: string) => void
  /** Told about a save so the library and due-count refresh, same as Look Up. */
  onSaved?: () => void
}

type State =
  | { kind: 'loading' }
  | { kind: 'found'; result: LookupResult; alreadySaved: boolean }
  | { kind: 'missing' }
  | { kind: 'offline' }

export function RelatedWordCard({ term, onClose, onOpenDetail, onSaved }: RelatedWordCardProps) {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [saving, setSaving] = useState(false)
  const [toast, toastHolder] = message.useMessage()

  // Guards against an out-of-order response, same reasoning as Look Up: tapping
  // a second term before the first has resolved must not let the slower answer
  // land after the faster one and show the wrong word.
  const requestId = useRef(0)

  useEffect(() => {
    if (!term) return
    const ticket = ++requestId.current
    setState({ kind: 'loading' })

    void (async () => {
      try {
        const result = await lookupWord(term)
        if (ticket !== requestId.current) return
        const existing = await getWord(result.id)
        if (ticket !== requestId.current) return
        setState({ kind: 'found', result, alreadySaved: Boolean(existing) })
      } catch (error) {
        if (ticket !== requestId.current) return
        setState(error instanceof WordNotFoundError ? { kind: 'missing' } : { kind: 'offline' })
      }
    })()
  }, [term])

  const save = useCallback(async () => {
    if (state.kind !== 'found' || saving) return
    setSaving(true)

    try {
      const word = toSavedWord(state.result, { source: 'manual' })
      await saveWord(word)
      toast.success(`${word.word} saved.`)
      setState({ ...state, alreadySaved: true })
      onSaved?.()
    } catch {
      toast.error('Could not save that word. Try again.')
    } finally {
      setSaving(false)
    }
  }, [state, saving, toast, onSaved])

  const openDetail = useCallback(() => {
    if (state.kind !== 'found') return
    // Navigates only. `WordDetail` can render a word straight from the network
    // when it is not yet saved, so "open" never has to mean "save" too.
    onOpenDetail(state.result.id)
  }, [state, onOpenDetail])

  return (
    <Modal
      /* Keyed on the term so a second tap while one is open — the popup's own
         terms are not tappable, but a fast second tap on the underlying screen
         is still possible — remounts cleanly instead of showing stale state
         under a new title. */
      key={term}
      title={term}
      open={term !== undefined}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
    >
      {toastHolder}

      {state.kind === 'loading' && <p className={styles.state}>Opening…</p>}

      {state.kind === 'missing' && (
        <p className={styles.state}>No dictionary entry for this word.</p>
      )}

      {state.kind === 'offline' && (
        <p className={styles.state}>Could not reach the dictionary. Try again in a moment.</p>
      )}

      {state.kind === 'found' && (
        <div className={styles.body}>
          <div className={styles.head}>
            <Word size="title" as="h3">
              {state.result.word}
            </Word>
            {state.result.pronunciation && (
              <span className={styles.pronunciation}>{state.result.pronunciation}</span>
            )}
          </div>

          {/* Collapsed, same as the detail screen: this is a glance at the word,
              not the place to read all twelve senses of "bank". */}
          <SenseList senses={state.result.senses} />

          <div className={styles.actions}>
            <Button onClick={openDetail}>
              {state.alreadySaved ? 'Open' : 'Open full detail'}
            </Button>
            <Button
              type="primary"
              loading={saving}
              disabled={state.alreadySaved}
              onClick={() => void save()}
            >
              {state.alreadySaved ? 'Saved' : 'Save'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
